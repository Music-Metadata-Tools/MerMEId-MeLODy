import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import "https://cdn.jsdelivr.net/npm/@lion/pagination@0.9.1/lion-pagination.js/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import "./add-repository-dialog/index.js";
import "./rename-repository-dialog/index.js";
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
        }
        sl-tree-item::part(label) {
            font-size: var(--sl-font-size-small);
        }
        div#repositories-tree-container {
            height: 60vh;
            overflow: scroll;
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
        file_to_save_metadata: {
            type: Object,
        },
        _repository_buttons_disabled: {
            type: Boolean,
        }
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("file_to_save_metadata")) {
            let file_to_save_metadata = this.file_to_save_metadata;

            this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:save-file", {
                "detail": file_to_save_metadata,
            }));
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
                <sl-details id="repositories-details" summary="Repositories" open>
                    <div>
                        <sl-button-group>
                            <sl-button id="add-repository" size="small" title="Add repository">
                                <sl-icon name="folder-plus"></sl-icon>
                            </sl-button>
                            <sl-button id="remove-repository" size="small" title="Remove repository" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="folder-minus"></sl-icon>
                            </sl-button>
                            <sl-button id="rename-repository" size="small" title="Rename repository" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="folder"></sl-icon>
                            </sl-button>
                            <sl-button id="synchronize-repository" size="small" title="Synchronize repository" ?disabled="${this._repository_buttons_disabled}">
                                <sl-icon name="arrow-counterclockwise"></sl-icon>
                            </sl-button>
                        </sl-button-group>
                        <sl-button-group>
                            <sl-button size="small" title="Add file">
                                <sl-icon name="file-earmark-plus"></sl-icon>
                            </sl-button>
                            <sl-button size="small" title="Remove file">
                                <sl-icon name="file-earmark-minus"></sl-icon>
                            </sl-button>
                            <sl-button size="small" title="Rename file">
                                <sl-icon name="file-earmark"></sl-icon>
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
                <sl-details id="staged-files-details" summary="Commit and push files" disabled>
                <div>
                    <sl-button id="commit-and-push-staged-files" size="small" title="Commit and push files">
                        <sl-icon name="cloud-upload"></sl-icon>
                    </sl-button>
                </div>
                    <sl-tree id="staged-files-tree" selection="multiple">${this._displayed_staged_files}</sl-tree>
                </sl-details>
            </div>
            <adwlm-add-repository-dialog></adwlm-add-repository-dialog>
            <adwlm-rename-filesystem-entry-dialog></adwlm-rename-filesystem-entry-dialog>
            <sl-alert id="commit-and-push-done" variant="primary" duration="3000" closable>
                <sl-icon slot="icon" name="info-circle"></sl-icon>
                The files were committed and pushed to the remote repository.
            </sl-alert>
            <sl-alert id="commit-and-push-error" variant="warning" duration="3000" closable>
                <sl-icon slot="icon" name="exclamation-triangle"></sl-icon>
                An error occured while committing and pushing the files to the remote repository.
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
                let entry_path = target.dataset.entryPath;

                if (entry_type === CONSTANTS.REPO_FOLDER_SCHEME_NAME) {
                    this._selected_repository_path = entry_path;
                    staged_files_details.disabled = false;
                }

                let entries = await filesystem.list_entries_from_workdir(this._selected_repository_path, entry_path);

                let tree_items = "";

                // process the folders
                for (const folder_entry_path of entries.folders) {
                    let folder_entry_name = folder_entry_path.includes("/") ? folder_entry_path.substring(folder_entry_path.lastIndexOf("/") + 1) : folder_entry_path;

                    tree_items += `<sl-tree-item lazy data-entry-type="${CONSTANTS.FOLDER_SCHEME_NAME}" data-entry-path="${folder_entry_path}" data-entry-name="${folder_entry_name}">${folder_entry_name}</sl-tree-item>`;
                }

                // process the files
                for (const file_entry_path of entries.files) {
                    let file_entry_name = file_entry_path.includes("/") ? file_entry_path.substring(file_entry_path.lastIndexOf("/") + 1) : file_entry_path;

                    tree_items += `<sl-tree-item data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" data-entry-path="${file_entry_path}" data-entry-name="${file_entry_name}">${file_entry_name}</sl-tree-item>`;
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
                    this._selected_repository_path = selected_tree_item.dataset.entryPath;
                    staged_files_details.disabled = false;
                }
            }

            if (selection && selection.matches(`sl-tree#repositories-tree sl-tree-item[data-entry-type = '${CONSTANTS.FILE_SCHEME_NAME}']`)) {
                let file_path = selection.dataset.entryPath;

                // get the file contents
                let file_contents = await filesystem.read_file(this._selected_repository_path, file_path);

                let file_to_edit_metadata = {
                    "contents": file_contents,
                    "relative_path": file_path,
                };
                this.dispatchEvent(new CustomEvent("adwlm-filesystem-manager:file-to-edit-metadata", {
                    "detail": file_to_edit_metadata,
                    "bubbles": true,
                    "composed": true,
                }));
            }
        });

        render_root.addEventListener("sl-focus", async (event) => {
            let target = event.target;
            // the blur is needed, as the action is repeated every time the browser tab regains focus
            target.blur();

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

            if (target.matches("sl-button#rename-repository")) {
                rename_filesystem_entry_dialog.entry_type = CONSTANTS.REPO_FOLDER_SCHEME_NAME;
                rename_filesystem_entry_dialog.label_1 = "Rename repository";
                rename_filesystem_entry_dialog.label_2 = "New repository name";
                rename_filesystem_entry_dialog.show();
            }

            if (target.matches("sl-button#synchronize-repository")) {
                await filesystem.pull(this._selected_repository_path);
            }

            if (target.matches("sl-button#commit-and-push-staged-files")) {
                target.loading = true;

                let staged_file_nodes = [...staged_files_tree.querySelectorAll("sl-tree-item")];
                let staged_file_paths = staged_file_nodes
                    .map(item => item.dataset.entryPath);
                let selected_staged_file_paths = staged_file_nodes
                    .filter(item => item.selected)
                    .map(item => item.dataset.entryPath);
                let push_result = await filesystem.commit_and_push_file(this._selected_repository_path, staged_file_paths, selected_staged_file_paths);
                if (push_result) {
                    await this._list_staged_files();
                    commit_and_push_done_toast.toast();
                } else {
                    commit_and_push_error_toast.toast();
                }

                target.loading = false;
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
            let processed_name = new_entry_metadata.name;
            switch (new_entry_metadata.type) {
                case CONSTANTS.REPO_FOLDER_SCHEME_NAME:
                    processed_name = `/${processed_name}`;
                    break;
            }

            await filesystem.rename_entry(this._selected_repository_path, processed_name);

            await this._list_repository_names();

            rename_filesystem_entry_dialog.hide();
        });

        this.addEventListener("adwlm-filesystem-manager:save-file", async (event) => {
            let file_to_save_metadata = event.detail;

            await filesystem.save_and_stage_file(this._selected_repository_path, file_to_save_metadata.contents, file_to_save_metadata.relative_path);
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

            return html`<sl-tree-item lazy data-entry-type="${CONSTANTS.REPO_FOLDER_SCHEME_NAME}" data-entry-path="${entry_path}" data-entry-name="${entry_name}">${entry_name}</sl-tree-item>`;
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

        let staged_files = await filesystem.list_staged_files(this._selected_repository_path);

        tree.innerHTML = "";

        let tree_items = "";
        // process the files
        for (const staged_file of staged_files) {
            let file_name = staged_file.includes("/") ? staged_file.substring(staged_file.lastIndexOf("/") + 1) : staged_file;

            tree_items += `<sl-tree-item data-entry-type="${CONSTANTS.FILE_SCHEME_NAME}" data-entry-path="${staged_file}" data-entry-name="${file_name}">${file_name}</sl-tree-item>`;
        }

        tree.insertAdjacentHTML("beforeend", tree_items);
    }

}

window.customElements.define("adwlm-filesystem-manager", ADWLMFilesystemManager);
