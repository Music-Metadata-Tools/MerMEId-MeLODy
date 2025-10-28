import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import "./entity-types-dialog/index.js";
import { filesystemService } from "../services/filesystem-service.js";

const styles =
    css`
        :host {
            height: 82vh;
            background-color: #bee2f7;
        }
    
        div#container {
            min-height: 82vh;
            background-color:transparent;
            overflow: auto;
            margin-left: 0;
        }
        sl-button-group {
            background-color: white;
            width: 100%;
            padding-bottom: 5px;
        }
        h2 {
            text-align: center;
            color: var(--sl-color-primary-600);
            font-size: 1.5rem;
        }
        sl-button::part(base) {
            --sl-color-neutral-600: var(--sl-color-primary-600);
        }
        sl-button[disabled]::part(base) {
            background-color: var(--sl-color-neutral-200);
            border-color: var(--sl-color-neutral-200);
            color: var(--sl-color-neutral-400);
        }
        sl-button-group sl-button::part(prefix) {
            color: var(--sl-color-neutral-0);
            margin-right: 0.3em;
            font-size: 0.75em;
        }
        sl-button#undo-changes sl-icon::part(base) {
            font-size: 1.5rem;  // Make icon bigger
            color: var(--sl-color-neutral-0);  // Keep white color
            vertical-align: middle;  // Center align the bigger icon
        }
        .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            background-color: transparent;
        }
        
        .header-container h2 {
            margin: 0;
            text-align: left;
            flex: 0 0 auto;
        }
        
        .iri-container sl-button::part(base) {
            font-family: monospace;
            font-size: 0.9rem;
            color: var(--sl-color-neutral-600);
            background-color: var(--sl-color-neutral-100);
            border-color: var(--sl-color-neutral-200);
            padding: 0.5rem 1rem;
        }

        .iri-container sl-button::part(base):hover {
            background-color: var(--sl-color-neutral-200);
            border-color: var(--sl-color-neutral-300);
        }

        .iri-container sl-button::part(suffix) {
            margin-left: 0.5rem;
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
        _entity_path: {
            type: String,
        },
        _hasUnsavedChanges: {
            type: Boolean,
            state: true
        },
        _skipNextUpdate: {
            type: Boolean,
            state: true
        },
        _hasUnsharedFiles: {
            type: Boolean,
            state: true
        },
        _selected_repository_path: {
        type: String,
        state: true
        },
        _cachedConfig: {
            type: Object,
            state: true
        }
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("entity_to_edit")) {
            let entity_to_edit = this.entity_to_edit;

            if (entity_to_edit !== null && !this._skipNextUpdate) {
                // Check for unsaved changes before loading new file
                if (this._hasUnsavedChanges) {
                    // Show warning dialog
                    const dialog = document.createElement('sl-dialog');
                    dialog.label = 'Unsaved Changes';
                    dialog.innerHTML = `
                        <p>You have unsaved changes. Do you want to continue without saving?</p>
                        <sl-button slot="footer" variant="neutral" id="cancel">Cancel</sl-button>
                        <sl-button slot="footer" variant="primary" id="continue">Continue</sl-button>
                    `;

                    // Add event listener for dialog close request (x button or cancel button)
                    dialog.addEventListener('sl-request-close', (event) => {
                        this._skipNextUpdate = true;
                        const previousEntity = changedProperties.get("entity_to_edit");
                        this.entity_to_edit = previousEntity;
                        dialog.hide();
                        setTimeout(() => {
                            dialog.remove();
                            this._skipNextUpdate = false;
                        }, 100);
                    });

                    // Handle dialog buttons
                    dialog.querySelector('#cancel').addEventListener('click', () => {
                        this._skipNextUpdate = true;
                        const previousEntity = changedProperties.get("entity_to_edit");
                        this.entity_to_edit = previousEntity;
                        dialog.hide();
                        setTimeout(() => {
                            dialog.remove();
                            this._skipNextUpdate = false;
                        }, 100);
                    });

                    dialog.querySelector('#continue').addEventListener('click', () => {
                        this._loadNewEntity(entity_to_edit);
                        dialog.hide();
                        setTimeout(() => dialog.remove(), 100); // Clean up dialog after animation
                    });

                    document.body.append(dialog);
                    dialog.show();
                    return; // Stop further processing until user decides
                } else {
                    // No unsaved changes, load new entity directly
                    this._loadNewEntity(entity_to_edit);
                }
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

        if (changedProperties.has('_hasUnsavedChanges')) {
            this.dispatchEvent(new CustomEvent('adwlm-entity-editor:unsaved-changes', {
                detail: { hasUnsavedChanges: this._hasUnsavedChanges },
                bubbles: true,
                composed: true
            }));
        }
    }

    // Add new helper method to handle entity loading
    async _loadNewEntity(entity_to_edit) {
        let editor = this.renderRoot.querySelector("shacl-form");
        let shacl_renderer = document.querySelector("section#renderer sl-tab-group sl-tab-panel[name = 'html-output'] fieldset shacl-form");
        let shacl_file_location = this._get_shacl_file_location();
        
        // Pass the full entity path
        const config = await this._getRepoConfig();
        
        if (config && config.datasetBaseUrl) {
            try {
                // Read the SHACL file content
                const shaclContent = await fetch(shacl_file_location).then(res => res.text());
                
                // Replace the dataset namespace
                const modifiedShaclContent = shaclContent.replace(
                    /dataset: <[^>]+>/g,
                    `dataset: <${config.datasetBaseUrl}>`
                );
                
                // Create a blob URL for the modified content
                const blob = new Blob([modifiedShaclContent], { type: 'text/turtle' });
                const modifiedFileUrl = URL.createObjectURL(blob);
                
                // Use the modified file URL
                editor.dataset.values = entity_to_edit.contents;
                editor.dataset.valuesSubject = entity_to_edit.entity_iri;
                editor.dataset.shapesUrl = modifiedFileUrl;

                shacl_renderer.setAttribute("data-values-subject", entity_to_edit.entity_iri);
                shacl_renderer.setAttribute("data-values", entity_to_edit.contents);
                shacl_renderer.setAttribute("data-shapes-url", modifiedFileUrl);
            } catch (error) {
                console.error('Failed to modify SHACL file:', error);
                // Fallback to original file
                editor.dataset.shapesUrl = shacl_file_location;
                shacl_renderer.setAttribute("data-shapes-url", shacl_file_location);
            }
        } else {
            // Use original file if no config is found
            editor.dataset.shapesUrl = shacl_file_location;
            shacl_renderer.setAttribute("data-shapes-url", shacl_file_location);
        }

        this.entity_to_edit.shapesUrl = editor.dataset.shapesUrl;
        
        this._entity_path = entity_to_edit.path;
        
        // Reset unsaved changes state when loading new file
        this._hasUnsavedChanges = false;
    }

    static styles = styles;

    constructor() {
        super();
        this._init();
        
        // Listen for repository selection events
        document.addEventListener('adwlm-filesystem-manager:repository-selected', (event) => {
            this._selected_repository_path = event.detail.repositoryPath;
            // Clear cached config when repository changes
            this._cachedConfig = null;
        });

        document.addEventListener('adwlm-filesystem-manager:item-selected', (event) => {
            this._selected_repository_path = event.detail.repositoryPath;
            // Clear cached config when repository changes
            this._cachedConfig = null;
        });
    }

    render() {
        return html`
            <div id="container">
                <sl-button-group>
                    <sl-button id="add-entity" variant="primary" size="small" title="Add entity">New
                        <sl-icon name="file-earmark-plus" slot="suffix"></sl-icon>
                    </sl-button>
                    <sl-button id="save-entity" variant="primary" size="small" title="Save entity" 
                        ?disabled="${!this._hasUnsavedChanges}">
                        ${this._hasUnsavedChanges ? html`<sl-icon name="circle-fill" slot="prefix"></sl-icon>` : ''}
                        Save
                        <sl-icon name="floppy" slot="suffix"></sl-icon>
                    </sl-button>
                    <sl-button id="undo-changes" variant="primary" size="small" ?disabled="${!this._hasUnsavedChanges}">
                        <sl-icon slot="suffix" name="arrow-counterclockwise"></sl-icon>
                    </sl-button>
                </sl-button-group>
                ${this.entity_to_edit ? html`
                    <div class="header-container">
                        <h2>
                            ${this._getEntityName(this.entity_to_edit.entity_type)}
                        </h2>
                        <div class="iri-container">
                            <sl-button id="copy-iri" variant="neutral" size="small" title="Copy entity IRI">
                                ${this.entity_to_edit.entity_iri}
                                <sl-icon name="clipboard" slot="suffix"></sl-icon>
                            </sl-button>
                        </div>
                    </div>
                ` : ''}
                <shacl-form data-shapes-url="" data-values-subject="" data-shape-subject="" data-collapse="close"></shacl-form>
            </div>
            <adwlm-entity-types-dialog></adwlm-entity-types-dialog>
        `;
    }

    // Add this helper method to the class
    _getEntityName(entity_type) {
        if (!this.entity_type_definitions) return '';
        const definition = this.entity_type_definitions.find(def => def.type === entity_type);
        return definition ? definition.name : '';
    }

    firstUpdated() {
        let render_root = this.renderRoot;
        let editor = render_root.querySelector("shacl-form");
        this.editor = editor;
        let entity_types_dialog = render_root.querySelector("adwlm-entity-types-dialog");

        editor.addEventListener("change", (event) => {
            let target = event.target;
            this._hasUnsavedChanges = true;
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

            if (target.matches("sl-button#copy-iri")) {
                if (this.entity_to_edit?.entity_iri) {
                    await navigator.clipboard.writeText(this.entity_to_edit.entity_iri);
                    
                    // Show success notification
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'success';
                    alert.closable = true;
                    alert.duration = 3000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="clipboard-check"></sl-icon>
                        Entity IRI copied to clipboard
                    `;
                    document.body.append(alert);
                    alert.toast();
                }
            }

            if (target.matches("sl-button#add-entity")) {
                //entity_types_dialog.repository_names = await filesystem.list_repository_names();
                entity_types_dialog.show();
            }

            if (target.matches("sl-button#save-entity")) {
                let rdf_output = editor.serialize();
                let json_ld_output = editor.serialize("application/ld+json");
                let entity_to_save = {
                    entity_iri: this.entity_to_edit.entity_iri,
                    rdf_contents: rdf_output,
                    json_ld_contents: json_ld_output,
                    path: this._entity_path,
                    shapesUrl: this.entity_to_edit.shapesUrl,
                };

                this.dispatchEvent(new CustomEvent("adwlm-entity-editor:entity-to-save", {
                    "detail": entity_to_save,
                    "bubbles": true,
                    "composed": true,
                }));
                this._hasUnsavedChanges = false;
            }

            if (target.matches("sl-button#undo-changes")) {
                try {
                    // Get the current editor form
                    const editor = this.renderRoot.querySelector("shacl-form");
                    
                    // Get the last saved state from the entity_to_edit
                    if (this.entity_to_edit) {
                        // Reset the form to the last saved state
                        editor.dataset.values = this.entity_to_edit.contents;
                        
                        // Reset unsaved changes flag
                        this._hasUnsavedChanges = false;
                        
                        // Show success notification
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'success';
                        alert.closable = true;
                        alert.duration = 3000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="arrow-counterclockwise"></sl-icon>
                            Changes undone successfully
                        `;
                        document.body.append(alert);
                        alert.toast();
                    }
                } catch (error) {
                    console.error('Failed to undo changes:', error);
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Failed to undo changes. Please try again.
                    `;
                    document.body.append(alert);
                    alert.toast();
                }
            }
        });

        this.addEventListener("adwlm-entity-types-dialog:entity-to-add", async (event) => {
            let entity_type = event.detail;
            let entity_type_definition = this.entity_type_definitions.filter(item => item.type === entity_type)[0];
            let entity_folder_name = entity_type_definition.folder_name;
            let entity_id = this._generate_entity_id();
            const config = await this._getRepoConfig();
            const domain = config?.projectDomain ?? 'urn:uuid:';
            let entity_path = `${entity_folder_name}/${entity_id}.ttl`;
            let entity_iri = `${domain}${entity_folder_name}/${entity_id}`;

            let entity_to_edit = {
                contents: "",
                path: entity_path,
                entity_iri,
                entity_type,
                shapesUrl: "",
            };

            // configure the editor
            this.entity_to_edit = entity_to_edit;
        });

        document.addEventListener("adwlm-filesystem-manager:clear-entity-editor", (event) => {
            let editor = this.renderRoot.querySelector("shacl-form");

            editor.dataset.values = "";
            editor.dataset.valuesSubject = "";
            editor.dataset.shapesUrl = "";
            editor.dataset.shapeSubject = "";

            this._entity_path = null;
            this.entity_to_edit = null;

            // Reset unsaved changes state when deleting file
            this._hasUnsavedChanges = false;
        });
    }

    _init() {
        this.entity_to_edit = null;
        this.entity_type_definitions = null;
        this._entity_path = null;
        this._hasUnsavedChanges = false;
        this._skipNextUpdate = false;
        this._cachedConfig = null;
    }

    _generate_entity_id() {
        let array = new Uint32Array(1);
        self.crypto.getRandomValues(array);

        return array[0];
    }

    _get_shacl_file_location() {
        let entity_type = this.entity_to_edit.entity_type;
        let shacl_file_location = this.entity_type_definitions
            .filter(definition => definition.type === entity_type)[0].shacl_file_location;

        return shacl_file_location;
    }

    async _getRepoConfig() {
        // Return cached config if available
        if (this._cachedConfig) {
            return this._cachedConfig;
        }

        try {
            const filesystem = filesystemService.getInstance();
            
            if (!this._selected_repository_path) {
                throw new Error('No repository selected');
            }
            
            const configPath = `${this._selected_repository_path}/configuration/config.json`;
            console.log('Reading config from:', configPath);
            
            const configContent = await filesystem.read_file(this._selected_repository_path, 'configuration/config.json');
            
            if (!configContent || configContent.trim() === '') {
                throw new Error('Config file is empty');
            }
            
            const config = JSON.parse(configContent);
            
            // Cache the successful config
            this._cachedConfig = config;
            return config;
        } catch (error) {
            console.error('Failed to read repository config:', error);
            
            // Only show alert if we haven't cached a config yet
            if (!this._cachedConfig) {
                const alert = document.createElement('sl-alert');
                alert.variant = 'warning';
                alert.closable = true;
                alert.duration = 6000;
                alert.innerHTML = `
                    <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                    Using default configuration: ${error.message}
                `;
                document.body.append(alert);
                alert.toast();
                
                // Cache the default config
                this._cachedConfig = {
                    datasetBaseUrl: 'https://adwmainz.pages.gitlab.rlp.net/nfdi4culture/cdmd/mermeid-sample-data/datasets/',
                    projectDomain: 'urn:uuid:'
                };
            }
            
            return this._cachedConfig;
        }
    }
}

window.customElements.define("adwlm-entity-editor", ADWLMEntityEditor);