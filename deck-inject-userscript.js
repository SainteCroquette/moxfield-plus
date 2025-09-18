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

    // Function to fetch card sets with icons from Scryfall API
    async function fetchCardSets(cardName) {
        // Check cache first
        if (cardSetCache.has(cardName)) {
            return cardSetCache.get(cardName);
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
            
            // Cache the result
            cardSetCache.set(cardName, setList);
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
        // Check global set cache first
        if (setDetailsCache.has(setCode)) {
            return setDetailsCache.get(setCode);
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
            
            // Cache the result
            setDetailsCache.set(setCode, setInfo);
            
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
        
        const displayedSets = sets.slice(0, maxDisplay);
        
        displayedSets.forEach(set => {
            if (set.iconUri) {
                const iconImg = document.createElement('img');
                iconImg.src = set.iconUri;
                iconImg.alt = set.name;
                iconImg.title = `${set.name} (${set.code})`;
                iconImg.className = 'set-icon';
                iconImg.style.cssText = `
                    width: 20px;
                    height: 20px;
                    border-radius: 3px;
                    border: 1px solid #ddd;
                    background: white;
                    transition: transform 0.2s ease;
                `;
                
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
        title.textContent = `Sets in this deck (${allFetchedSets.size} unique sets)`;
        title.style.cssText = `
            font-weight: bold;
            font-size: 14px;
            color: #495057;
            margin-bottom: 8px;
        `;
        summaryContainer.appendChild(title);
        
        const iconsContainer = document.createElement('div');
        iconsContainer.className = 'set-summary-icons';
        iconsContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        `;
        
        // Sort sets by release date (newest first)
        const sortedSets = Array.from(allFetchedSets.values()).sort((a, b) => 
            new Date(b.releaseDate) - new Date(a.releaseDate)
        );
        
        sortedSets.forEach(set => {
            if (set.iconUri) {
                const iconImg = document.createElement('img');
                iconImg.src = set.iconUri;
                iconImg.alt = set.name;
                iconImg.title = `${set.name} (${set.code})`;
                iconImg.className = 'set-summary-icon';
                iconImg.style.cssText = `
                    width: 24px;
                    height: 24px;
                    border-radius: 4px;
                    border: 1px solid #ddd;
                    background: white;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    cursor: pointer;
                `;
                
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

    // Main function to initialize the script
    async function initialize() {
        console.log("Deck Card Injector: Starting...");
        
        // Wait 2 seconds for the page to fully load before starting
        setTimeout(async () => {
            // Add set information to existing cards
            await addSetInfoToCards();
            
            // Start monitoring for new cards
            startCardMonitoring();
        }, 2000); // 2 second delay
    }

    // Start the script
    initialize();
})();
