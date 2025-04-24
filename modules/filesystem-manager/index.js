import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import "./add-repository-dialog/index.js";
import "./rename-filesystem-entry-dialog/index.js";
import * as CONSTANTS from "./constants.js";

// TODO: conditionally import of the datatype for the repository data
import VirtualFilesystem from "./virtual-filesystem/index.js";
let filesystem = new VirtualFilesystem();
// END TODO

const styles =
    css`
        :host {
            width: 14vw;
            display: inline-block;
            font-size: var(--sl-font-size-small);
        }
        div#container {
            display: flex;
            flex-direction: column;
            padding-bottom: 20px;
        }
        sl-tree-item::part(label) {
            font-size: var(--sl-font-size-small);
        }
        div#repositories-tree-container {
            height: 60vh;
            overflow: scroll;
        }
        /* Toggle button styles */
        #filesystem-toggle {
            display: none; /* Hide on desktop */
        }

        #filesystem-toggle sl-icon {
            font-size: 1.5rem;
        }
        @media only screen and (max-width: 900px) {
            div#container {
                display: none;
            }
            div#container.open {
                display: flex;
                max-width: 30vw;
            }
            :host {
                width: 80vw;
            }
            /* Toggle button styles */
            #filesystem-toggle {
                display: block; /* Show on mobile */
                position: fixed;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                z-index: 101;
                border: none;
                background: var(--sl-color-primary-600);
                color: white;
                padding: 0.5rem;
                border-radius: 0 0.25rem 0.25rem 0;
                cursor: pointer;
                box-shadow: var(--sl-shadow-medium);
            }
            
            #filesystem-toggle sl-icon {
                font-size: 1.5rem;
            }
        }
        
    `;

export default class ADWLMFilesystemManager extends LitElement {

    static properties = {
        _displayed_repository_names: {
            type: Array,
        },
        _selected_repository_path: {
            type: String,
        },
        _staged_files: {
            type: Array,
        },
        _displayed_staged_files: {
            type: Array,
        },
        entity_to_save: {
            type: Object,
        },
        _repository_buttons_disabled: {
            type: Boolean,
        },
        _lastPullTimestamp: {
            type: Object,
            state: true
        }
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("entity_to_save")) {
            let entity_to_save = this.entity_to_save;
            if (entity_to_save !== null) {
                // dispatch internal event, as the actions to take are asynchronous
                this.dispatchEvent(new CustomEvent("_save-entity", {
                    "detail": this.entity_to_save,
                }));
            }
        }
    }

    static styles = styles;

    constructor() {
        super();

        this._init();
    }

    _toggleFilesystemNav() {
        const nav = document.querySelector('nav#filesystem-nav');
        const container = this.renderRoot.querySelector('div#container');
        const icon = this.renderRoot.querySelector('#filesystem-toggle sl-icon');
        
        if (!nav || !icon || !container) return;
        
        nav.classList.toggle('open');
        container.classList.toggle('open');
        
        // Update toggle button icon and title
        if (nav.classList.contains('open')) {
            icon.name = 'chevron-left';
            this.renderRoot.querySelector('#filesystem-toggle').title = "Close file browser";
        } else {
            icon.name = 'chevron-right';
            this.renderRoot.querySelector('#filesystem-toggle').title = "Open file browser";
        }
    }

    render() {
        return html`
            <button id="filesystem-toggle" @click="${this._toggleFilesystemNav}" title="Toggle file browser">
                <sl-icon name="chevron-right"></sl-icon>
            </button>
            <div id="container">
                <sl-details id="repositories-details" summary="Repositories" open>
                    <div>
                        <sl-button-group>
                            <sl-button id="add-repository" size="small" title="Add repository">
                                <sl-icon name="folder-plus"></sl-icon>
                            </sl-button>
                            <sl-button id="remove-repository" size="small" title="Remove repository" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="folder-minus"></sl-icon>
                            </sl-button>
                            <sl-button class="rename-entry" size="small" title="Rename repository" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="folder"></sl-icon>
                            </sl-button>
                            <sl-button id="synchronize-repository" size="small" title="Synchronize repository">
                                <sl-icon name="arrow-counterclockwise"></sl-icon>
                            </sl-button>
                        </sl-button-group>
                        <sl-button-group>
                            <sl-button id="remove-entity" size="small" title="Remove entity">
                                <sl-icon name="file-earmark-minus"></sl-icon>
                            </sl-button>
                        </sl-button-group>
                    </div>
                    <div id="repositories-tree-container">
                        ${this._initialize_filesystem.render({
            pending: () => html`Loading repository names...`,
            complete: () => html`<sl-tree id="repositories-tree">${this._displayed_repository_names}</sl-tree>`,
        })}
                    </div>
                </sl-details>
                <sl-details id="staged-files-details" summary="Share files" disabled>
                    <sl-button-group>
                        <sl-button id="commit-and-push-staged-files" size="small" title="Share files">
                            <sl-icon name="cloud-upload"></sl-icon>
                        </sl-button>
                    </sl-button-group>
                    <sl-tree id="staged-files-tree" selection="multiple">${this._displayed_staged_files}</sl-tree>
                </sl-details>
            </div>
            <adwlm-add-repository-dialog></adwlm-add-repository-dialog>
            <adwlm-rename-filesystem-entry-dialog></adwlm-rename-filesystem-entry-dialog>
            <sl-alert id="commit-and-push-done" variant="primary" duration="6000" closable>
                <sl-icon slot="icon" name="info-circle"></sl-icon>
                The files were shared with the remote repository.
            </sl-alert>
            <sl-alert id="commit-and-push-error" variant="warning" duration="6000" closable>
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                An error occured while sharing the files with the remote repository.
            </sl-alert>
            <sl-alert id="commit-and-push-need" variant="warning" duration="6000" closable>
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                An error occured loading unshared files. Please share the created files with the repository.
            </sl-alert>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;

        let add_repository_dialog = render_root.querySelector("adwlm-add-repository-dialog");
        let rename_filesystem_entry_dialog = render_root.querySelector("adwlm-rename-filesystem-entry-dialog");
        let container = render_root.querySelector("div#container");
        let staged_files_details = render_root.querySelector("sl-details#staged-files-details");
        let staged_files_tree = render_root.querySelector("sl-tree#staged-files-tree");
        let commit_and_push_done_toast = render_root.querySelector("sl-alert#commit-and-push-done");
        let commit_and_push_error_toast = render_root.querySelector("sl-alert#commit-and-push-error");

        render_root.addEventListener("sl-lazy-load", async (event) => {
            let target = event.target;

            if (target.matches("sl-tree#repositories-tree sl-tree-item[lazy]")) {
                target.innerHTML = target.dataset.entryName;
                let entry_type = target.dataset.entryType;
                let entry_absolute_path = target.dataset.entryAbsolutePath;
                let entry_relative_path = target.dataset.entryRelativePath;

                // case of a repo folder
                if (entry_type === CONSTANTS.REPO_FOLDER_SCHEME_NAME) {
                    this._selected_repository_path = entry_absolute_path;
                    staged_files_details.disabled = false;
                }

                // case of a plain folder
                let entries = await filesystem.list_entries_from_workdir(this._selected_repository_path, entry_relative_path);

                let tree_items = "";

                // process the subfolders
                for (const folder_relative_path of entries.folders) {
                    let folder_name = folder_relative_path.includes("/") ? folder_relative_path.substring(folder_relative_path.lastIndexOf("/") + 1) : folder_relative_path;
                    let folder_absolute_path = `${this._selected_repository_path}/${folder_relative_path}`;

                    tree_items += `<sl-tree-item lazy data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}" data-entry-absolute-path="${folder_absolute_path}" data-entry-relative-path="${folder_relative_path}" data-entry-name="${folder_name}">${folder_name}</sl-tree-item>`;
                }

                // process the files
                for (const file_relative_path of entries.files) {
                    let file_name = file_relative_path.includes("/") ? file_relative_path.substring(file_relative_path.lastIndexOf("/") + 1) : file_relative_path;
                    let file_absolute_path = `${this._selected_repository_path}/${file_relative_path}`;

                    tree_items += `<sl-tree-item data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" data-entry-absolute-path="${file_absolute_path}" data-entry-relative-path="${file_relative_path}" data-entry-name="${file_name}">${file_name}</sl-tree-item>`;
                }

                target.insertAdjacentHTML("beforeend", tree_items);
            }
        });

        render_root.addEventListener("sl-selection-change", async (event) => {
            let target = event.target;
            let selection = event.detail.selection[0];

            if (target.matches("sl-tree#repositories-tree")) {
                this._repository_buttons_disabled = false;
                let selected_tree_item = event.detail.selection[0];

                let entry_type = selected_tree_item.dataset.entryType;

                if (entry_type === CONSTANTS.REPO_FOLDER_SCHEME_NAME) {
                    this._selected_repository_path = selected_tree_item.dataset.entryAbsolutePath;
                    staged_files_details.disabled = false;
                }
            }

            if (selection && selection.matches(`sl-tree#repositories-tree sl-tree-item[data-entry-type = '${CONSTANTS.FILE_SCHEME_NAME}']`)) {
                try {
                    // Only pull if needed
                    if (await this._shouldPull(this._selected_repository_path)) {
                        await filesystem.pull(this._selected_repository_path);
                    }
                    
                    let file_path = selection.dataset.entryRelativePath;
                    let file_contents = await filesystem.read_file(this._selected_repository_path, file_path);
            
                    let entity_to_edit = {
                        contents: file_contents,
                        path: file_path,
                    };
                    
                    this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:entity-to-edit", {
                        "detail": entity_to_edit,
                        "bubbles": true,
                        "composed": true,
                    }));
            
                } catch (error) {
                    console.error('Failed to load file:', error);
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Failed to load file. Please try again.
                    `;
                    document.body.append(alert);
                    alert.toast();
                }
            }
        });

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#add-repository")) {
                add_repository_dialog.repository_names = await filesystem.list_repository_names();
                add_repository_dialog.show();
            }

            if (target.matches("sl-button#remove-repository")) {
                target.loading = true;

                await filesystem.remove_repository(this._selected_repository_path);
                await this._list_repository_names();

                // disable the repositories-tree
                // let repositories_tree = render_root.querySelector("sl-tree#repositories-tree");

                this._repository_buttons_disabled = true;
                staged_files_details.disabled = true;

                target.loading = false;
            }

            if (target.matches("sl-button.rename-entry")) {
                let repositories_tree = render_root.querySelector("sl-tree#repositories-tree");
                let selected_entry = repositories_tree.querySelector("sl-tree-item[selected]");
                let selected_entry_type = selected_entry.dataset.entryType;
                let selected_entry_name = selected_entry.dataset.entryName;
                let selected_entry_absolute_path = selected_entry.dataset.entryAbsolutePath;
                let selected_entry_relative_path = selected_entry.dataset.entryRelativePath;

                rename_filesystem_entry_dialog.entry = selected_entry;
                rename_filesystem_entry_dialog.old_entry_name = selected_entry_name;
                rename_filesystem_entry_dialog.old_entry_absolute_path = selected_entry_absolute_path;
                rename_filesystem_entry_dialog.old_entry_relative_path = selected_entry_relative_path;
                rename_filesystem_entry_dialog.entry_type = selected_entry_type;
                rename_filesystem_entry_dialog.show();
            }

            if (target.matches("sl-button#synchronize-repository")) {
                target.loading = true;
                try {
                    await filesystem.pull(this._selected_repository_path);
                    // Show success notification
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'success';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="check2-circle"></sl-icon>
                        Successfully synchronized with remote repository
                    `;
                    document.body.append(alert);
                    alert.toast();
                } catch (error) {
                    console.error('Failed to synchronize:', error);
                    // Show error notification
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Failed to synchronize with remote repository
                    `;
                    document.body.append(alert);
                    alert.toast();
                } finally {
                    target.loading = false;
                }
            }

            if (target.matches("sl-button#remove-entity")) {
                // TODO: this button should be active only when a file entry is selected
                let repositories_tree = render_root.querySelector("sl-tree#repositories-tree");
                let selected_entry = repositories_tree.querySelector("sl-tree-item[selected]");

                if (selected_entry === null) {
                    // TODO: Put a sl-alert?
                    alert("Select a file to be deleted!");

                    return;
                }

                let entry_type = selected_entry.dataset.entryType;

                if (entry_type !== CONSTANTS.FILE_SCHEME_NAME) {
                    // TODO: Put a sl-alert?
                    alert("Select a file to be deleted!");

                    return;
                }

                let file_relative_path = selected_entry.dataset.entryRelativePath;

                await filesystem.add_file(this._selected_repository_path, file_relative_path);

                // TODO: apply restore_state()
                await this._list_repository_names();
            }

            // Modify the commit-and-push-staged-files button handler
            if (target.matches("sl-button#commit-and-push-staged-files")) {
                target.loading = true;

                try {
                    // Add pull before committing
                    await filesystem.pull(this._selected_repository_path);

                    let staged_file_nodes = [...staged_files_tree.querySelectorAll("sl-tree-item")];
                    let staged_file_paths = staged_file_nodes
                        .map(item => item.dataset.entryRelativePath);
                    let selected_staged_file_paths = staged_file_nodes
                        .filter(item => item.selected)
                        .map(item => item.dataset.entryRelativePath);

                    // Validate selection before committing
                    const missingDirectories = await this._validateStagedSelection(staged_file_paths, selected_staged_file_paths);
                    
                    if (missingDirectories.length > 0) {
                        // Create warning alert
                        const warningAlert = document.createElement('sl-alert');
                        warningAlert.variant = 'warning';
                        warningAlert.closable = true;
                        warningAlert.duration = 10000;
                        warningAlert.innerHTML = `
                            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                            <strong>Warning:</strong> You need to select the following directories to properly commit their contents:
                            <br>
                            ${missingDirectories.join('<br>')}
                            <br><br>
                            Please select both the directories and their files to ensure proper commit.
                        `;
                        document.body.append(warningAlert);
                        warningAlert.toast();
                        return;
                    }

                    let push_result = await filesystem.commit_and_push_file(
                        this._selected_repository_path, 
                        staged_file_paths, 
                        selected_staged_file_paths
                    );
                    
                    if (push_result) {
                        await this._list_staged_files();
                        commit_and_push_done_toast.toast();
                    } else {
                        commit_and_push_error_toast.toast();
                    }
                } catch (error) {
                    console.error('Failed to synchronize before commit:', error);
                    // Show error notification
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Failed to synchronize with remote repository before committing changes. Please try again.
                    `;
                    document.body.append(alert);
                    alert.toast();
                } finally {
                    target.loading = false;
                }
            }
        });

        render_root.addEventListener("adwlm-filesystem-manager:repository-branches", async (event) => {
            let repository_metadata = event.detail;

            let branches = await filesystem.list_branches(repository_metadata);

            add_repository_dialog.repository_branches = branches;
        });

        render_root.addEventListener("adwlm-filesystem-manager:repository-to-add", async (event) => {
            let repository_metadata = event.detail;

            // add the repository
            await filesystem.add_repository(repository_metadata);

            await this._list_repository_names();

            add_repository_dialog.hide();
            add_repository_dialog.reset();
        });

        render_root.addEventListener("adwlm-rename-filesystem-entry-dialog:new-entry-name", async (event) => {
            let new_entry_metadata = event.detail;
            let entry = new_entry_metadata.entry;
            let new_entry_name = new_entry_metadata.name;
            let new_entry_absolute_path = new_entry_metadata.absolute_path;
            let new_entry_relative_path = new_entry_metadata.relative_path;
            let old_entry_absolute_path = new_entry_metadata.old_absolute_path;

            try {
                await filesystem.rename_entry(this._selected_repository_path, old_entry_absolute_path, new_entry_absolute_path, "1008.ttl", new_entry_relative_path);
                entry.dataset.entryName = new_entry_name;
                entry.textContent = new_entry_name;
                entry.dataset.entryAbsolutePath = new_entry_absolute_path;
                entry.dataset.entryRelativePath = new_entry_relative_path;

                if (new_entry_metadata.type === CONSTANTS.REPO_FOLDER_SCHEME_NAME) {
                    this._selected_repository_path = new_entry_absolute_path;
                }

                rename_filesystem_entry_dialog.hide();
            } catch (error) {
                console.error(error);
            }
        });

        this.addEventListener("_save-entity", async (event) => {
            try {
                let entity_to_save = event.detail;
                const result = await filesystem.save_and_stage_file(
                    this._selected_repository_path, 
                    entity_to_save.rdf_contents, 
                    entity_to_save.path
                );

                // Show success notification
                const alert = document.createElement('sl-alert');
                alert.variant = 'success';
                alert.closable = true;
                alert.duration = 6000;
                alert.innerHTML = `
                    <sl-icon slot="icon" name="check2-circle"></sl-icon>
                    Entity successfully created:
                    <br>
                    File: ${result.filename}
                    <br>
                    Entity: ${result.folder.toUpperCase()}
                `;
                document.body.append(alert);
                alert.toast();

                // Force refresh the file list
                const repoTree = this.renderRoot.querySelector("sl-tree#repositories-tree");
                if (repoTree) {
                    const selectedFolder = repoTree.querySelector(`sl-tree-item[data-entry-relative-path="${entity_to_save.path.split('/')[0]}"]`);
                    if (selectedFolder) {
                        // Clear and reload folder contents
                        selectedFolder.innerHTML = '';
                        const entries = await filesystem.list_entries_from_workdir(
                            this._selected_repository_path, 
                            selectedFolder.dataset.entryRelativePath
                        );
                        await this._populate_folder_contents(selectedFolder, entries);
                    }
                }
            } catch (error) {
                console.error('Failed to save entity:', error);
                // Show error message to user
            }
        });

        render_root.addEventListener("sl-show", async (event) => {
            let target = event.target;

            if (target.matches("sl-details")) {
                [...container.querySelectorAll("sl-details")].map(details => (details.open = target === details));
            }

            if (target.matches("sl-details#staged-files-details")) {
                await this._list_staged_files();
            }
        });
    }

    _init() {
        this._displayed_repository_names = [];
        this._staged_files = [];
        this._displayed_staged_files = [];
        this._repository_buttons_disabled = true;
    }

    // initialize the filesystem
    _initialize_filesystem = new Task(
        this,
        async ([]) => {
            await this._list_repository_names();
        },
        () => []
    );

    async _list_repository_names() {
        let repository_names = await filesystem.list_repository_names();

        let displayed_repository_names = repository_names.map(entry_name => {
            let entry_path = `/${entry_name}`;

            return html`<sl-tree-item lazy data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}" data-entry-absolute-path="${entry_path}" data-entry-relative-path="${entry_name}" data-entry-name="${entry_name}">${entry_name}</sl-tree-item>`;
        });
        this._displayed_repository_names = displayed_repository_names;
    }

    async _list_staged_files() {
        // Maybe load the files asynchronously, as they are discovered?
        // The current approach implies 0.5-1.5 seconds for listing the files, for
        // a repo with 4K+ files, so async loading is not needed.
        let tree = this.renderRoot.querySelector("sl-tree#staged-files-tree");
        tree.innerHTML = "";
        tree.insertAdjacentHTML("afterbegin", `<sl-tree-item>Loading files...</sl-tree-item>`);

        let staged_file_relative_paths = await filesystem.list_staged_files(this._selected_repository_path);

        tree.innerHTML = "";

        let tree_items = "";
        // process the files
        for (const staged_file_relative_path of staged_file_relative_paths) {
            let file_name = staged_file_relative_path.includes("/") ? staged_file_relative_path.substring(staged_file_relative_path.lastIndexOf("/") + 1) : staged_file_relative_path;
            let staged_file_absolute_path = `${this._selected_repository_path}/${staged_file_relative_path}`;

            tree_items += `
                <sl-tree-item 
                    data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" 
                    data-entry-absolute-path="${staged_file_absolute_path}" 
                    data-entry-relative-path="${staged_file_relative_path}" 
                    data-entry-name="${file_name}">
                    ${file_name}
                </sl-tree-item>`;
        }

        tree.insertAdjacentHTML("beforeend", tree_items);
    }

    async _populate_folder_contents(folderElement, entries) {
        // Process folders
        for (const folder_relative_path of entries.folders) {
            const folder_name = folder_relative_path.includes("/") ? 
                folder_relative_path.substring(folder_relative_path.lastIndexOf("/") + 1) : 
                folder_relative_path;
            const folder_absolute_path = `${this._selected_repository_path}/${folder_relative_path}`;
            
            folderElement.insertAdjacentHTML('beforeend', 
                `<sl-tree-item lazy 
                    data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}" 
                    data-entry-absolute-path="${folder_absolute_path}"
                    data-entry-relative-path="${folder_relative_path}" 
                    data-entry-name="${folder_name}">
                    ${folder_name}
                </sl-tree-item>`
            );
        }

        // Process files
        for (const file_relative_path of entries.files) {
            const file_name = file_relative_path.includes("/") ? 
                file_relative_path.substring(file_relative_path.lastIndexOf("/") + 1) : 
                file_relative_path;
            const file_absolute_path = `${this._selected_repository_path}/${file_relative_path}`;
            
            folderElement.insertAdjacentHTML('beforeend',
                `<sl-tree-item 
                    data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}"
                    data-entry-absolute-path="${file_absolute_path}"
                    data-entry-relative-path="${file_relative_path}"
                    data-entry-name="${file_name}">
                    ${file_name}
                </sl-tree-item>`
            );
        }
    }

    // Add this method to the ADWLMFilesystemManager class
    async _validateStagedSelection(stagedFiles, selectedFiles) {
        const directoriesNeeded = new Set();
        
        // Check each selected file's parent directory
        for (const filePath of selectedFiles) {
            const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
            if (parentDir && stagedFiles.includes(parentDir)) {
                // Parent directory exists and is staged
                if (!selectedFiles.includes(parentDir)) {
                    directoriesNeeded.add(parentDir);
                }
            }
        }
        
        return Array.from(directoriesNeeded);
    }

    // Add this helper method
    async _shouldPull(repositoryPath) {
        const now = Date.now();
        const lastPull = this._lastPullTimestamp?.[repositoryPath] || 0;
        const PULL_INTERVAL = 5 * 60 * 1000; // 5 minutes
        
        if (now - lastPull > PULL_INTERVAL) {
            this._lastPullTimestamp = {
                ...this._lastPullTimestamp,
                [repositoryPath]: now
            };
            return true;
        }
        return false;
    }

}

window.customElements.define("adwlm-filesystem-manager", ADWLMFilesystemManager);
