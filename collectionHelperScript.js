// ==UserScript==
// @name         Collection helper
// @namespace    http://saintecroquette.dev/
// @version      2024-08-17
// @description  try to take over the world!
// @author       You
// matches collection page or binder page
// @match        https://www.moxfield.com/binders/*
// @match        https://www.moxfield.com/collection
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const SEARCH_INPUT_SELECTOR = '#collectionSearch';
    const MODAL_SAVE_BUTTON_SELECTOR = '.modal-footer .btn:nth-child(2)';

    //const TOGGLE_FOIL_SHORTCUT = event => event.shiftKey && event.key === 'F';
    const TOGGLE_FOIL_SHORTCUT = event => event.key === 'End';

    const DEFAULT_QUERY = 's:one cn:';

    console.log("Collection Helper script enabled.");

    function waitForElement(query, callback, interval = 100) {
        const checkExistence = setInterval(() => {
            const element = document.querySelector(query);
            if (element) {
                clearInterval(checkExistence);
                callback(element);
            }
        }, interval);
    }

    function waitForElementDisappear(query, callback, interval = 100) {
        const checkExistence = setInterval(() => {
            const element = document.querySelector(query);
            if (!element) {
                clearInterval(checkExistence);
                callback();
            }
        }, interval);
    }

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

    document.addEventListener('keydown', function(event) {
        // Check if the required keys are pressed
        if (TOGGLE_FOIL_SHORTCUT(event)) {
            // Prevent the default action (optional)
            event.preventDefault();

            // Call your callback function
            toggleFoil();
        }
    });

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

    attachSearchInputAppearListener();
})();