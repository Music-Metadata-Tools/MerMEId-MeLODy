import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import "./add-repository-dialog/index.js";
import "./rename-filesystem-entry-dialog/index.js";
import "./repository-settings-dialog/index.js";
import "./catalog-settings-dialog/index.js";
import * as CONSTANTS from "./constants.js";
import { filesystemService } from "../services/filesystem-service.js";

const filesystem = filesystemService.getInstance();

const styles =
    css`
        #commit-message-field {
            margin-top: 20px;
            margin-bottom: 20px;
        }
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

        sl-tree#staged-files-tree {
            --indent-size: 0;
            --indent-guide-width: 0;
            margin-top: var(--sl-spacing-small);
        }

        sl-tree#staged-files-tree sl-tree-item::part(expand-button) {
            display: none;
        }

        sl-tree#staged-files-tree sl-tree-item::part(item) {
            padding-inline-start: var(--sl-spacing-x-small);
        }
    `;

export default class ADWLMFilesystemManager extends LitElement {

    static properties = {
        _displayed_repository_names: {
            type: Array,
        },
        entity_type_definitions: {
            type: Object,
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
        },
        _allSelected: {
            type: Boolean,
            state: true
        },
        _commit_message: {
            type: String
        },
        _hasRemote: {
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

        this._onUnsavedChanges = (event) => {
            this._hasUnsavedChanges = event.detail.hasUnsavedChanges;
        };
        this._onEntityDeleteRequested = async () => {
            await this._removeSelectedEntity();
        };
        this._onExternalEntitySelected = async (event) => {
            const requestedPath = event.detail.filename;
            const selected = await this.selectEntityInTree(requestedPath);
            if (selected) return;

            // Fallback to previous behavior if tree sync fails.
            this._file_path = requestedPath;
            await this._load_entity_to_edit();
        };

        this._allSelected = false;
    
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
                            <sl-button id="synchronize-repository" size="small" title="Synchronize repository" ?disabled="${this._repository_buttons_disabled || !this._hasRemote}">
                                <sl-icon name="cloud-download"></sl-icon>
                            </sl-button>
                        </sl-button-group>
                        <sl-button-group>
                            <sl-button id="remove-entity" size="small" title="Remove entity" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="file-earmark-minus"></sl-icon>
                            </sl-button>
                            <sl-button id="repository-settings" size="small" title="Repository settings" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="gear"></sl-icon>
                            </sl-button>
                            <sl-button id="catalog-settings" size="small" title="Catalog settings" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="journal-bookmark"></sl-icon>
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
                            id="select-all-button"
                            size="small"
                            title="Select/Deselect all"
                            variant="${this._allSelected ? 'primary' : 'default'}">
                            <sl-icon name="check-square"></sl-icon>
                        </sl-button>
                        <sl-button
                            id="commit-and-push-staged-files"
                            size="small"
                            title="Share files"
                            ?disabled="${!this._hasSelectedFiles || !this._hasRemote}">
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

                    <sl-input size="small" id="commit-message-field" label="Commit-Message"></sl-input>
                    

                </sl-details>
            </div>
            <adwlm-add-repository-dialog></adwlm-add-repository-dialog>
            <adwlm-rename-filesystem-entry-dialog></adwlm-rename-filesystem-entry-dialog>
            <adwlm-repository-settings-dialog></adwlm-repository-settings-dialog>
            <adwlm-catalog-settings-dialog></adwlm-catalog-settings-dialog>
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
        let repository_settings_dialog = render_root.querySelector("adwlm-repository-settings-dialog");
        let catalog_settings_dialog = render_root.querySelector("adwlm-catalog-settings-dialog");
        let container = render_root.querySelector("div#container");
        let staged_files_details = render_root.querySelector("sl-details#staged-files-details");
        let staged_files_tree = render_root.querySelector("sl-tree#staged-files-tree");
        let commit_and_push_done_toast = render_root.querySelector("sl-alert#commit-and-push-done");
        let commit_and_push_error_toast = render_root.querySelector("sl-alert#commit-and-push-error");

        render_root.addEventListener("sl-lazy-load", async (event) => {
            let target = event.target;

            if (target.matches("sl-tree#repositories-tree sl-tree-item[lazy]")) {
                let entry_type = target.dataset.entryType;
                let entry_absolute_path = target.dataset.entryAbsolutePath;

                // If loading a repo folder: store repo path and enable staged files details
                if (entry_type === CONSTANTS.REPO_FOLDER_SCHEME_NAME) {
                    if (!(await this._ensureRepositoryAccess(entry_absolute_path))) {
                        return;
                    }

                    this._selected_repository_path = entry_absolute_path;
                    staged_files_details.disabled = false;
                    await this._updateHasRemote();
                    await this._ensureCatalogAndMainFeed(entry_absolute_path);

                    // Dispatch event with repository path
                    this.dispatchEvent(new CustomEvent('adwlm-filesystem-manager:item-selected', {
                        detail: { repositoryPath: this._selected_repository_path },
                        bubbles: true,
                        composed: true
                    }));
                }

                await this._generate_folder_tree(target);
            }
        });

        render_root.addEventListener("sl-selection-change", async (event) => {
            let target = event.target;
            if (target.matches("sl-tree#staged-files-tree")) {
                const allItems = target.querySelectorAll('sl-tree-item');
                const selectedItems = target.querySelectorAll('sl-tree-item[selected]');
                this._hasSelectedFiles = selectedItems.length > 0;
                this._allSelected = allItems.length > 0 && allItems.length === selectedItems.length;
            }


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
                    let entry_absolute_path = selected_tree_item.dataset.entryAbsolutePath;

                    if (!(await this._ensureRepositoryAccess(entry_absolute_path))) {
                        return;
                    }

                    this._selected_repository_path = entry_absolute_path;
                    staged_files_details.disabled = false;
                    await this._updateHasRemote();
                    await this._ensureCatalogAndMainFeed(entry_absolute_path);

                    // Dispatch event with repository path
                    this.dispatchEvent(new CustomEvent('adwlm-filesystem-manager:repository-selected', {
                        detail: { repositoryPath: this._selected_repository_path },
                        bubbles: true,
                        composed: true
                    }));
                }
            }

            if (selection && selection.matches(`sl-tree#repositories-tree sl-tree-item[data-entry-type = '${CONSTANTS.FILE_SCHEME_NAME}']`)) {
                await this._handleRepositoryFileSelection(selection);
            }
        });

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            if (target.matches("sl-button")) {
                target.blur();
            }

            if (target.matches("sl-button#select-all-button")) {
                this._allSelected = !this._allSelected;
                staged_files_tree.querySelectorAll('sl-tree-item')
                    .forEach(item => item.selected = this._allSelected);
                this._hasSelectedFiles = this._allSelected;
            }

            if (target.matches("sl-button#add-repository")) {
                add_repository_dialog.repository_names = await filesystem.list_repository_names();
                add_repository_dialog.show();
            }

            if (target.matches("sl-button#remove-repository")) {
                target.loading = true;

                await filesystem.remove_repository(this._selected_repository_path);
                await filesystem.remove_local_repository(this._selected_repository_path.split("/")[1]);
                await this._list_repository_names();

                // Clear staged files details
                await this._list_staged_files();
                this._hasUnsharedFiles = false;
                this._hasSelectedFiles = false;
                this._staged_files = [];

                // Disable buttons and details
                this._repository_buttons_disabled = true;
                this._hasRemote = false;
                staged_files_details.disabled = true;

                // Clear the entity editor
                this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:clear-entity-editor", {
                    "bubbles": true,
                    "composed": true,
                }));

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

            if (target.matches("sl-button#repository-settings")) {
                await repository_settings_dialog.show(this._selected_repository_path);
            }

            if (target.matches("sl-button#catalog-settings")) {
                await catalog_settings_dialog.show(this._selected_repository_path);
            }

            if (target.matches("sl-button#synchronize-repository")) {
                target.loading = true;
                // Alert missing personal access token
                const hasToken = await filesystem.has_token(this._selected_repository_path);
                console.log(`Personal Access token`)
                console.log(hasToken)
                if (!hasToken) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        No personal access token. Synchronizing is not possible. 
                    `;
                    document.body.append(alert);
                    alert.toast();
                    target.loading = false;
                    return;
                }

                const canMerge = await filesystem.canPullSafely(this._selected_repository_path, this._staged_files);
                
                if (canMerge[1] === 0) {
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'success';
                        alert.closable = true;
                        alert.duration = 6000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="check2-circle"></sl-icon>
                            Synchronizing is not necessary: There are no remote changes.
                        `;
                        document.body.append(alert);
                        alert.toast();
                        target.loading = false;
                        return;
                    }

                // Alert unsaved changes might be deleted or overwritten after pull
                if (this._hasUnsavedChanges) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Unsaved changes might be deleted or overwritten during synchronization. 
                        Please save or undo your changes before synchronizing.
                    `;
                    document.body.append(alert);
                    alert.toast();
                    target.loading = false;
                    return;
                }

                // Alert that staged files might be deleted or overwritten after pull
                if (this._staged_files && this._staged_files.length > 0) {
                    
                    if (canMerge[1] === 0) {
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'success';
                        alert.closable = true;
                        alert.duration = 6000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="check2-circle"></sl-icon>
                            Synchronizing is not necessary: There are no remote changes.
                        `;
                        document.body.append(alert);
                        alert.toast();
                        target.loading = false;
                        return;
                    }
                    else if (canMerge[0] === false) {
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'danger';
                        alert.closable = true;
                        alert.duration = 6000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                            Synchronizing is not possible: Some files have been modified both locally and remotely. 
                            Please undo your local changes before synchronizing.
                        `;
                        document.body.append(alert);
                        alert.toast();
                        target.loading = false;
                        return;
                    }
                }

                try {
                    let staged_before_pull = [];
                    if (this._staged_files && this._staged_files.length > 0) {
                        staged_before_pull = await Promise.all(
                            this._staged_files.map(async (path) => {
                                const isDeleted = path.endsWith('-deleted');

                                if (isDeleted) {
                                    return {
                                        path,
                                        isDeleted: true
                                    };
                                }

                                const content = await filesystem.read_file(
                                    this._selected_repository_path,
                                    path
                                );

                                return {
                                    path,
                                    content,
                                    isDeleted: false
                                };
                            })
                        );
                    }

                    await filesystem.pull(this._selected_repository_path);
                    for (const file of staged_before_pull) {
                        try {
                            if (file.isDeleted) {
                                const originalPath = file.path.replace(/-deleted$/, '');

                                await filesystem.add_file(
                                    this._selected_repository_path,
                                    originalPath
                                );
                            } else {
                                await filesystem.save_and_stage_file(
                                    this._selected_repository_path,
                                    file.content,
                                    file.path
                                );
                            }
                        } catch (e) {
                            console.error("Failed to restore staged file:", file.path, e);
                        }
                    }
                    
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
                        Successfully synchronized with remote repository.
                    `;
                    document.body.append(alert);
                    alert.toast();
                    
                    this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:build-indexes", {
                        bubbles: true,
                        composed: true
                    }));
                    // Notify entity-search to reload indexes
                    document.dispatchEvent(new CustomEvent("adwlm-entity-search:reload-indexes", {
                        bubbles: true,
                        composed: true
                    }));

                    // Update repository tree
                    if (this._selected_repository_path) {
                        let repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);
                        if (repoTree) {
                            this._generate_folder_tree(repoTree);
                        }
                    }

                    target.loading = false;
                }
            }

            if (target.matches("sl-button#remove-entity")) {
                await this._removeSelectedEntity();
            }

            if (target.matches("sl-button#commit-and-push-staged-files")) {
                target.loading = true;
                
                const canMerge = await filesystem.canPullSafely(this._selected_repository_path, this._staged_files);
                if (canMerge[0] === false) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'danger';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                        Sharing is not possible: Some files have been modified both locally and remotely. 
                        Please synchronize before sharing.
                    `;
                    document.body.append(alert);
                    alert.toast();
                    target.loading = false;
                    return;
                } else if (canMerge[1] === 0) {
                } else if (canMerge[0] === true) {
                    let staged_before_pull = [];
                    if (this._staged_files && this._staged_files.length > 0) {
                        staged_before_pull = await Promise.all(
                            this._staged_files.map(async (path) => {
                                const isDeleted = path.endsWith('-deleted');

                                if (isDeleted) {
                                    return {
                                        path,
                                        isDeleted: true
                                    };
                                }

                                const content = await filesystem.read_file(
                                    this._selected_repository_path,
                                    path
                                );

                                return {
                                    path,
                                    content,
                                    isDeleted: false
                                };
                            })
                        );
                    }

                    await filesystem.pull(this._selected_repository_path);
                    for (const file of staged_before_pull) {
                        try {
                            if (file.isDeleted) {
                                const originalPath = file.path.replace(/-deleted$/, '');

                                await filesystem.add_file(
                                    this._selected_repository_path,
                                    originalPath
                                );
                            } else {
                                await filesystem.save_and_stage_file(
                                    this._selected_repository_path,
                                    file.content,
                                    file.path
                                );
                            }
                        } catch (e) {
                            console.error("Failed to restore staged file:", file.path, e);
                        }
                    }
                }

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

                this._commit_message = render_root.querySelector('#commit-message-field')?.value ?? '';

                let push_result = false;
                try {
                    push_result = await filesystem.commit_and_push_file(
                        this._selected_repository_path,
                        staged_file_paths,
                        selected_staged_file_paths,
                        this._commit_message
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
                    this._allSelected = false;
                    this._staged_files = [];
                    await this._updateRepositoryTreeStatus();
                    commit_and_push_done_toast.toast();
                    // Clear selections in the staged files tree
                    staged_files_tree.querySelectorAll('sl-tree-item[selected]')
                        .forEach(item => item.selected = false);
                    render_root.querySelector('#commit-message-field').value = '';

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

                    try {
                        const generatedIndexes = await filesystem.generate_indexes_for_all_files(
                            this._selected_repository_path,
                            selected_staged_files.map(file => file.path.split('/')[0]),
                        );

                        // Log which indexes were generated
                        const successfulIndexes = Object.entries(generatedIndexes)
                            .filter(([_, result]) => result.success)
                            .map(([name, _]) => name);

                        if (successfulIndexes.length > 0) {
                            const alert = document.createElement('sl-alert');
                            alert.variant = 'success';
                            alert.closable = true;
                            alert.duration = 6000;
                            alert.innerHTML = `
                                <sl-icon slot="icon" name="check2-circle"></sl-icon>
                                Successfully generated indexes for: ${successfulIndexes.join(', ')}
                            `;
                            document.body.append(alert);
                            alert.toast();
                        }
                    } catch (error) {
                        console.error('Error generating indexes:', error);
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'danger';
                        alert.closable = true;
                        alert.duration = 6000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                            Failed to generate indexes for cloned files. ${error.message}
                        `;
                        document.body.append(alert);
                        alert.toast();
                    }

                    document.dispatchEvent(new CustomEvent("adwlm-entity-search:reload-indexes", {
                        bubbles: true,
                        composed: true
                    }));

                    // Update repository tree
                    if (this._selected_repository_path) {
                        let repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);
                        if (repoTree) {
                            this._generate_folder_tree(repoTree);
                        }
                    }

                    // reload the previously selected file, if any
                    if (this._selected_repository_path && this._file_path) {
                        
                        await this._load_entity_to_edit();

                        await this.selectEntityInTree(this._file_path);
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

            try {
                let branches = await filesystem.list_branches(repository_metadata);
                add_repository_dialog.repository_branches = branches;
            } catch (error) {
                console.error("Failed to list branches:", error);
                add_repository_dialog.reportBranchLoadError();
            }
        });

        render_root.addEventListener("adwlm-filesystem-manager:repository-to-add", async (event) => {
            let repository_metadata = event.detail;

            // add the repository
            await filesystem.add_repository(repository_metadata, {
                onProgress: (current, total) => {
                    add_repository_dialog.clone_progress = { current, total };
                },
            });

            await this._ensureCatalogAndMainFeed(`/${repository_metadata.folder}`);

            await this._list_repository_names();

            add_repository_dialog.hide();
            add_repository_dialog.reset();

            this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:build-indexes", {
                bubbles: true,
                composed: true
            }));
        });

        render_root.addEventListener("adwlm-filesystem-manager:add-local-repository", async (event) => {
            console.log("Event received: add-local-repository", event.detail);
            
            await this._list_repository_names();

            const { repoName } = event.detail;
            this._selected_repository_path = `/${repoName}`;
            await this._updateHasRemote();
            await this._ensureCatalogAndMainFeed(this._selected_repository_path);

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
                const isQuickAdd = entity_to_save?.isQuickAdd === true;
                const result = await filesystem.save_and_stage_file(
                    this._selected_repository_path, 
                    entity_to_save.rdf_contents, 
                    entity_to_save.path
                );

                if (!isQuickAdd) {
                    this._file_path = entity_to_save.path;
                }

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


                try {
                        const generatedIndexes = await filesystem.generate_indexes_for_saved_file(
                            this._selected_repository_path,
                            entity_to_save.path, false
                        );

                        // Log which indexes were generated
                        const successfulIndexes = Object.entries(generatedIndexes)
                            .filter(([_, result]) => result.success)
                            .map(([name, _]) => name);

                        if (successfulIndexes.length > 0) {
                            const alert = document.createElement('sl-alert');
                            alert.variant = 'success';
                            alert.closable = true;
                            alert.duration = 6000;
                            alert.innerHTML = `
                                <sl-icon slot="icon" name="check2-circle"></sl-icon>
                                Successfully generated index for: ${successfulIndexes.join(', ')}
                            `;
                            document.body.append(alert);
                            alert.toast();
                        }
                    } catch (error) {
                        console.error('Error generating indexes:', error);
                        const alert = document.createElement('sl-alert');
                        alert.variant = 'danger';
                        alert.closable = true;
                        alert.duration = 6000;
                        alert.innerHTML = `
                            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                            Failed to generate indexes for saved file. ${error.message}
                        `;
                        document.body.append(alert);
                        alert.toast();
                        // Don't fail the push if index generation fails
                        // Just log the error
                    }

                    // For regular saves, keep selection aligned with saved file.
                    // For Quick Add, keep the current editor context unchanged.
                    if (!isQuickAdd && this._selected_repository_path && this._file_path) {
                        await this.selectEntityInTree(this._file_path);
                    }

                    // Update UI
                    await this._list_staged_files();
                    await this._updateRepositoryTreeStatus();

                    document.dispatchEvent(new CustomEvent("adwlm-entity-search:reload-indexes", {
                        bubbles: true,
                        composed: true
                    }));

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

        document.addEventListener("adwlm-filesystem-manager:build-indexes", async (event) => {
            try {
                const generatedIndexes = await filesystem.generate_indexes_for_all_files(
                    this._selected_repository_path,
                    [...this.entity_type_definitions.map(def => def.folder_name), 'dataCatalogs']
                );

                // Log which indexes were generated
                const successfulIndexes = Object.entries(generatedIndexes)
                    .filter(([_, result]) => result.success)
                    .map(([name, _]) => name);

                if (successfulIndexes.length > 0) {
                    const alert = document.createElement('sl-alert');
                    alert.variant = 'success';
                    alert.closable = true;
                    alert.duration = 6000;
                    alert.innerHTML = `
                        <sl-icon slot="icon" name="check2-circle"></sl-icon>
                        Successfully generated indexes for: ${successfulIndexes.join(', ')}
                    `;
                    document.body.append(alert);
                    alert.toast();
                }
            } catch (error) {
                console.error('Error generating indexes:', error);
                const alert = document.createElement('sl-alert');
                alert.variant = 'danger';
                alert.closable = true;
                alert.duration = 6000;
                alert.innerHTML = `
                    <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                    Failed to generate indexes for cloned files. ${error.message}
                `;
                document.body.append(alert);
                alert.toast();
            }
            // Update repository tree
            if (this._selected_repository_path) {
                let repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);
                if (repoTree) {
                    this._generate_folder_tree(repoTree);
                }
            }
            // reload the previously selected file, if any
            if (this._selected_repository_path && this._file_path) {
                
                await this._load_entity_to_edit();

                await this.selectEntityInTree(this._file_path);
            }

            // Update UI
            await this._list_staged_files();
            await this._updateRepositoryTreeStatus();
        });
    }

    _init() {
        this._displayed_repository_names = [];
        this._staged_files = [];
        this._staged_directories = [];
        this._displayed_staged_files = [];
        this._repository_buttons_disabled = true;
        this._hasSelectedFiles = false;
        this._hasRemote = false;
    }

    // Re-grants access to a local (File System Access API) repository whose
    // directory handle survived a reload but whose permission did not - a
    // browser restart resets permission to "prompt", and only a user gesture
    // (this is called from click/selection handlers) can re-request it.
    async _ensureRepositoryAccess(repository_absolute_path) {
        let repository_name = repository_absolute_path.replace(/^\//, "");
        let access_granted = await filesystem.ensure_local_repository_access(repository_name);

        if (!access_granted) {
            const alert = document.createElement('sl-alert');
            alert.variant = 'warning';
            alert.closable = true;
            alert.duration = 6000;
            alert.innerHTML = `
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                Access to the local folder '${repository_name}' was not granted. Please try again and allow access.
            `;
            document.body.append(alert);
            alert.toast();
        }

        return access_granted;
    }

    async _updateHasRemote() {
        this._hasRemote = this._selected_repository_path
            ? await filesystem.has_remote(this._selected_repository_path)
            : false;
    }

    async _ensureCatalogAndMainFeed(repository_path) {
        const CATALOG_PATH = "dataCatalogs/catalog.ttl";
        const FEED_PATH = "dataFeeds/main.ttl";

        let domain = "urn:uuid:";
        try {
            const configContent = await filesystem.read_file(repository_path, "configuration/config.json");
            if (configContent && configContent.trim() !== "") {
                const config = JSON.parse(configContent);
                domain = config?.projectDomain ?? domain;
            }
        } catch (error) {
            // No/invalid config.json: fall back to the default domain, matching
            // the entity editor's own fallback behaviour.
        }

        const catalogIri = `${domain}dataCatalogs/catalog`;
        const feedIri = `${domain}dataFeeds/main`;

        const existingCatalog = await filesystem.read_file(repository_path, CATALOG_PATH).catch(() => "");
        if (!existingCatalog || existingCatalog.trim() === "") {
            const repoName = repository_path.split("/").pop();
            const catalogTtl = `@prefix melod: <https://lod.academy/melod/vocab/ontology#> .
@prefix schema: <https://schema.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<${catalogIri}> a schema:DataCatalog, melod:DataCatalog ;
    rdfs:label "${repoName}" ;
    melod:usesApplication "MerMEId MeLODy" .
`;
            await filesystem.save_and_stage_file(repository_path, catalogTtl, CATALOG_PATH);
            await filesystem.generate_indexes_for_saved_file(repository_path, CATALOG_PATH, false).catch(() => {});
        }

        const existingFeed = await filesystem.read_file(repository_path, FEED_PATH).catch(() => "");
        if (!existingFeed || existingFeed.trim() === "") {
            const feedTtl = `@prefix melod: <https://lod.academy/melod/vocab/ontology#> .
@prefix schema: <https://schema.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<${feedIri}> a schema:DataFeed, melod:DataFeed ;
    rdfs:label "All works" ;
    schema:includedInDataCatalog <${catalogIri}> .
`;
            await filesystem.save_and_stage_file(repository_path, feedTtl, FEED_PATH);
            await filesystem.generate_indexes_for_saved_file(repository_path, FEED_PATH, false).catch(() => {});
        }
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
        
        // If there are repositories and no repository is currently selected,
        // automatically select the first repository so other components
        // (editor, search) can load the repository config without requiring
        // an explicit user click.
        if (repository_names.length > 0 && !this._selected_repository_path) {
            let first_repository_name = repository_names[0];

            // No user gesture is available here (this runs on load), so a local
            // repository whose permission reset to "prompt" over a browser
            // restart can't be silently reconnected - leave it unselected and
            // let the user pick it explicitly, which does carry a gesture.
            if (await filesystem.ensure_local_repository_access(first_repository_name)) {
                this._selected_repository_path = `/${first_repository_name}`;
                await this._updateHasRemote();

                // Dispatch the repository-selected event so listeners react as if
                // the user selected the repository in the UI.
                this.dispatchEvent(new CustomEvent('adwlm-filesystem-manager:repository-selected', {
                    detail: { repositoryPath: this._selected_repository_path },
                    bubbles: true,
                    composed: true
                }));
            }
        }
    }

    async _generate_folder_tree(treeItem) {
        if (treeItem?.dataset?.loading === "true") {
            return;
        }
        treeItem.dataset.loading = "true";

        try {
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
            let folder_name = folder_relative_path.includes("/") ? folder_relative_path.substring(folder_relative_path.lastIndexOf("/") + 1) : folder_relative_path;
            let folder_absolute_path = `${repository_path}/${folder_relative_path}`;

            if (this.entity_type_definitions.filter(definition => definition.folder_name === folder_name)[0]?.folder_name) {
                tree_subitems += `<sl-tree-item lazy data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}" data-entry-absolute-path="${folder_absolute_path}" data-entry-relative-path="${folder_relative_path}" data-entry-name="${folder_name}">${folder_name}</sl-tree-item>`;
            }
            
        }

        // insert files in tree
        for (const file_relative_path of entries.files) {
            let file_name = file_relative_path.includes("/") ? file_relative_path.substring(file_relative_path.lastIndexOf("/") + 1) : file_relative_path;
            let file_absolute_path = `${repository_path}/${file_relative_path}`;

            if (file_name.endsWith('.ttl') || file_name.endsWith('.rdf')) {
                tree_subitems += `<sl-tree-item data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" data-entry-absolute-path="${file_absolute_path}" data-entry-relative-path="${file_relative_path}" data-entry-name="${file_name}">${file_name}</sl-tree-item>`;
            }
            
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
        treeItem.removeAttribute("lazy");
        treeItem.dataset.loaded = "true";
        } finally {
            delete treeItem.dataset.loading;
        }
    }

    async selectEntityInTree(relativePath) {
        if (!relativePath) return false;

        const repositoriesTree = this.renderRoot.querySelector("sl-tree#repositories-tree");
        if (!repositoriesTree || !this._selected_repository_path) return false;

        const repoItem = repositoriesTree.querySelector(
            `sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`
        );
        if (!repoItem) return false;

        repoItem.setAttribute("expanded", "");
        await this._generate_folder_tree(repoItem);

        // Open folder chain (folder1/folder2/file.ttl)
        const segments = String(relativePath).split("/").filter(Boolean);
        const folderSegments = segments.slice(0, -1);
        let currentPath = "";
        for (const segment of folderSegments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const folderItem = repositoriesTree.querySelector(
                `sl-tree-item[data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}"][data-entry-relative-path="${currentPath}"]`
            );
            if (!folderItem) break;
            folderItem.setAttribute("expanded", "");
            await this._generate_folder_tree(folderItem);
        }

        let fileItem = repositoriesTree.querySelector(
            `sl-tree-item[data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}"][data-entry-relative-path="${relativePath}"]`
        );

        if (!fileItem) {
            const fileName = segments[segments.length - 1] || relativePath;
            fileItem = repositoriesTree.querySelector(
                `sl-tree-item[data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}"][data-entry-name="${fileName}"]`
            );
        }

        if (!fileItem) return false;

        repositoriesTree.querySelectorAll("sl-tree-item[selected]").forEach((item) => {
            item.selected = false;
            item.removeAttribute("selected");
        });
        fileItem.selected = true;
        fileItem.setAttribute("selected", "");
        this._repository_buttons_disabled = false;
        await this._handleRepositoryFileSelection(fileItem);

        return true;
    }

    async _handleRepositoryFileSelection(fileItem) {
        if (fileItem.dataset.entryRelativePath === this._file_path) {
            this._file_path = fileItem.dataset.entryRelativePath;
        }
        else {
            this._file_path = fileItem.dataset.entryRelativePath;
            await this._load_entity_to_edit();
        }
        
    }

    async _load_entity_to_edit() {
        try {
            //console.log(_file_path)
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
            if (error.name == 'TypeError') {
                const alert = document.createElement('sl-alert');
                alert.variant = 'danger';
                alert.closable = true;
                alert.duration = 6000;
                alert.innerHTML = `
                    <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                    No repository selected to load file. Please choose the repository.
                `;
                document.body.append(alert);
                alert.toast();
            }
            else {
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
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener("adwlm-entity-editor:unsaved-changes", this._onUnsavedChanges);
        document.addEventListener("adwlm-entity-editor:entity-to-delete", this._onEntityDeleteRequested);
        window.addEventListener("entity-selected", this._onExternalEntitySelected);
    }

    disconnectedCallback() {
        document.removeEventListener("adwlm-entity-editor:unsaved-changes", this._onUnsavedChanges);
        document.removeEventListener("adwlm-entity-editor:entity-to-delete", this._onEntityDeleteRequested);
        window.removeEventListener("entity-selected", this._onExternalEntitySelected);
        super.disconnectedCallback();
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
        const details = this.renderRoot.querySelector("sl-details#staged-files-details");

        // Loading placeholder - goes through the reactive _displayed_staged_files
        // property (see below), not direct DOM manipulation, so it doesn't get
        // wiped by the next unrelated re-render.
        this._displayed_staged_files = [html`<sl-tree-item>Loading files...</sl-tree-item>`];

        let staged_file_relative_paths = await filesystem.list_staged_files(this._selected_repository_path);

        // Remove indexes from the list of staged files, as they are generated automatically and should not be shared
        staged_file_relative_paths = staged_file_relative_paths.filter(path => !path.includes('indexes'));

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

        // Build the tree items through Lit's reactive rendering (same pattern
        // as _list_repository_names()/_displayed_repository_names above)
        // instead of tree.innerHTML/insertAdjacentHTML. The direct-DOM version
        // got silently overwritten by the very next unrelated re-render (e.g.
        // triggered by _hasUnsharedFiles just above, itself a reactive
        // property) - the <sl-tree> element is declaratively bound to
        // ${this._displayed_staged_files} in the template, and that binding
        // always wins on the next render pass.
        this._displayed_staged_files = this._staged_files.map(staged_file => {
            let file_name = staged_file.split('/')[1];
            let staged_file_absolute_path = `${this._selected_repository_path}/${staged_file}`;

            return html`
                <sl-tree-item
                    data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}"
                    data-entry-absolute-path="${staged_file_absolute_path}"
                    data-entry-relative-path="${staged_file}"
                    data-entry-name="${file_name}">
                    ${staged_file}
                </sl-tree-item>`;
        });
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

    async _removeSelectedEntity() {
        const render_root = this.renderRoot;
        const repositories_tree = render_root.querySelector("sl-tree#repositories-tree");
        const selected_entry = repositories_tree?.querySelector("sl-tree-item[selected]");

        if (selected_entry === null || selected_entry === undefined) {
            this._showDeleteSelectionWarning();
            return;
        }

        const entry_type = selected_entry.dataset.entryType;
        if (entry_type !== CONSTANTS.FILE_SCHEME_NAME) {
            this._showDeleteSelectionWarning();
            return;
        }

        if (!(await this._confirmDelete())) {
            return;
        }

        const file_relative_path = selected_entry.dataset.entryRelativePath;

        // Generate indexes for removed file
        try {
            const generatedIndexes = await filesystem.generate_indexes_for_saved_file(
                this._selected_repository_path,
                file_relative_path, true
            );

            // Log which indexes were generated
            const successfulIndexes = Object.entries(generatedIndexes)
                .filter(([_, result]) => result.success)
                .map(([name, _]) => name);

            if (successfulIndexes.length > 0) {
                const alert = document.createElement('sl-alert');
                alert.variant = 'success';
                alert.closable = true;
                alert.duration = 6000;
                alert.innerHTML = `
                    <sl-icon slot="icon" name="check2-circle"></sl-icon>
                    Successfully generated index for: ${successfulIndexes.join(', ')}
                `;
                document.body.append(alert);
                alert.toast();
            }
        } catch (error) {
            console.error('Error generating indexes:', error);
            const alert = document.createElement('sl-alert');
            alert.variant = 'danger';
            alert.closable = true;
            alert.duration = 6000;
            alert.innerHTML = `
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                Failed to generate index for changed file. ${error.message}
            `;
            document.body.append(alert);
            alert.toast();
            // Don't fail the push if index generation fails
            // Just log the error
        }

        document.dispatchEvent(new CustomEvent("adwlm-entity-search:reload-indexes", {
            bubbles: true,
            composed: true
        }));

        // Be careful, add_file means remove_file
        await filesystem.add_file(this._selected_repository_path, file_relative_path);

        // Check if the directory is empty after removing the file and remove it if so
        const directory = file_relative_path.split('/')[0];
        const entries = await filesystem.list_entries_from_workdir(this._selected_repository_path, directory);
        if (entries.files.length === 0) {
            await filesystem.add_file(this._selected_repository_path, directory);
        }

        // Clear the entity editor
        this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:clear-entity-editor", {
            "bubbles": true,
            "composed": true,
        }));

        // Update repository tree
        if (this._selected_repository_path) {
            const repoTree = render_root.querySelector(`sl-tree-item[data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}"][data-entry-absolute-path="${this._selected_repository_path}"]`);
            if (repoTree) {
                this._generate_folder_tree(repoTree);
            }
        }

        // Update UI
        await this._list_staged_files();
        await this._updateRepositoryTreeStatus();
    }

    _showDeleteSelectionWarning() {
        const alert = document.createElement("sl-alert");
        alert.variant = "warning";
        alert.closable = true;
        alert.duration = 4000;
        alert.innerHTML = `
            <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
            Select a file to delete.
        `;
        document.body.append(alert);
        alert.toast();
    }

    async _confirmDelete(message = "Do you really want to delete this entity?") {
        return new Promise((resolve) => {
            const dialog = document.createElement("sl-dialog");
            dialog.label = "Confirm deletion";
            dialog.innerHTML = `
            <p>${message}</p>
            <sl-button slot="footer" variant="default" data-act="cancel">Cancel</sl-button>
            <sl-button slot="footer" variant="danger" data-act="confirm">Delete</sl-button>
            `;

            let settled = false;
            const finish = (confirmed) => {
                if (settled) return;
                settled = true;
                resolve(confirmed);
            };
            const cleanup = () => dialog.remove();

            dialog.addEventListener("sl-after-hide", cleanup, { once: true });
            dialog.addEventListener("sl-hide", () => finish(false), { once: true });

            dialog.querySelector('[data-act="cancel"]').addEventListener("click", () => {
                finish(false);
                dialog.hide();
            });

            dialog.querySelector('[data-act="confirm"]').addEventListener("click", () => {
                finish(true);
                dialog.hide();
            });

            document.body.appendChild(dialog);
            dialog.show();
        });
    }

}

window.customElements.define("adwlm-filesystem-manager", ADWLMFilesystemManager);
