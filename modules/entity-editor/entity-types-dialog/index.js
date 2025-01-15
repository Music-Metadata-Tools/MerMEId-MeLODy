import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";

const styles =
    css`
        sl-dialog {
            --width: 30vw;
        }
`;

export default class ADWLMEntityTypesDialog extends LitElement {
    static properties = {
        entity_name_tree_items: {
            type: Object,
        },
    };

    static styles = styles;

    constructor() {
        super();

        this.init();
    }

    render() {
        return html`
            <sl-dialog id="entity-type-dialog" label="New entity">
                <sl-tree>${this.entity_name_tree_items}</sl-tree>
                <sl-button id="add-entity" slot="footer" variant="primary">Create</sl-button>
            </sl-dialog>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;

        let entity_types_dialog = render_root.querySelector("sl-dialog");

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#add-entity")) {
                let entity_names_tree = render_root.querySelector("sl-tree");
                let selected_entry = entity_names_tree.querySelector("sl-tree-item[selected]");
                let entity_type = selected_entry.dataset.entityType;

                this.dispatchEvent(new CustomEvent("adwlm-entity-types-dialog:entity-to-add", {
                    "detail": entity_type,
                    "bubbles": true,
                    "composed": true,
                }));

                entity_types_dialog.hide();
            }
        });
    }

    init() { }

    show() {
        this.renderRoot.querySelector("sl-dialog").show();
    }

    hide() {
        this.renderRoot.querySelector("sl-dialog").hide();
        this.reset();
    }
}

window.customElements.define("adwlm-entity-types-dialog", ADWLMEntityTypesDialog);
