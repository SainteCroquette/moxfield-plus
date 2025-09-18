// ==UserScript==
// @name         Moxfield Plus - Card Set Information
// @namespace    https://github.com/SainteCroquette
// @version      2.5.1
// @description  Shows set icons for all sets each card was printed in on Moxfield deck lists using Scryfall API with proper rate limiting. Excludes basic lands. Displays real-time summary of all sets just before .deckview section.
// @author       SainteCroquette
// @match        https://www.moxfield.com/decks/*
// @match        www.moxfield.com/decks/*
// @match        moxfield.com/decks/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log("=== Moxfield Plus - Card Set Information script enabled on this page ===");
    console.log("Current URL:", window.location.href);
    console.log("Script started at:", new Date().toISOString());

    // Flag to prevent infinite loops
    let hasProcessedCards = false;
    let isProcessing = false;
    
    // Cache for card set data to avoid duplicate API calls
    const cardSetCache = new Map();
    
    // Global cache for set details to avoid refetching set information
    const setDetailsCache = new Map();
    
    // Rate limiting: delay between API requests (50-100ms as per Scryfall guidelines)
    const API_DELAY = 100; // milliseconds - using higher end of range for safety
    
    // Track last API request time to ensure proper rate limiting
    let lastApiRequestTime = 0;
    
    // Cards to exclude from set fetching (basic lands)
    const EXCLUDED_CARDS = ['Forest', 'Mountain', 'Plains', 'Island', 'Swamp'];
    
    // Track all unique sets that have been fetched for the summary display
    const allFetchedSets = new Map();
    
    // Global state for set filtering
    let activeSetCode = null; // Currently active set for filtering
    let allCardElements = []; // Store all card elements for filtering
    
    // Cache configuration
    const CACHE_VERSION = '1.0.0';
    const CACHE_EXPIRY_DAYS = 30; // Cache expires after 30 days
    const CACHE_PREFIX = 'moxfield_plus_';
    const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB max cache size
    
    // Cache management functions
    function getCacheKey(type, identifier) {
        return `${CACHE_PREFIX}${CACHE_VERSION}_${type}_${identifier}`;
    }
    
    function isCacheValid(timestamp) {
        const now = Date.now();
        const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        return (now - timestamp) < expiryTime;
    }
    
    function getFromCache(type, identifier) {
        try {
            const key = getCacheKey(type, identifier);
            const cached = localStorage.getItem(key);
            if (cached) {
                const data = JSON.parse(cached);
                if (isCacheValid(data.timestamp)) {
                    console.log(`Cache hit for ${type}: ${identifier}`);
                    return data.value;
                } else {
                    console.log(`Cache expired for ${type}: ${identifier}`);
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.warn(`Error reading from cache for ${type}: ${identifier}`, error);
        }
        return null;
    }
    
    function setCache(type, identifier, value) {
        try {
            const key = getCacheKey(type, identifier);
            const data = {
                value: value,
                timestamp: Date.now(),
                version: CACHE_VERSION
            };
            
            const serialized = JSON.stringify(data);
            
            // Check if adding this would exceed cache size limit
            if (serialized.length > MAX_CACHE_SIZE) {
                console.warn(`Cache entry too large for ${type}: ${identifier}, skipping cache`);
                return false;
            }
            
            // Check total cache size and clean up if necessary
            cleanupCache();
            
            localStorage.setItem(key, serialized);
            console.log(`Cached ${type}: ${identifier}`);
            return true;
        } catch (error) {
            console.warn(`Error writing to cache for ${type}: ${identifier}`, error);
            // If storage is full, try to clean up and retry
            if (error.name === 'QuotaExceededError') {
                console.log('Storage quota exceeded, cleaning up cache...');
                cleanupCache(true);
                try {
                    localStorage.setItem(key, serialized);
                    return true;
                } catch (retryError) {
                    console.warn('Failed to cache after cleanup:', retryError);
                }
            }
            return false;
        }
    }
    
    function cleanupCache(force = false) {
        try {
            const keys = Object.keys(localStorage);
            const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
            
            // Calculate current cache size
            let totalSize = 0;
            const cacheEntries = [];
            
            cacheKeys.forEach(key => {
                const value = localStorage.getItem(key);
                if (value) {
                    totalSize += key.length + value.length;
                    try {
                        const data = JSON.parse(value);
                        cacheEntries.push({
                            key: key,
                            timestamp: data.timestamp,
                            size: key.length + value.length
                        });
                    } catch (e) {
                        // Remove invalid cache entries
                        localStorage.removeItem(key);
                    }
                }
            });
            
            // If cache is too large or forced cleanup, remove oldest entries
            if (force || totalSize > MAX_CACHE_SIZE) {
                console.log(`Cache cleanup: ${totalSize} bytes, limit: ${MAX_CACHE_SIZE} bytes`);
                
                // Sort by timestamp (oldest first)
                cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
                
                // Remove oldest entries until we're under the limit
                let removedSize = 0;
                const targetSize = force ? MAX_CACHE_SIZE * 0.5 : MAX_CACHE_SIZE * 0.8; // Remove more if forced
                
                for (const entry of cacheEntries) {
                    if (totalSize - removedSize <= targetSize) break;
                    
                    localStorage.removeItem(entry.key);
                    removedSize += entry.size;
                    console.log(`Removed cache entry: ${entry.key}`);
                }
                
                console.log(`Cache cleanup complete. Removed ${removedSize} bytes`);
            }
        } catch (error) {
            console.warn('Error during cache cleanup:', error);
        }
    }
    
    function clearAllCache() {
        try {
            const keys = Object.keys(localStorage);
            const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
            cacheKeys.forEach(key => localStorage.removeItem(key));
            console.log(`Cleared ${cacheKeys.length} cache entries`);
        } catch (error) {
            console.warn('Error clearing cache:', error);
        }
    }

    // Function to fetch card sets with icons from Scryfall API
    async function fetchCardSets(cardName) {
        // Check memory cache first
        if (cardSetCache.has(cardName)) {
            const cachedData = cardSetCache.get(cardName);
            
            // Add sets to global map for summary display (in case they weren't added before)
            let hasNewSets = false;
            cachedData.forEach(set => {
                if (set.iconUri && !allFetchedSets.has(set.code)) {
                    allFetchedSets.set(set.code, set);
                    hasNewSets = true;
                }
            });
            
            // Update summary in real-time if new sets were discovered
            if (hasNewSets) {
                setTimeout(() => {
                    displaySetSummary();
                }, 100); // Small delay to batch updates
            }
            
            return cachedData;
        }
        
        // Check persistent cache
        const cachedData = getFromCache('card_sets', cardName);
        if (cachedData) {
            // Store in memory cache for faster access
            cardSetCache.set(cardName, cachedData);
            
            // Add sets to global map for summary display
            let hasNewSets = false;
            cachedData.forEach(set => {
                if (set.iconUri && !allFetchedSets.has(set.code)) {
                    allFetchedSets.set(set.code, set);
                    hasNewSets = true;
                }
            });
            
            // Update summary in real-time if new sets were discovered
            if (hasNewSets) {
                setTimeout(() => {
                    displaySetSummary();
                }, 100); // Small delay to batch updates
            }
            
            return cachedData;
        }
        
        const encodedName = encodeURIComponent(cardName);
        const url = `https://api.scryfall.com/cards/search?q=!"${encodedName}"&unique=prints`;
        
        try {
            console.log(`Fetching sets for: ${cardName}`);
            const response = await rateLimitedFetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.object === 'error') {
                throw new Error(`Scryfall API error: ${data.details}`);
            }
            
            // Extract unique sets from the response
            const sets = new Map();
            data.data.forEach(card => {
                if (card.set && card.set_name) {
                    sets.set(card.set, {
                        code: card.set,
                        name: card.set_name,
                        releaseDate: card.released_at
                    });
                }
            });
            
            // Fetch set details with proper rate limiting and caching
            const setDetails = [];
            for (const set of sets.values()) {
                const setInfo = await fetchSetDetails(set.code);
                if (setInfo) {
                    setDetails.push(setInfo);
                } else {
                    // Fallback to basic info if set details fetch failed
                    setDetails.push({
                        ...set,
                        iconUri: null
                    });
                }
            }
            
            const setList = setDetails.sort((a, b) => 
                new Date(b.releaseDate) - new Date(a.releaseDate)
            );
            
            // Track sets in global map for summary display
            let hasNewSets = false;
            setList.forEach(set => {
                if (set.iconUri && !allFetchedSets.has(set.code)) {
                    allFetchedSets.set(set.code, set);
                    hasNewSets = true;
                }
            });
            
            // Update summary in real-time if new sets were discovered
            if (hasNewSets) {
                setTimeout(() => {
                    displaySetSummary();
                }, 100); // Small delay to batch updates
            }
            
            // Cache the result in memory
            cardSetCache.set(cardName, setList);
            
            // Cache the result persistently
            setCache('card_sets', cardName, setList);
            
            return setList;
            
        } catch (error) {
            console.error(`Error fetching sets for ${cardName}:`, error);
            // Cache empty result to avoid retrying failed requests
            cardSetCache.set(cardName, []);
            return [];
        }
    }
    
    // Function to create a delay for rate limiting
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Rate-limited fetch function that ensures proper delays between API calls
    async function rateLimitedFetch(url, options = {}) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastApiRequestTime;
        
        if (timeSinceLastRequest < API_DELAY) {
            const delayNeeded = API_DELAY - timeSinceLastRequest;
            console.log(`Rate limiting: waiting ${delayNeeded}ms before next request to ${url}`);
            await delay(delayNeeded);
        }
        
        lastApiRequestTime = Date.now();
        console.log(`Making API request to: ${url}`);
        
        const response = await fetch(url, {
            ...options,
            headers: {
                'User-Agent': 'MoxfieldPlus/1.0.0',
                'Accept': 'application/json',
                ...options.headers
            }
        });
        
        if (response.status === 429) {
            console.error('Rate limit exceeded! Waiting 5 seconds before continuing...');
            await delay(5000); // Wait 5 seconds if rate limited
        }
        
        return response;
    }
    
    // Function to fetch set details with caching
    async function fetchSetDetails(setCode) {
        // Check memory cache first
        if (setDetailsCache.has(setCode)) {
            return setDetailsCache.get(setCode);
        }
        
        // Check persistent cache
        const cachedData = getFromCache('set_details', setCode);
        if (cachedData) {
            // Store in memory cache for faster access
            setDetailsCache.set(setCode, cachedData);
            return cachedData;
        }
        
        try {
            const response = await rateLimitedFetch(`https://api.scryfall.com/sets/${setCode}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const setData = await response.json();
            
            if (setData.object === 'error') {
                throw new Error(`Scryfall API error: ${setData.details}`);
            }
            
            const setInfo = {
                code: setData.code,
                name: setData.name,
                iconUri: setData.icon_svg_uri,
                releaseDate: setData.released_at
            };
            
            // Cache the result in memory
            setDetailsCache.set(setCode, setInfo);
            
            // Cache the result persistently
            setCache('set_details', setCode, setInfo);
            
            // Add to global sets map and update summary if it's a new set
            if (setInfo && setInfo.iconUri && !allFetchedSets.has(setCode)) {
                allFetchedSets.set(setCode, setInfo);
                setTimeout(() => {
                    displaySetSummary();
                }, 100); // Small delay to batch updates
            }
            
            return setInfo;
            
        } catch (error) {
            console.warn(`Failed to fetch set details for ${setCode}:`, error);
            // Cache empty result to avoid retrying failed requests
            setDetailsCache.set(setCode, null);
            return null;
        }
    }
    
    // Function to handle set icon clicks
    function handleSetIconClick(setCode, setIcon) {
        // Toggle active state
        if (activeSetCode === setCode) {
            // Clear filter
            activeSetCode = null;
            clearSetFilter();
        } else {
            // Set new active filter
            activeSetCode = setCode;
            applySetFilter(setCode);
        }
        
        // Refresh set icons to prioritize active set
        refreshSetIcons();
        
        // Update visual states of all set icons
        updateSetIconStates();
    }
    
    // Function to update visual states of all set icons
    function updateSetIconStates() {
        // Update all set icons in card displays
        document.querySelectorAll('.set-icon').forEach(icon => {
            const setCode = icon.getAttribute('data-set-code');
            if (setCode) {
                if (activeSetCode === null) {
                    // No filter active - show all icons normally
                    icon.style.opacity = '1';
                    icon.style.filter = 'none';
                    icon.style.border = '1px solid #ddd';
                } else if (setCode === activeSetCode) {
                    // This is the active set
                    icon.style.opacity = '1';
                    icon.style.filter = 'none';
                    icon.style.border = '2px solid #007bff';
                    icon.style.boxShadow = '0 0 5px rgba(0, 123, 255, 0.5)';
                } else {
                    // This is not the active set - gray it out
                    icon.style.opacity = '0.3';
                    icon.style.filter = 'grayscale(100%)';
                    icon.style.border = '1px solid #ccc';
                    icon.style.boxShadow = 'none';
                }
            }
        });
        
        // Update all set icons in summary display
        document.querySelectorAll('.set-summary-icon').forEach(icon => {
            const setCode = icon.getAttribute('data-set-code');
            if (setCode) {
                if (activeSetCode === null) {
                    // No filter active - show all icons normally
                    icon.style.opacity = '1';
                    icon.style.filter = 'none';
                    icon.style.border = '1px solid #ddd';
                    icon.style.boxShadow = 'none';
                } else if (setCode === activeSetCode) {
                    // This is the active set
                    icon.style.opacity = '1';
                    icon.style.filter = 'none';
                    icon.style.border = '2px solid #007bff';
                    icon.style.boxShadow = '0 0 5px rgba(0, 123, 255, 0.5)';
                } else {
                    // This is not the active set - gray it out
                    icon.style.opacity = '0.3';
                    icon.style.filter = 'grayscale(100%)';
                    icon.style.border = '1px solid #ccc';
                    icon.style.boxShadow = 'none';
                }
            }
        });
    }
    
    // Function to apply set filter
    function applySetFilter(setCode) {
        console.log(`Filtering cards by set: ${setCode}`);
        
        allCardElements.forEach(cardItem => {
            const element = cardItem.element;
            const sets = cardItem.sets || [];
            
            // Check if this card has the active set
            const hasActiveSet = sets.some(set => set && set.code === setCode);
            
            if (hasActiveSet) {
                // Show the card
                element.style.display = '';
                element.style.opacity = '1';
            } else {
                // Hide the card
                element.style.display = 'none';
            }
        });
    }
    
    // Function to clear set filter
    function clearSetFilter() {
        console.log('Clearing set filter');
        
        allCardElements.forEach(cardItem => {
            const element = cardItem.element;
            element.style.display = '';
            element.style.opacity = '1';
        });
    }
    
    // Function to create set icons container
    function createSetIconsContainer(sets, maxDisplay = 8) {
        if (sets.length === 0) {
            return null;
        }
        
        const container = document.createElement('div');
        container.className = 'set-icons-container';
        container.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            margin-top: 4px;
            align-items: center;
        `;
        
        // Sort sets to prioritize active set first
        const sortedSets = [...sets].sort((a, b) => {
            if (activeSetCode && a.code === activeSetCode) return -1;
            if (activeSetCode && b.code === activeSetCode) return 1;
            return 0;
        });
        
        const displayedSets = sortedSets.slice(0, maxDisplay);
        
        displayedSets.forEach(set => {
            if (set.iconUri) {
                const iconImg = document.createElement('img');
                iconImg.src = set.iconUri;
                iconImg.alt = set.name;
                iconImg.title = `${set.name} (${set.code}) - Click to filter by this set`;
                iconImg.className = 'set-icon';
                iconImg.setAttribute('data-set-code', set.code);
                iconImg.style.cssText = `
                    width: 20px;
                    height: 20px;
                    border-radius: 3px;
                    border: 1px solid #ddd;
                    background: white;
                    transition: transform 0.2s ease;
                    cursor: pointer;
                `;
                
                // Add click handler
                iconImg.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSetIconClick(set.code, iconImg);
                });
                
                // Add hover effect
                iconImg.addEventListener('mouseenter', () => {
                    iconImg.style.transform = 'scale(1.1)';
                    iconImg.style.zIndex = '10';
                    iconImg.style.position = 'relative';
                });
                
                iconImg.addEventListener('mouseleave', () => {
                    iconImg.style.transform = 'scale(1)';
                    iconImg.style.zIndex = '1';
                });
                
                // Add error handling for failed image loads
                iconImg.addEventListener('error', () => {
                    console.warn(`Failed to load icon for set: ${set.name}`);
                    iconImg.style.display = 'none';
                });
                
                container.appendChild(iconImg);
            }
        });
        
        // Add "+X more" indicator if there are more sets
        if (sets.length > maxDisplay) {
            const moreIndicator = document.createElement('span');
            moreIndicator.textContent = `+${sets.length - maxDisplay}`;
            moreIndicator.className = 'more-sets-indicator';
            moreIndicator.style.cssText = `
                font-size: 0.7em;
                color: #666;
                margin-left: 4px;
                font-weight: bold;
            `;
            moreIndicator.title = `${sets.length - maxDisplay} more sets`;
            container.appendChild(moreIndicator);
        }
        
        return container;
    }
    
    // Function to create summary display of all fetched sets
    function createSetSummary() {
        if (allFetchedSets.size === 0) {
            return null;
        }
        
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'set-summary-container';
        summaryContainer.style.cssText = `
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 12px 16px;
            margin: 16px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        
        const title = document.createElement('div');
        title.style.cssText = `
            font-weight: bold;
            font-size: 14px;
            color: #495057;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        const titleText = document.createElement('span');
        titleText.textContent = `Sets in this deck (${allFetchedSets.size} unique sets)`;
        title.appendChild(titleText);
        
        // Add control buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
        `;
        
        // Add clear filter button if a filter is active
        if (activeSetCode) {
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear Filter';
            clearButton.style.cssText = `
                background: #dc3545;
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                transition: background-color 0.2s ease;
            `;
            clearButton.addEventListener('click', () => {
                activeSetCode = null;
                clearSetFilter();
                refreshSetIcons();
                updateSetIconStates();
                // Refresh the summary to update the title
                setTimeout(() => {
                    displaySetSummary();
                }, 100);
            });
            clearButton.addEventListener('mouseenter', () => {
                clearButton.style.backgroundColor = '#c82333';
            });
            clearButton.addEventListener('mouseleave', () => {
                clearButton.style.backgroundColor = '#dc3545';
            });
            buttonContainer.appendChild(clearButton);
        }
        
        // Add cache management button
        const cacheButton = document.createElement('button');
        cacheButton.textContent = 'Clear Cache';
        cacheButton.title = 'Clear all cached set data (will re-download on next visit)';
        cacheButton.style.cssText = `
            background: #6c757d;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s ease;
        `;
        cacheButton.addEventListener('click', () => {
            if (confirm('Clear all cached set data? This will re-download set information on next visit.')) {
                clearAllCache();
                // Clear memory caches too
                cardSetCache.clear();
                setDetailsCache.clear();
                allFetchedSets.clear();
                console.log('All caches cleared');
                // Refresh the page to reload everything
                setTimeout(() => {
                    location.reload();
                }, 1000);
            }
        });
        cacheButton.addEventListener('mouseenter', () => {
            cacheButton.style.backgroundColor = '#5a6268';
        });
        cacheButton.addEventListener('mouseleave', () => {
            cacheButton.style.backgroundColor = '#6c757d';
        });
        buttonContainer.appendChild(cacheButton);
        
        if (buttonContainer.children.length > 0) {
            title.appendChild(buttonContainer);
        }
        
        summaryContainer.appendChild(title);
        
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'set-summary-icons';
        iconsContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        `;
        
        // Sort sets by release date (newest first), but prioritize active set
        const sortedSets = Array.from(allFetchedSets.values()).sort((a, b) => {
            // If there's an active set, prioritize it first
            if (activeSetCode) {
                if (a.code === activeSetCode) return -1;
                if (b.code === activeSetCode) return 1;
            }
            // Otherwise sort by release date (newest first)
            return new Date(b.releaseDate) - new Date(a.releaseDate);
        });
        
        sortedSets.forEach(set => {
            if (set.iconUri) {
                const iconImg = document.createElement('img');
                iconImg.src = set.iconUri;
                iconImg.alt = set.name;
                iconImg.title = `${set.name} (${set.code}) - Click to filter by this set`;
                iconImg.className = 'set-summary-icon';
                iconImg.setAttribute('data-set-code', set.code);
                iconImg.style.cssText = `
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    border: 1px solid #ddd;
                    background: white;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    cursor: pointer;
                `;
                
                // Add click handler
                iconImg.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSetIconClick(set.code, iconImg);
                });
                
                // Add hover effect
                iconImg.addEventListener('mouseenter', () => {
                    iconImg.style.transform = 'scale(1.1)';
                    iconImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    iconImg.style.zIndex = '10';
                    iconImg.style.position = 'relative';
                });
                
                iconImg.addEventListener('mouseleave', () => {
                    iconImg.style.transform = 'scale(1)';
                    iconImg.style.boxShadow = 'none';
                    iconImg.style.zIndex = '1';
                });
                
                // Add error handling for failed image loads
                iconImg.addEventListener('error', () => {
                    console.warn(`Failed to load summary icon for set: ${set.name}`);
                    iconImg.style.display = 'none';
                });
                
                iconsContainer.appendChild(iconImg);
            }
        });
        
        summaryContainer.appendChild(iconsContainer);
        return summaryContainer;
    }
    
    // Function to find the insertion point just before the deckview section
    function findSummaryInsertionPoint() {
        // Target the .deckview section and insert just before it
        const deckviewSection = document.querySelector('.deckview');
        if (deckviewSection) {
            return {
                parent: deckviewSection.parentElement,
                reference: deckviewSection
            };
        }
        
        // Fallback to body if deckview not found
        console.warn('Could not find .deckview section, falling back to body');
        return {
            parent: document.body,
            reference: null
        };
    }
    
    // Function to display the set summary
    function displaySetSummary() {
        // Remove existing summary if it exists
        const existingSummary = document.querySelector('.set-summary-container');
        if (existingSummary) {
            existingSummary.remove();
        }
        
        const summary = createSetSummary();
        if (summary) {
            const insertionPoint = findSummaryInsertionPoint();
            if (insertionPoint && insertionPoint.parent) {
                if (insertionPoint.reference) {
                    // Insert just before the deckview section
                    insertionPoint.parent.insertBefore(summary, insertionPoint.reference);
                    console.log(`📊 Displayed summary with ${allFetchedSets.size} unique sets just before .deckview section`);
                } else {
                    // Fallback: append to parent
                    insertionPoint.parent.appendChild(summary);
                    console.log(`📊 Displayed summary with ${allFetchedSets.size} unique sets (fallback location)`);
                }
            }
        }
    }

    // Function to find card names using the correct selectors
    function findCardNames() {
        const cardElements = [];
        const processedCards = new Set(); // Track processed cards to avoid duplicates
        
        // Category names to exclude (these are section headers, not cards)
        const categoryNames = ['Commander', 'Lands', 'Artifacts', 'Creatures', 'Enchantments', 'Instants', 'Sorceries', 'Planeswalkers', 'Sideboard'];
        
        // Selector 1: Deck list cards - target the parent link, not individual spans
        const deckListLinks = document.querySelectorAll('.table-deck-row-link');
        deckListLinks.forEach((link, index) => {
            // Get the complete card name from the link
            const fullText = link.textContent.trim();
            
            // Check if this is a category header (contains pattern like "Planeswalkers (2)")
            const isCategoryHeader = /^(Planeswalkers|Creatures|Lands|Artifacts|Enchantments|Instants|Sorceries|Battles|Planeswalkers|Commander|Sideboard)\s*\(\d+\)$/.test(fullText);
            
            // Only include if it's not a category name, not a category header, and not already processed
            if (!categoryNames.includes(fullText) && !isCategoryHeader && !processedCards.has(fullText)) {
                cardElements.push({
                    element: link,
                    text: fullText,
                    type: 'deck-list',
                    selector: '.table-deck-row-link'
                });
                processedCards.add(fullText);
            }
        });
        
        // Selector 2: Sample hand cards (like Sol Ring)
        const sampleHandCards = document.querySelectorAll('.samplehand-card[alt]');
        sampleHandCards.forEach((card, index) => {
            const text = card.getAttribute('alt');
            // Only include if it's not a category name and not already processed
            if (!categoryNames.includes(text) && !processedCards.has(text)) {
                cardElements.push({
                    element: card,
                    text: text,
                    type: 'sample-hand',
                    selector: '.samplehand-card[alt]'
                });
                processedCards.add(text);
            }
        });
        
        // Selector 3: Commander cards - target parent containers
        const commanderLinks = document.querySelectorAll('.commander a, .commander-card a');
        commanderLinks.forEach((link, index) => {
            const text = link.textContent.trim();
            
            // Check if this is a category header (contains pattern like "Planeswalkers (2)")
            const isCategoryHeader = /^(Planeswalkers|Creatures|Lands|Artifacts|Enchantments|Instants|Sorceries|Battles|Planeswalkers|Commander|Sideboard)\s*\(\d+\)$/.test(text);
            
            // Only include if it's not a category name, not a category header, and not already processed
            if (!categoryNames.includes(text) && !isCategoryHeader && !processedCards.has(text)) {
                cardElements.push({
                    element: link,
                    text: text,
                    type: 'commander',
                    selector: '.commander a, .commander-card a'
                });
                processedCards.add(text);
            }
        });
        
        console.log(`Found ${cardElements.length} card elements to process`);
        return cardElements;
    }

    // Function to add set information next to card names
    async function addSetInfoToCards() {
        // Prevent infinite loops
        if (isProcessing) {
            return 0;
        }
        
        if (hasProcessedCards) {
            return 0;
        }
        
        isProcessing = true;
        
        // Find card names using the correct selectors
        const cardElements = findCardNames();
        
        if (cardElements.length === 0) {
            isProcessing = false;
            return 0;
        }
        
        // Store card elements globally for filtering
        allCardElements = cardElements;
        
        let cardsProcessed = 0;
        
        // Process cards sequentially with rate limiting
        for (let i = 0; i < cardElements.length; i++) {
            const cardItem = cardElements[i];
            const element = cardItem.element;
            const text = cardItem.text;
            const type = cardItem.type;
            
            // Check if we already added set info to this card
            if (!element.querySelector('.set-icons-container') && !element.querySelector('.set-info')) {
                
                // Check if this card should be excluded
                if (EXCLUDED_CARDS.includes(text)) {
                    // Show "excluded" message for basic lands
                    const excludedSpan = document.createElement('span');
                    excludedSpan.textContent = 'excluded';
                    excludedSpan.className = 'set-info excluded';
                    excludedSpan.style.cssText = `
                        color: #999;
                        font-size: 0.8em;
                        margin-left: 4px;
                        font-style: italic;
                        background: #f0f0f0;
                        padding: 2px 6px;
                        border-radius: 3px;
                    `;
                    
                    if (type === 'sample-hand') {
                        const parent = element.parentElement;
                        if (parent) {
                            parent.appendChild(excludedSpan);
                        } else {
                            element.parentNode.insertBefore(excludedSpan, element.nextSibling);
                        }
                    } else {
                        element.appendChild(excludedSpan);
                    }
                    
                    cardsProcessed++;
                    continue; // Skip to next card
                }
                
                // Add loading indicator
                const loadingSpan = document.createElement('span');
                loadingSpan.textContent = ' Loading set icons...';
                loadingSpan.className = 'set-info loading';
                loadingSpan.style.cssText = `
                    color: #666;
                    font-size: 0.8em;
                    margin-left: 4px;
                    font-style: italic;
                `;
                
                // Add loading indicator to the element
                if (type === 'sample-hand') {
                    const parent = element.parentElement;
                    if (parent) {
                        parent.appendChild(loadingSpan);
                    } else {
                        element.parentNode.insertBefore(loadingSpan, element.nextSibling);
                    }
                } else {
                    element.appendChild(loadingSpan);
                }
                
                try {
                    // Fetch sets for this card
                    const sets = await fetchCardSets(text);
                    
                    // Store sets data with the card element for filtering
                    cardItem.sets = sets;
                    
                    // Remove loading indicator
                    loadingSpan.remove();
                    
                    if (sets.length > 0) {
                        // Create set icons container
                        const iconsContainer = createSetIconsContainer(sets);
                        
                        if (iconsContainer) {
                            // Add set icons to the element
                            if (type === 'sample-hand') {
                                const parent = element.parentElement;
                                if (parent) {
                                    parent.appendChild(iconsContainer);
                                } else {
                                    element.parentNode.insertBefore(iconsContainer, element.nextSibling);
                                }
                            } else {
                                element.appendChild(iconsContainer);
                            }
                        }
                    } else {
                        // Show "No sets found" message
                        const noSetsSpan = document.createElement('span');
                        noSetsSpan.textContent = 'No sets found';
                        noSetsSpan.className = 'set-info no-sets';
                        noSetsSpan.style.cssText = `
                            color: #999;
                            font-size: 0.8em;
                            margin-left: 4px;
                            font-style: italic;
                        `;
                        
                        if (type === 'sample-hand') {
                            const parent = element.parentElement;
                            if (parent) {
                                parent.appendChild(noSetsSpan);
                            } else {
                                element.parentNode.insertBefore(noSetsSpan, element.nextSibling);
                            }
                        } else {
                            element.appendChild(noSetsSpan);
                        }
                    }
                    
                    cardsProcessed++;
                    
                } catch (error) {
                    console.error(`Error processing card ${text}:`, error);
                    // Remove loading indicator and add error message
                    loadingSpan.remove();
                    
                    const errorSpan = document.createElement('span');
                    errorSpan.textContent = 'Error loading sets';
                    errorSpan.className = 'set-info error';
                    errorSpan.style.cssText = `
                        color: #ff6b6b;
                        font-size: 0.8em;
                        margin-left: 4px;
                        font-style: italic;
                    `;
                    
                    if (type === 'sample-hand') {
                        const parent = element.parentElement;
                        if (parent) {
                            parent.appendChild(errorSpan);
                        } else {
                            element.parentNode.insertBefore(errorSpan, element.nextSibling);
                        }
                    } else {
                        element.appendChild(errorSpan);
                    }
                }
            }
        }

        if (cardsProcessed > 0) {
            console.log(`✅ Processed ${cardsProcessed} cards (set icons + excluded cards)`);
            hasProcessedCards = true; // Mark as processed
            
            // Update set icon states after processing
            setTimeout(() => {
                updateSetIconStates();
            }, 100);
            
            // Display summary after processing cards (if we have sets)
            if (allFetchedSets.size > 0) {
                setTimeout(() => {
                    displaySetSummary();
                }, 200);
            }
        }

        isProcessing = false;
        return cardsProcessed;
    }

    // Function to monitor for new cards being added (for dynamic content)
    function startCardMonitoring() {
        const observer = new MutationObserver((mutations) => {
            // Only check if we haven't processed cards yet
            if (hasProcessedCards) {
                return;
            }
            
            let shouldCheck = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Only check if significant content was added (not just our injected elements)
                    const hasSignificantContent = Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === Node.ELEMENT_NODE && 
                        !node.classList?.contains('set-info') &&
                        !node.classList?.contains('set-icons-container') &&
                        !node.classList?.contains('excluded')
                    );
                    if (hasSignificantContent) {
                        shouldCheck = true;
                    }
                }
            });
            
            if (shouldCheck) {
                addSetInfoToCards();
            }
        });

        // Start observing the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return observer;
    }
    
    // Function to refresh set icons when active set changes
    function refreshSetIcons() {
        // Recreate all set icon containers to prioritize active set
        document.querySelectorAll('.set-icons-container').forEach(container => {
            const parent = container.parentElement;
            const cardElement = parent.closest('.table-deck-row-link, .samplehand-card, .commander a, .commander-card a');
            
            if (cardElement) {
                // Find the card name
                const cardName = cardElement.textContent.trim() || cardElement.getAttribute('alt');
                
                // Find the card item in our stored data
                const cardItem = allCardElements.find(item => item.text === cardName);
                
                if (cardItem && cardItem.sets) {
                    // Remove old container
                    container.remove();
                    
                    // Create new container with updated priority
                    const newContainer = createSetIconsContainer(cardItem.sets);
                    if (newContainer) {
                        parent.appendChild(newContainer);
                    }
                }
            }
        });
        
        // Refresh the summary display to reorder icons and update visual states
        setTimeout(() => {
            displaySetSummary();
            // Update visual states after summary is refreshed
            updateSetIconStates();
        }, 100);
    }

    // Main function to initialize the script
    async function initialize() {
        console.log("Deck Card Injector: Starting...");
        
        // Initialize cache
        console.log("Initializing cache system...");
        cleanupCache(); // Clean up any expired or oversized cache entries
        
        // Load cached set details into memory for faster access
        loadCachedSetDetails();
        
        // Log cache statistics
        logCacheStatistics();
        
        // Wait 2 seconds for the page to fully load before starting
        setTimeout(async () => {
            // Add set information to existing cards
            await addSetInfoToCards();
            
            // Start monitoring for new cards
            startCardMonitoring();
        }, 2000); // 2 second delay
    }
    
    // Function to load cached set details into memory
    function loadCachedSetDetails() {
        try {
            const keys = Object.keys(localStorage);
            const setDetailKeys = keys.filter(key => 
                key.startsWith(CACHE_PREFIX) && 
                key.includes('_set_details_')
            );
            
            let loadedCount = 0;
            setDetailKeys.forEach(key => {
                try {
                    const cached = localStorage.getItem(key);
                    if (cached) {
                        const data = JSON.parse(cached);
                        if (isCacheValid(data.timestamp)) {
                            const setCode = key.split('_set_details_')[1];
                            setDetailsCache.set(setCode, data.value);
                            loadedCount++;
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to load cached set details from ${key}:`, e);
                }
            });
            
            console.log(`Loaded ${loadedCount} cached set details into memory`);
        } catch (error) {
            console.warn('Error loading cached set details:', error);
        }
    }
    
    
    // Function to log cache statistics
    function logCacheStatistics() {
        try {
            const keys = Object.keys(localStorage);
            const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
            
            let totalSize = 0;
            let cardSetsCount = 0;
            let setDetailsCount = 0;
            let expiredCount = 0;
            
            cacheKeys.forEach(key => {
                const value = localStorage.getItem(key);
                if (value) {
                    totalSize += key.length + value.length;
                    
                    if (key.includes('_card_sets_')) {
                        cardSetsCount++;
                    } else if (key.includes('_set_details_')) {
                        setDetailsCount++;
                    }
                    
                    try {
                        const data = JSON.parse(value);
                        if (!isCacheValid(data.timestamp)) {
                            expiredCount++;
                        }
                    } catch (e) {
                        // Invalid cache entry
                    }
                }
            });
            
            console.log(`📊 Cache Statistics:`);
            console.log(`   Total entries: ${cacheKeys.length}`);
            console.log(`   Card sets: ${cardSetsCount}`);
            console.log(`   Set details: ${setDetailsCount}`);
            console.log(`   Expired entries: ${expiredCount}`);
            console.log(`   Total size: ${(totalSize / 1024).toFixed(2)} KB`);
            console.log(`   Cache limit: ${(MAX_CACHE_SIZE / 1024).toFixed(2)} KB`);
        } catch (error) {
            console.warn('Error logging cache statistics:', error);
        }
    }

    // Start the script
    initialize();
})();
