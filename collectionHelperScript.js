// ==UserScript==
// @name         Collection helper
// @namespace    https://github.com/SainteCroquette
// @version      2024-08-17
// @description  try to take over the world!
// @author       You
// @match        https://www.moxfield.com/binders/*
// @match        https://www.moxfield.com/collection
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const SEARCH_INPUT_SELECTOR = '#collectionSearch';
    const MODAL_SAVE_BUTTON_SELECTOR = '.modal-footer .btn:nth-child(2)';


    //update this to match your desired shortcut, see event.key at https://keycode.info/
    //const TOGGLE_FOIL_SHORTCUT = event => event.shiftKey && event.key === 'F';
    const TOGGLE_FOIL_SHORTCUT = event => event.key === 'End';

    //update this to match your default query, then reload page
    const DEFAULT_QUERY = 's:one cn:';

    console.log("Collection Helper script enabled.");

    // helper function to wait for an element to appear in the DOM
    function waitForElement(query, callback, interval = 100) {
        const checkExistence = setInterval(() => {
            const element = document.querySelector(query);
            if (element) {
                clearInterval(checkExistence);
                callback(element);
            }
        }, interval);
    }

    // helper function to wait for an element to disappear from the DOM
    function waitForElementDisappear(query, callback, interval = 100) {
        const checkExistence = setInterval(() => {
            const element = document.querySelector(query);
            if (!element) {
                clearInterval(checkExistence);
                callback();
            }
        }, interval);
    }

    //Restore the default query in the search input
    function restoreDefaultQuery(searchInput) {
        if (searchInput) {
            searchInput.value = DEFAULT_QUERY;
        }
    }

    function attachSaveButtonAppearsListener() {

        waitForElement(MODAL_SAVE_BUTTON_SELECTOR, (element) => {
            console.log('Savebutton appears', element);
            attachSaveButtonDisappearsListener();
        });
    }

    function attachSaveButtonDisappearsListener() {

        waitForElementDisappear(MODAL_SAVE_BUTTON_SELECTOR, (element) => {
            console.log('Savebutton disappear', element);
            const searchINput = document.querySelector(SEARCH_INPUT_SELECTOR);

            restoreDefaultQuery(searchINput);
            attachSaveButtonAppearsListener();
        });
    }

    // Toggle foil on the current modal
    function toggleFoil() {
        console.log('foils !!!');
        const select = document.querySelector('#finish');

        if (select) {
            select.value = (select.value === 'foil') ? 'nonFoil' : 'foil';
            const event = new Event('change', {
                bubbles: true,
                cancelable: true
            });
            select.dispatchEvent(event);
        }
    }


    function attachSearchInputDisappearListener() {
        waitForElementDisappear(SEARCH_INPUT_SELECTOR, () => {
            console.log('Search input disappear');
            attachSearchInputAppearListener();
        });

    }

    function attachSearchInputAppearListener() {
        waitForElement(SEARCH_INPUT_SELECTOR, (element) => {
            console.log('Search input found:', element);
            restoreDefaultQuery(element);
            attachSaveButtonAppearsListener();
            attachSearchInputDisappearListener();
        });

    }

    function attachShortcutsListeners() {
        document.addEventListener('keydown', function(event) {
            // Check if the required keys are pressed
            if (TOGGLE_FOIL_SHORTCUT(event)) {
                // Prevent the default action (optional)
                event.preventDefault();

                // Call your callback function
                toggleFoil();
            }
        });
    }

    attachShortcutsListeners();
    attachSearchInputAppearListener();
})();