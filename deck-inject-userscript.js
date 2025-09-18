// ==UserScript==
// @name         Moxfield Plus - Card Set Information
// @namespace    https://github.com/SainteCroquette
// @version      2.0.0
// @description  Shows all sets each card was printed in on Moxfield deck lists using Scryfall API
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
    
    // Rate limiting: delay between API requests (50-100ms as per Scryfall guidelines)
    const API_DELAY = 75; // milliseconds

    // Function to fetch card sets from Scryfall API
    async function fetchCardSets(cardName) {
        // Check cache first
        if (cardSetCache.has(cardName)) {
            return cardSetCache.get(cardName);
        }
        
        const encodedName = encodeURIComponent(cardName);
        const url = `https://api.scryfall.com/cards/search?q=!"${encodedName}"&unique=prints`;
        
        try {
            console.log(`Fetching sets for: ${cardName}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'MoxfieldPlus/1.0.0',
                    'Accept': 'application/json'
                }
            });
            
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
            
            const setList = Array.from(sets.values()).sort((a, b) => 
                new Date(b.releaseDate) - new Date(a.releaseDate)
            );
            
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
    
    // Function to format sets for display
    function formatSetsForDisplay(sets, maxDisplay = 5) {
        if (sets.length === 0) {
            return 'No sets found';
        }
        
        if (sets.length <= maxDisplay) {
            return sets.map(set => `${set.name} (${set.code})`).join(', ');
        }
        
        const displayed = sets.slice(0, maxDisplay);
        const remaining = sets.length - maxDisplay;
        return displayed.map(set => `${set.name} (${set.code})`).join(', ') + 
               ` +${remaining} more`;
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
            if (!element.querySelector('.set-info') && !element.textContent.includes('Sets:')) {
                // Add loading indicator
                const loadingSpan = document.createElement('span');
                loadingSpan.textContent = ' Loading sets...';
                loadingSpan.className = 'set-info loading';
                loadingSpan.style.color = '#666';
                loadingSpan.style.fontSize = '0.8em';
                loadingSpan.style.marginLeft = '4px';
                
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
                    
                    // Create set info display
                    const setInfoSpan = document.createElement('span');
                    setInfoSpan.className = 'set-info';
                    setInfoSpan.style.color = '#2c5aa0';
                    setInfoSpan.style.fontSize = '0.8em';
                    setInfoSpan.style.marginLeft = '4px';
                    setInfoSpan.style.display = 'block';
                    setInfoSpan.style.lineHeight = '1.2';
                    
                    if (sets.length > 0) {
                        const formattedSets = formatSetsForDisplay(sets);
                        setInfoSpan.innerHTML = `<strong>Sets:</strong> ${formattedSets}`;
                    } else {
                        setInfoSpan.innerHTML = '<strong>Sets:</strong> <em>No sets found</em>';
                    }
                    
                    // Add set info to the element
                    if (type === 'sample-hand') {
                        const parent = element.parentElement;
                        if (parent) {
                            parent.appendChild(setInfoSpan);
                        } else {
                            element.parentNode.insertBefore(setInfoSpan, element.nextSibling);
                        }
                    } else {
                        element.appendChild(setInfoSpan);
                    }
                    
                    cardsProcessed++;
                    
                } catch (error) {
                    console.error(`Error processing card ${text}:`, error);
                    // Remove loading indicator and add error message
                    loadingSpan.remove();
                    
                    const errorSpan = document.createElement('span');
                    errorSpan.textContent = ' Error loading sets';
                    errorSpan.className = 'set-info error';
                    errorSpan.style.color = '#ff6b6b';
                    errorSpan.style.fontSize = '0.8em';
                    errorSpan.style.marginLeft = '4px';
                    
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
                
                // Rate limiting: delay between API requests
                if (i < cardElements.length - 1) {
                    await delay(API_DELAY);
                }
            }
        }

        if (cardsProcessed > 0) {
            console.log(`✅ Added set information to ${cardsProcessed} cards`);
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
                        !node.classList?.contains('set-info')
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
