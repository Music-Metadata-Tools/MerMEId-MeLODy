import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import "./entity-types-dialog/index.js";

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
        entity_to_edit: {
            type: Object,
        },
        entity_type_definitions: {
            type: Object,
        },
        _file_contents: {
            type: String,
        },
        _entity_path: {
            type: String,
        },
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("entity_to_edit")) {
            let entity_to_edit = this.entity_to_edit;

            if (entity_to_edit !== null) {
                // dispatch internal event, as the actions to take are asynchronous
                this.dispatchEvent(new CustomEvent("_edit-file", {
                    "detail": this.entity_to_edit,
                }));
            }
        }

        if (changedProperties.has("entity_type_definitions")) {
            let entity_type_definitions = this.entity_type_definitions;

            if (entity_type_definitions !== null) {
                // set the entity type names for adwlm-entity-types-dialog
                let tree_items = [];

                for (const entity_type_definition of entity_type_definitions) {
                    let entity_type = entity_type_definition.type;
                    let entity_name = entity_type_definition.name;

                    tree_items.push(html`<sl-tree-item data-entity-type="${entity_type}">${entity_name}</sl-tree-item>`);
                }

                let entity_name_tree_dialog = this.renderRoot.querySelector("adwlm-entity-types-dialog");
                entity_name_tree_dialog.entity_name_tree_items = tree_items;
            }
        }
    }

    static styles = styles;

    constructor() {
        super();

        this._init();
    }

    render() {
        let entity_to_edit = this.entity_to_edit;
        let entity_iri = "";
        let entity_type = "";

        if (this.entity_to_edit) {
            entity_iri = entity_to_edit.entity_iri;
            entity_type = entity_to_edit.entity_type;
        }

        return html`
            <div id="container">
                <sl-button-group>
                    <sl-button id="add-entity" variant="primary" size="small" title="Add entity">New
                        <sl-icon name="file-earmark-plus" slot="suffix"></sl-icon>
                    </sl-button>
                    <sl-button id="save-entity" variant="primary" size="small" title="Save entity">Save
                        <sl-icon name="floppy" slot="suffix"></sl-icon>
                    </sl-button>
                </sl-button-group>
                    <shacl-form id="places-shacl-form" data-shapes-url="configuration/entity-shapes.shacl"
                        data-values-subject="${entity_iri}"
                        data-shape-subject="${entity_type}"></shacl-form>
            </div>
            <adwlm-entity-types-dialog></adwlm-entity-types-dialog>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;
        let editor = render_root.querySelector("shacl-form");
        this.editor = editor;
        let entity_types_dialog = render_root.querySelector("adwlm-entity-types-dialog");

        editor.addEventListener("change", (event) => {
            let target = event.target;

            //console.log(editor.serialize());
        });

        /*

      setTimeout(() => {
        const form = document.getElementById("shacl-form")
        const shapes = document.getElementById("shacl-shape-input")
        const output = document.getElementById("shacl-output")
        shapes.addEventListener('change', () => {
          form.dataset['shapes'] = shapes.value
          output.querySelector("pre").innerText = ''
          output.classList.remove('valid', 'invalid')
        })
        form.addEventListener('change', (ev) => {
          output.classList.toggle('valid', ev.detail?.valid)
          output.classList.toggle('invalid', !ev.detail?.valid)
          output.querySelector("pre").innerText = form.serialize()
        })
        form.addEventListener('submit', (ev) => {
          const link = document.createElement('a')
          link.href = window.URL.createObjectURL(new Blob([form.serialize()], { type: "text/turtle" }))
          link.download = 'metadata.ttl'
          link.click()
        })
        shapes.focus()
      })
        */

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#add-entity")) {
                //entity_types_dialog.repository_names = await filesystem.list_repository_names();
                entity_types_dialog.show();
            }

            if (target.matches("sl-button#save-entity")) {
                let rdf_output = editor.serialize();
                let json_ld_output = editor.serialize("application/ld+json");
                let entity_to_save = {
                    rdf_contents: rdf_output,
                    json_ld_contents: json_ld_output,
                    path: this._entity_path,
                };

                this.dispatchEvent(new CustomEvent("adwlm-entity-editor:entity-to-save", {
                    "detail": entity_to_save,
                    "bubbles": true,
                    "composed": true,
                }));
            }
        });

        this.addEventListener("_edit-file", async (event) => {
            let editor = render_root.querySelector("shacl-form");
            let entity_to_edit = event.detail;

            editor.dataset.values = entity_to_edit.contents;
            this._entity_path = entity_to_edit.path;
        });

        this.addEventListener("adwlm-entity-types-dialog:entity-to-add", (event) => {
            let editor = render_root.querySelector("shacl-form");
            let entity_type = event.detail;
            let entity_type_definition = this.entity_type_definitions.filter(item => item.type === entity_type)[0];
            let entity_location = entity_type_definition.location;
            let entity_id = this._generate_entity_id();
            let entity_path = `${entity_location}/${entity_id}.ttl`;
            let entity_iri = `urn:uuid:${entity_id}`;

            // configure the editor
            editor.dataset.shapeSubject = entity_type;
            editor.dataset.valuesSubject = entity_iri;
            this._entity_path = entity_path;
        });
    }

    _init() {
        this.entity_to_edit = null;
        this.entity_type_definitions = null;
        this._file_contents = null;
        this._entity_path = null;
        this._entity_name_tree_item = null;
    }

    _generate_entity_id() {
        let array = new Uint32Array(1);
        self.crypto.getRandomValues(array);

        return array[0];
    }
}

window.customElements.define("adwlm-entity-editor", ADWLMEntityEditor);