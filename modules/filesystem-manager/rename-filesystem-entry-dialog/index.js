import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";

const styles =
    css`
    `;

export default class ADWLMRenameFilesystemEntryDialog extends LitElement {
    static properties = {
        entry: {
            type: Object,
        },
        old_entry_name: {
            type: String,
        },
        old_entry_absolute_path: {
            type: String,
        },
        old_entry_relative_path: {
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
            <sl-dialog label="Rename to">
                <sl-input id="new-entry-name" label="New name" required="true" autofocus="true" value="${this.old_entry_name}"></sl-input>
                <sl-button id="rename-entry-button" slot="footer" variant="primary">Rename</sl-button>
            </sl-dialog>
        `;
    }

    firstUpdated() {
        let shadow_root = this.shadowRoot;

        shadow_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#rename-entry-button")) {
                let old_entry_name = this.old_entry_name;
                let old_entry_absolute_path = this.old_entry_absolute_path;
                let old_entry_relative_path = this.old_entry_relative_path;
                let old_entry_absolute_base_path = old_entry_absolute_path.substring(0, old_entry_absolute_path.lastIndexOf(old_entry_name));
                let old_entry_relative_base_path = old_entry_relative_path.substring(0, old_entry_relative_path.lastIndexOf(old_entry_name));

                let new_entry_name = shadow_root.querySelector("sl-input#new-entry-name").value;
                let new_entry_absolute_path = `${old_entry_absolute_base_path}${new_entry_name}`;
                let new_entry_relative_path = `${old_entry_relative_base_path}${new_entry_name}`;

                this.dispatchEvent(new CustomEvent("adwlm-rename-filesystem-entry-dialog:new-entry-name", {
                    "detail": {
                        "entry": this.entry,
                        "type": this.entry_type,
                        "name": new_entry_name,
                        "absolute_path": new_entry_absolute_path,
                        "relative_path": new_entry_relative_path,
                        "old_absolute_path": old_entry_absolute_path,
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
        this.entry = {};
        this.old_entry_name = null;
        this.old_entry_absolute_path = null;
        this.old_entry_relative_path = null;
        this.entry_type = null;
    }

    show() {
        this.shadowRoot.querySelector("sl-dialog").show();
    }

    hide() {
        this.shadowRoot.querySelector("sl-dialog").hide();
    }
}

window.customElements.define("adwlm-rename-filesystem-entry-dialog", ADWLMRenameFilesystemEntryDialog);
