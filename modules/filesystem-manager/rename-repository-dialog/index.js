import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";

const styles =
    css`
    `;

export default class RenameFilesystemEntryDialog extends LitElement {
    static properties = {
        label_1: {
            type: String,
        },
        label_2: {
            type: String,
        },
        entry_type: {
            type: String,
        },
    };

    static styles = styles;

    constructor() {
        super();

        this._init();
    }

    render() {
        return html`
            <sl-dialog id="rename-entry-dialog" label="${this.label_1}">
                <sl-input id="new-entry-name" label="${this.label_2}" required="true" autofocus="true"></sl-input>
                <sl-button id="rename-entry-button" slot="footer" variant="primary">Rename</sl-button>
            </sl-dialog>
        `;
    }

    firstUpdated() {
        let shadow_root = this.shadowRoot;

        shadow_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;

            if (target.matches("sl-button#rename-entry-button")) {
                this.dispatchEvent(new CustomEvent("cdmd-rename-filesystem-entry-dialog:new-entry-name", {
                    "detail": {
                        "name": shadow_root.querySelector("sl-input#new-entry-name").value,
                        "type": this.entry_type,
                    },
                    "bubbles": true,
                    "composed": true,
                }));
            }
        });
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        return render_root;
    }

    _init() {
        this.label_1 = null;
        this.label_2 = null;
        this.entry_type = null;
    }

    show() {
        this.shadowRoot.querySelector("sl-dialog").show();
    }

    hide() {
        this.shadowRoot.querySelector("sl-dialog").hide();
    }
}

window.customElements.define("cdmd-rename-filesystem-entry-dialog", RenameFilesystemEntryDialog);
