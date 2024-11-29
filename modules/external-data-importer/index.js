// Input fields
const inputField = document.querySelector("sl-input#input-gnd-id");

// Output fields
const nameOutputField = document.querySelector("sl-input#name-output");
const infoOutputField = document.querySelector("sl-input#info-output");

// Buttons
const showButton = document.querySelector("sl-button#show-button");
const importButton = document.querySelector("sl-button#import-button");

// Dialog
const dialog = document.querySelector('sl-dialog#dialog');
const closeButton = dialog.querySelector('sl-button#dialog-close-button');

// shacl input fields
const shadowHost = document.getElementById('shacl-form-places');
//const shadowElement = shadowHost.shadowRoot.querySelector('input[placeholder="Place name"]');
const shadowElement = shadowHost.shadowRoot.querySelector('#e0');


// Add an event listener for the 'click' event
showButton.addEventListener('click', () => {
    // Get the current value of the input field
    const currentValue = inputField.value;

    // build URL for API request
    const url = `https://lobid.org/gnd/${currentValue}?format=json`

    fetch(url)
        .then(response => response.json())
        .catch(error => {
            //console.log(error);
            dialog.show();
        })
        .then(data => {
            if (data.preferredName) {
                nameOutputField.setAttribute('value', data.preferredName)
            } else {
                nameOutputField.setAttribute('value', "no value");
            }
            if (data.biographicalOrHistoricalInformation) {
                infoOutputField.setAttribute('value', data.biographicalOrHistoricalInformation);
            } else {
                infoOutputField.setAttribute('value', "no entry");
            }
        })
        .catch(error => {
            //console.log(error);
        });
});


// Add an event listener to close dialog at 'click' event
closeButton.addEventListener('click', () => dialog.hide());


// Add an event listener for the 'click' event
importButton.addEventListener('click', () => {
    shadowElement.value = nameOutputField.value;
    console.log(shadowElement)
});


// Add an event listener for the 'input' event
//inputField.addEventListener('input', (event) => {
    // Get the current value of the input field
    //const currentValue = event.target.value;

    //outputField.setAttribute('value', currentValue);

    //fetch("https://lobid.org/gnd/search?q=Paris&format=json:preferredName")
    //    .then(response => response.json())
    //    .then(data => {
    //        data.forEach(item => {
    //            if (item.label) {
    //                console.log(`${item.label}`);
    //            }
    //        });
    //    });

    // Log the current value to the console
    //console.log(`Current value: ${currentValue}`);
//});
