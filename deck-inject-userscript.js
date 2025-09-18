// ==UserScript==
// @name         Deck Card Injector
// @namespace    https://github.com/SainteCroquette
// @version      1.0.0
// @description  Adds 'INJECT' text next to every card name in Moxfield deck lists
// @author       You
// @match        https://www.moxfield.com/decks/*
// @match        www.moxfield.com/decks/*
// @match        moxfield.com/decks/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log("=== Deck Card Injector script enabled on this page ===");
    console.log("Current URL:", window.location.href);
    console.log("Script started at:", new Date().toISOString());

    // Flag to prevent infinite loops
    let hasProcessedCards = false;
    let isProcessing = false;


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

    // Function to add 'INJECT' text next to card names
    function addInjectToCards() {
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
        
        let cardsFound = 0;
        
        cardElements.forEach((cardItem, index) => {
            const element = cardItem.element;
            const text = cardItem.text;
            const type = cardItem.type;
            
            // Check if we already added 'INJECT' to this card
            if (!element.querySelector('.inject-text') && !element.textContent.includes('INJECT')) {
                const injectSpan = document.createElement('span');
                injectSpan.textContent = ' INJECT';
                injectSpan.className = 'inject-text';
                injectSpan.style.color = '#ff6b6b';
                injectSpan.style.fontWeight = 'bold';
                injectSpan.style.marginLeft = '4px';
                
                // For sample hand cards (img elements), we need to add the text after the image
                if (type === 'sample-hand') {
                    // Find the parent container and add text after the image
                    const parent = element.parentElement;
                    if (parent) {
                        parent.appendChild(injectSpan);
                    } else {
                        element.parentNode.insertBefore(injectSpan, element.nextSibling);
                    }
                } else {
                    // For deck list and commander cards (link elements), append to the link
                    element.appendChild(injectSpan);
                }
                
                cardsFound++;
            }
        });

        if (cardsFound > 0) {
            console.log(`✅ Added 'INJECT' to ${cardsFound} cards`);
            hasProcessedCards = true; // Mark as processed
        }

        isProcessing = false;
        return cardsFound;
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
                        !node.classList?.contains('inject-text')
                    );
                    if (hasSignificantContent) {
                        shouldCheck = true;
                    }
                }
            });
            
            if (shouldCheck) {
                addInjectToCards();
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
    function initialize() {
        console.log("Deck Card Injector: Starting...");
        
        // Wait 2 seconds for the page to fully load before starting
        setTimeout(() => {
            // Add 'INJECT' to existing cards
            addInjectToCards();
            
            // Start monitoring for new cards
            startCardMonitoring();
        }, 2000); // 2 second delay
    }

    // Start the script
    initialize();
})();
