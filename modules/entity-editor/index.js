import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";

const styles =
    css`
        :host {
            width: 300vw;
            height: 70vh;
            background-color: #bee2f7;
        }
        div#container {
            width: 35vw;
            height: 82vh;
            background-color: #bee2f7;
            overflow: scroll;
        }
        sl-button-group {
            background-color: white;
            width: 100%;
            padding-bottom: 5px;
        }
    `;

export default class ADWLMEntityEditor extends LitElement {

    static properties = {
        file_to_edit: {
            type: Object,
        },
        _file_contents: {
            type: String,
        },
        _file_relative_path: {
            type: String,
        },
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("file_to_edit")) {
            let file_to_edit = this.file_to_edit;

            if (file_to_edit !== null) {
                // dispatch internal event, as the actions to take are asynchronous
                this.dispatchEvent(new CustomEvent("_edit-file", {
                    "detail": this.file_to_edit,
                }));
            }
        }
    }

    static styles = styles;

    constructor() {
        super();

        this._init();
    }

    render() {
        return html`
            <div id="container">
                <sl-button-group>
                    <sl-button id="save-file" variant="primary" size="small" title="Save file">Save
                        <sl-icon name="floppy"slot="suffix"></sl-icon>
                    </sl-button>
                </sl-button-group>
                    <shacl-form id="places-shacl-form" data-shapes-url="ontologies/entity-shapes.shacl"
                        data-values-subject="${this.file_to_edit.entity_iri}"
                        data-shape-subject="${this.file_to_edit.entity_type}"></shacl-form>
            </div>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;
        let editor = render_root.querySelector("shacl-form");

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#save-file")) {
                let rdf_output = editor.serialize();
                let json_ld_output = editor.serialize("application/ld+json");
                let file_to_save = {
                    "rdf_contents": rdf_output,
                    "json_ld_contents": json_ld_output,
                    "relative_path": this.file_relative_path,
                };
                console.log(rdf_output);
                return;
                this.dispatchEvent(new CustomEvent("adwlm-entity-editor:file-to-save", {
                    "detail": file_to_save,
                    "bubbles": true,
                    "composed": true,
                }));
            }
        });

        this.addEventListener("_edit-file", async (event) => {
            let editor = render_root.querySelector("shacl-form");
            let file_to_edit = event.detail;

            editor.dataset.values = file_to_edit.contents;
            editor.file_path = file_to_edit.relative_path;
        });
    }

    _init() {
        this.file_to_edit = null;
        this._file_contents = null;
        this._file_relative_path = null;
    }
}

window.customElements.define("adwlm-entity-editor", ADWLMEntityEditor);