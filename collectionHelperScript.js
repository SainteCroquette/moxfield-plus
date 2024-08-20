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

(function () {
    'use strict';

    const SEARCH_INPUT_SELECTOR = '#collectionSearch';
    const MODAL_SAVE_BUTTON_SELECTOR = '.modal-footer .btn:nth-child(2)';


    //update this to match your desired shortcut, see event.key at https://keycode.info/
    //const TOGGLE_FOIL_SHORTCUT = event => event.shiftKey && event.key === 'F';
    const TOGGLE_FOIL_SHORTCUT = event => event.key === 'End';

    //update this to match your default query, then reload page
    let DEFAULT_QUERY = 's:one in:paper cn:';
    let DEFAULT_LANGUAGE = '';

    console.log("Collection Helper script enabled.");

    function createSettings() {
        const parentElement = document.createElement('div');
        // add background color, padding and border to the parent element
        parentElement.style.backgroundColor = 'fff';
        parentElement.style.padding = '16px';
        parentElement.style.border = '1px solid black';
        parentElement.style.borderRadius = '8px';
        parentElement.style.display = 'flex';
        parentElement.style.flexDirection = 'column';
        parentElement.style.gap = '8px';
        parentElement.style.marginBottom = '16px';

        // create a title element
        const titleElement = document.createElement('h2');
        titleElement.textContent = 'Collection helper settings';
        parentElement.appendChild(titleElement);

        // default query input
        const defaultQueryLabel = document.createElement('label');
        defaultQueryLabel.textContent = 'Default query:';
        defaultQueryLabel.style.display = 'block';
        parentElement.appendChild(defaultQueryLabel);
        const defaultQueryInput = document.createElement('input');
        defaultQueryInput.type = 'text';
        defaultQueryInput.value = DEFAULT_QUERY;
        defaultQueryInput.style.width = '100%';
        defaultQueryInput.classList.add('form-control');
        parentElement.appendChild(defaultQueryInput);

        //default language input
        const defaultLanguageLabel = document.createElement('label');
        defaultLanguageLabel.textContent = 'Default language (leave empty for english:';
        defaultLanguageLabel.style.display = 'block';
        parentElement.appendChild(defaultLanguageLabel);
        const defaultLanguageInput = document.createElement('input');
        defaultLanguageInput.type = 'text';
        defaultLanguageInput.value = DEFAULT_LANGUAGE;
        defaultLanguageInput.style.width = '100%';
        defaultLanguageInput.classList.add('form-control');
        parentElement.appendChild(defaultLanguageInput);


        //save button
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.classList.add('btn', 'btn-primary');
        saveButton.onclick = () => handleSaveSettings(defaultQueryInput, defaultLanguageInput)
        parentElement.appendChild(saveButton);

        return parentElement;
    }

    function saveSettings(settings) {
        localStorage.setItem('collection-helper-default-query', settings.defaultQuery);
        localStorage.setItem('collection-helper-default-language', settings.defaultLanguage);
        loadSettings();
    }

    function loadSettings() {
        DEFAULT_QUERY = localStorage.getItem('collection-helper-default-query') || DEFAULT_QUERY;
        DEFAULT_LANGUAGE = localStorage.getItem('collection-helper-default-language') || DEFAULT_LANGUAGE;
    }

    function handleSaveSettings(searchQueryInput, defaultLanguageInput) {
        const newDefaultQuery = searchQueryInput.value;
        const newDefaultLanguage = defaultLanguageInput.value;

        saveSettings({
            defaultQuery: newDefaultQuery || DEFAULT_QUERY,
            defaultLanguage: newDefaultLanguage || DEFAULT_LANGUAGE
        })
    }

    function injectSettings() {
        const settings = createSettings();
        const originElement = document.querySelector('.container.my-5');
        //insert as first element
        originElement.insertBefore(settings, originElement.firstChild);
    }

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
            attachLanguageSelectListener();
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

    function selectLanguage() {
        const element = document.querySelector('#language');
        if (element && DEFAULT_LANGUAGE !== '') {
            element.value = DEFAULT_LANGUAGE;
            const event = new Event('change', {
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(event);
        }
    }


    function attachSearchInputDisappearListener() {
        waitForElementDisappear(SEARCH_INPUT_SELECTOR, () => {
            console.log('Search input disappear');
            attachSearchInputAppearListener();
        });

    }

    function attachLanguageSelectListener() {
        waitForElement('#language', (element) => {
            selectLanguage();
        });
    }

    function attachSearchInputAppearListener() {
        waitForElement(SEARCH_INPUT_SELECTOR, (element) => {
            console.log('Search input found:', element);
            restoreDefaultQuery(element);
            attachSaveButtonAppearsListener();
            attachLanguageSelectListener();
            attachSearchInputDisappearListener();
        });

    }

    function attachShortcutsListeners() {
        document.addEventListener('keydown', function (event) {
            if (TOGGLE_FOIL_SHORTCUT(event)) {
                event.preventDefault();
                toggleFoil();
            }
        });
    }

    attachShortcutsListeners();
    attachSearchInputAppearListener();
    loadSettings();
    const timeout = setTimeout(() => {
        injectSettings();
        clearTimeout(timeout);
    }, 3000);
})
();