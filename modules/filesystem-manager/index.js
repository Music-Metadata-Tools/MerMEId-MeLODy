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
        
        sl-details[data-has-unshared="true"]::part(summary) {
            color: var(--sl-color-warning-500);
            font-weight: var(--sl-font-weight-semibold);
        }
        
        sl-tree-item[data-has-unshared="true"]::part(base) {
            color: var(--sl-color-warning-500);
            font-weight: var(--sl-font-weight-semibold);
        }
        
        sl-tree-item[data-is-unshared="true"]::part(base) {
            color: var(--sl-color-warning-500);
            font-style: italic;
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
        _file_path: {
            type: String,
        },
        _staged_files: {
            type: Array,
        },
        _staged_directories: {
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
        },
        _hasUnsavedChanges: {
            type: Boolean,
            state: false
        },
        _hasSelectedFiles: {
            type: Boolean,
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
                            <sl-button id="synchronize-repository" size="small" title="Synchronize repository" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="arrow-clockwise"></sl-icon>
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
                <sl-details 
                    id="staged-files-details" 
                    summary="${this._hasUnsharedFiles ? 'Share files (!)' : 'Share files'}" 
                    disabled>
                    <sl-button-group>
                        <sl-button 
                            id="commit-and-push-staged-files" 
                            size="small" 
                            title="Share files"
                            ?disabled="${!this._hasSelectedFiles}">
                            <sl-icon name="cloud-upload"></sl-icon>
                        </sl-button>
                        <sl-button
                            id="unstage-files"
                            size="small"
                            title="Unstage selected files"
                            ?disabled="${!this._hasSelectedFiles}">
                            <sl-icon name="arrow-counterclockwise"></sl-icon>
                        </sl-button>
                    </sl-button-group>
                    <sl-tree id="staged-files-tree" selection="multiple">
                        ${this._displayed_staged_files}
                    </sl-tree>
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
            <sl-alert id="unstage-files-done" variant="primary" duration="6000" closable>
                <sl-icon slot="icon" name="info-circle"></sl-icon>
                The selected files were unstaged successfully.
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

        document.addEventListener('adwlm-entity-editor:unsaved-changes', (event) => {
            this._hasUnsavedChanges = event.detail.hasUnsavedChanges;
        });

        render_root.addEventListener("sl-lazy-load", async (event) => {
            let target = event.target;

            if (target.matches("sl-tree#repositories-tree sl-tree-item[lazy]")) {
                let entry_type = target.dataset.entryType;
                let entry_absolute_path = target.dataset.entryAbsolutePath;

                // If loading a repo folder: store repo path and enable staged files details
                if (entry_type === CONSTANTS.REPO_FOLDER_SCHEME_NAME) {
                    this._selected_repository_path = entry_absolute_path;
                    staged_files_details.disabled = false;
                }

                this._generate_folder_tree(target);
            }
        });

        render_root.addEventListener("sl-selection-change", async (event) => {
            let target = event.target;

            // Add this new condition
            if (target.matches("sl-tree#staged-files-tree")) {
                const selectedItems = target.querySelectorAll('sl-tree-item[selected]');
                this._hasSelectedFiles = selectedItems.length > 0;
            }

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
                this._file_path = selection.dataset.entryRelativePath;
                await this._load_entity_to_edit();
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

                // Alert unsaved changes might be deleted or overwritten after pull
                if (this._hasUnsavedChanges) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Unsaved changes might be deleted or overwritten during synchronization.
                    `;
                    document.body.append(alert);
                    alert.toast();
                    target.loading = false;
                    return;
                }

                // Alert that staged files might be deleted or overwritten after pull
                if (this._staged_files && this._staged_files.length > 0) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Staged files might be deleted or overwritten during synchronization.
                    `;
                    document.body.append(alert);
                    alert.toast();
                    target.loading = false;
                    return;
                }

                try {
                    await filesystem.pull(this._selected_repository_path);
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
                        <br><br>
                        <em>${error.message}</em>
                    `;
                    document.body.append(alert);
                    alert.toast();
                } finally {
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

                    // reload the previously selected file, if any
                    if (this._selected_repository_path && this._file_path) {
                        await this._load_entity_to_edit();
                    }

                    // Collect all expanded items before collapsing
                    let expandedItems = [...render_root.querySelectorAll('sl-tree-item[expanded]')].map(item => ({
                        path: item.dataset.entryRelativePath,
                        type: item.dataset.entryType
                    }));

                    // Collapse repository folder
                    let repo_folder_tree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"]`);
                    repo_folder_tree.removeAttribute("expanded");

                    // Re-expand previously expanded items
                    const expandItems = async () => {
                        for (const itemInfo of expandedItems) {
                            const item = render_root.querySelector(`sl-tree-item[data-entry-relative-path="${itemInfo.path}"][data-entry-type="${itemInfo.type}"]`);
                            if (item) {
                                item.setAttribute('expanded', '');
                                // Wait for lazy loading to complete
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    };
                    setTimeout(() => expandItems(), 500);

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

                // Be careful, add_file means remove_file
                await filesystem.add_file(this._selected_repository_path, file_relative_path);

                // Check if the directory is empty after removing the file and remove it if so
                const directory = file_relative_path.split('/')[0];
                let entries = await filesystem.list_entries_from_workdir(this._selected_repository_path, directory);
                if (entries.files.length === 0) {
                    await filesystem.add_file(this._selected_repository_path, directory);
                }

                // Update repository tree
                if (this._selected_repository_path) {
                    let repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);
                    if (repoTree) {
                        this._generate_folder_tree(repoTree);
                    }
                }

                // Update UI
                await this._list_staged_files();
                await this._updateRepositoryTreeStatus();

                // TODO: apply restore_state()
                //await this._list_repository_names();
            }

            if (target.matches("sl-button#commit-and-push-staged-files")) {
                target.loading = true;

                let staged_file_nodes = [...staged_files_tree.querySelectorAll("sl-tree-item")];
                let selected_staged_file_paths = staged_file_nodes
                    .filter(item => item.selected)
                    .map(item => item.dataset.entryRelativePath);

                if (selected_staged_file_paths.length === 0) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'warning';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Please select files to share.
                    `;
                    document.body.append(alert);
                    alert.toast();
                    target.loading = false;
                    return;
                }

                // Get all staged files and directories
                let staged_file_paths = [
                    ...this._staged_files,
                    ...this._staged_directories
                ];

                // Get directories from selected files and check if they need to be committed
                let directories_to_commit = new Set();
                selected_staged_file_paths.forEach(filePath => {
                    if (filePath.includes('/')) {
                        const directory = filePath.split('/')[0];
                        if (staged_file_paths.includes(directory)) {
                            directories_to_commit.add(directory);
                        }
                    }
                });

                // Add found directories to selected paths
                selected_staged_file_paths = [
                    ...selected_staged_file_paths,
                    ...directories_to_commit
                ];

                let push_result = false;
                try {
                    push_result = await filesystem.commit_and_push_file(
                        this._selected_repository_path,
                        staged_file_paths,
                        selected_staged_file_paths
                    );
                } catch (error) {
                    console.error('Failed to share files:', error);
                    // Show error notification
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Failed to share files with remote repository. Try to synchronize before sharing.
                        <br><br>
                        <em>${error.message}</em>
                    `;
                    document.body.append(alert);
                    alert.toast();
                    push_result = false;
                }

                if (push_result) {
                    await this._list_staged_files();
                    this._hasUnsharedFiles = false;
                    this._hasSelectedFiles = false;
                    this._staged_files = [];
                    await this._updateRepositoryTreeStatus();
                    commit_and_push_done_toast.toast();
                    // Clear selections in the staged files tree
                    staged_files_tree.querySelectorAll('sl-tree-item[selected]')
                        .forEach(item => item.selected = false);
                } else {
                    commit_and_push_error_toast.toast();
                }
                target.loading = false;
            }

            if (target.matches("sl-button#unstage-files")) {
                target.loading = true;

                try {
                    let staged_files_tree = this.renderRoot.querySelector("sl-tree#staged-files-tree");
                    let selected_staged_files = [...staged_files_tree.querySelectorAll("sl-tree-item[selected]")]
                        .map(item => ({
                            path: item.dataset.entryRelativePath,
                            absolutePath: item.dataset.entryAbsolutePath
                        }));

                    if (selected_staged_files.length === 0) {
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'warning';
                        alert.closable = true;
                        alert.duration = 6000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                            Please select files to unstage.
                        `;
                        document.body.append(alert);
                        alert.toast();
                        return;
                    }

                    // Unstage each selected file
                    for (const file of selected_staged_files) {
                        await filesystem.unstageFile(this._selected_repository_path, file.path);

                        // Check if the directory is empty after unstage and remove it if so
                        const directory = file.path.split('/')[0];
                        let entries = await filesystem.list_entries_from_workdir(this._selected_repository_path, directory);
                        if (entries.files.length === 0) {
                            await filesystem.unstageFile(this._selected_repository_path, directory);
                        }
                    }

                    // Update repository tree
                    if (this._selected_repository_path) {
                        let repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);
                        if (repoTree) {
                            this._generate_folder_tree(repoTree);
                        }
                    }

                    // Update UI
                    await this._list_staged_files();
                    await this._updateRepositoryTreeStatus();

                    // Clear selections
                    staged_files_tree.querySelectorAll('sl-tree-item[selected]')
                        .forEach(item => item.selected = false);
                    
                    // Update selection state and button states
                    this._hasSelectedFiles = false;
                    
                    // Get remaining files count
                    const remainingFiles = staged_files_tree.querySelectorAll('sl-tree-item');
                    this._hasUnsharedFiles = remainingFiles.length > 0;

                    // Show success message only if the alert exists
                    const unstageAlert = this.renderRoot.querySelector("sl-alert#unstage-files-done");
                    if (unstageAlert) {
                        unstageAlert.toast();
                    }

                } catch (error) {
                    console.error('Failed to unstage files:', error);
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Failed to unstage files. Please try again.
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

        document.addEventListener("adwlm-entity-types-dialog:entity-to-add", async (event) => {
            await this._deselect_files_tree();
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
                    Entity successfully saved:
                    <br>
                    File: ${result.filename}
                    <br>
                    Entity: ${result.folder.toUpperCase()}
                `;
                document.body.append(alert);
                alert.toast();

                // Refresh files tree
                let folder_relative_path = entity_to_save.path.split('/')[0];

                let folderTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}"][data-entry-relative-path="${folder_relative_path}"]`);

                if (folderTree) {
                    this._generate_folder_tree(folderTree);

                } else {
                    // Update repository tree to include the new folder
                    let repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);

                    await this._generate_folder_tree(repoTree);

                    // Expand the new folder in the tree
                    let newfolderTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}"][data-entry-relative-path="${folder_relative_path}"]`)
                    newfolderTree.setAttribute('expanded', '');
                }

                // Update staged files list and tree status
                await this._list_staged_files();
            } catch (error) {
                console.error('Failed to save entity:', error);
                // Show error message to user
            }
        });

        render_root.addEventListener("sl-show", async (event) => {
            let target = event.target;

            // Close all other details when one is shown
            //if (target.matches("sl-details")) {
            //    [...container.querySelectorAll("sl-details")].map(details => (details.open = target === details));
            //}

            if (target.matches("sl-details#repositories-details") && !this._repository_buttons_disabled) {
                await this._list_staged_files();
            }

            if (target.matches("sl-details#staged-files-details") && !this._repository_buttons_disabled) {
                await this._list_staged_files();
            }
        });

        render_root.addEventListener("sl-expand", async (event) => {
            let target = event.target;

            if (target.matches("sl-tree-item") && target.closest("sl-tree#repositories-tree")) {
                await this._list_staged_files();
            }
        });
    }

    _init() {
        this._displayed_repository_names = [];
        this._staged_files = [];
        this._staged_directories = [];
        this._displayed_staged_files = [];
        this._repository_buttons_disabled = true;
        this._hasSelectedFiles = false;
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

    async _generate_folder_tree(treeItem) {
        // Collect all expanded items before clearing items
        let expandedItems = [...treeItem.querySelectorAll('sl-tree-item[expanded]')].map(item => ({
            path: item.dataset.entryRelativePath,
            type: item.dataset.entryType
        }));

        // Clear existing subitems
        treeItem.innerHTML = treeItem.dataset.entryName;

        // Get data from the tree item
        let entry_type = treeItem.dataset.entryType;                   //e.g. "folder"
        let entry_absolute_path = treeItem.dataset.entryAbsolutePath;  //e.g. "/repo/persons"
        let entry_relative_path = treeItem.dataset.entryRelativePath;  //e.g. "persons"
        let repository_path = this._selected_repository_path;          //e.g. "/repo"

        // Get files and directories in folder
        let entries = await filesystem.list_entries_from_workdir(repository_path, entry_relative_path);

        let tree_subitems = ""
        // insert subfolders in tree
        for (const folder_relative_path of entries.folders) {
            let folder_name = folder_relative_path;
            let folder_absolute_path = `${repository_path}/${folder_relative_path}`;

            tree_subitems += `<sl-tree-item lazy data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}" data-entry-absolute-path="${folder_absolute_path}" data-entry-relative-path="${folder_relative_path}" data-entry-name="${folder_name}">${folder_name}</sl-tree-item>`;
        }

        // insert files in tree
        for (const file_relative_path of entries.files) {
            let file_name = file_relative_path.includes("/") ? file_relative_path.substring(file_relative_path.lastIndexOf("/") + 1) : file_relative_path;
            let file_absolute_path = `${repository_path}/${file_relative_path}`;

            tree_subitems += `<sl-tree-item data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" data-entry-absolute-path="${file_absolute_path}" data-entry-relative-path="${file_relative_path}" data-entry-name="${file_name}">${file_name}</sl-tree-item>`;
        }

        // Re-expand previously expanded items
        const expandItems = async () => {
            for (const itemInfo of expandedItems) {
                const item = treeItem.querySelector(`sl-tree-item[data-entry-relative-path="${itemInfo.path}"][data-entry-type="${itemInfo.type}"]`);
                if (item) {
                    item.setAttribute('expanded', '');
                    // Wait for lazy loading to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        };
        setTimeout(() => expandItems(), 500);

        // Insert subitems into the input tree
        treeItem.insertAdjacentHTML("beforeend", tree_subitems);
    }

    async _load_entity_to_edit() {
        try {
            // Only pull if needed
            //if (await this._shouldPull(this._selected_repository_path)) {
            //    await filesystem.pull(this._selected_repository_path);
            //}
            let file_contents = await filesystem.read_file(this._selected_repository_path, this._file_path);
            if (!file_contents || file_contents.trim() === "") {
                const alert = document.createElement('sl-alert');
                alert.variant = 'warning';
                alert.closable = true;
                alert.duration = 6000;
                alert.innerHTML = `
                    <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                    The selected file is empty or does not exist anymore.
                `;
                document.body.append(alert);
                alert.toast();
                return;
            }

            let entity_to_edit = {
                contents: file_contents,
                path: this._file_path,
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
                <br><br>
                <em>${error.message}</em>
            `;
            document.body.append(alert);
            alert.toast();
        }
    }

    async _deselect_files_tree(){
        const treeContainer = this.renderRoot.querySelector('#repositories-tree-container');
        if (!treeContainer) return;

        // Find selected tree items
        const selectedItems = treeContainer.querySelectorAll('sl-tree-item[selected]');

        // Remove selected attribute from each item
        selectedItems.forEach(item => {
            item.removeAttribute('selected');
        });
    }

    async _list_staged_files() {
        // Maybe load the files asynchronously, as they are discovered?
        // The current approach implies 0.5-1.5 seconds for listing the files, for
        // a repo with 4K+ files, so async loading is not needed.
        const tree = this.renderRoot.querySelector("sl-tree#staged-files-tree");
        const details = this.renderRoot.querySelector("sl-details#staged-files-details");
        tree.innerHTML = "";
        tree.insertAdjacentHTML("afterbegin", `<sl-tree-item>Loading files...</sl-tree-item>`);

        let staged_file_relative_paths = await filesystem.list_staged_files(this._selected_repository_path);

        // Reset arrays
        this._staged_files = [];
        this._staged_directories = [];

        // Sort files and directories in different arrays
        staged_file_relative_paths.forEach(path => {
            if (path.includes("/") && path.includes('.ttl')) {
                this._staged_files.push(path);
            } else {
                this._staged_directories.push(path);
            }
        });

        // Update repository tree to show unshared status
        await this._updateRepositoryTreeStatus();

        // Update unshared files status
        this._hasUnsharedFiles = staged_file_relative_paths.length > 0;
        details.setAttribute('data-has-unshared', this._hasUnsharedFiles);

        tree.innerHTML = "";

        let tree_items = "";
        // process the files
        for (const staged_file of this._staged_files) {
            let file_name = staged_file.split('/')[1];
            let staged_file_absolute_path = `${this._selected_repository_path}/${staged_file}`;

            tree_items += `
                <sl-tree-item 
                    data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" 
                    data-entry-absolute-path="${staged_file_absolute_path}" 
                    data-entry-relative-path="${staged_file}"
                    data-entry-name="${file_name}">
                    ${staged_file}
                </sl-tree-item>`;
        }

        tree.insertAdjacentHTML("beforeend", tree_items);
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

    async _updateRepositoryTreeStatus() {
        const repoTree = this.renderRoot.querySelector("sl-tree#repositories-tree");
        if (!repoTree || !this._staged_files) return;
    
        // Reset all statuses
        repoTree.querySelectorAll('sl-tree-item').forEach(item => {
            item.removeAttribute('data-has-unshared');
            item.removeAttribute('data-is-unshared');
        });
    
        // Mark unshared files and their parent folders
        this._staged_files.forEach(stagedPath => {
            // Mark the file itself
            const fileItem = repoTree.querySelector(`sl-tree-item[data-entry-relative-path="${stagedPath}"]`);
            if (fileItem) {
                fileItem.setAttribute('data-is-unshared', 'true');
            }
    
            // Mark all parent folders
            let currentPath = stagedPath;
            while (currentPath.includes('/')) {
                currentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
                const folderItem = repoTree.querySelector(`sl-tree-item[data-entry-relative-path="${currentPath}"]`);
                if (folderItem) {
                    folderItem.setAttribute('data-has-unshared', 'true');
                }
            }
    
            // Mark root folder if it contains unshared files
            const rootFolder = stagedPath.split('/')[0];
            const rootItem = repoTree.querySelector(`sl-tree-item[data-entry-relative-path="${rootFolder}"]`);
            if (rootItem) {
                rootItem.setAttribute('data-has-unshared', 'true');
            }
        });
    }
}

window.customElements.define("adwlm-filesystem-manager", ADWLMFilesystemManager);
