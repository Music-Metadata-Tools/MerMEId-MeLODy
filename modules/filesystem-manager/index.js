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
        sl-card#repositories-card::part(base) {
            height: 30vh;
        }
        sl-card#files-card::part(base) {
            height: 50vh;
        }
        sl-card.filesystem {
            margin-bottom: 5px;
        }
        sl-card.filesystem::part(base) {
            border-color: var(--sl-color-primary-600);
        }
        sl-card.filesystem div[slot = "header"] {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        sl-card.filesystem::part(body) {
            padding-top: 0;
        }
        sl-tree-item::part(label) {
            font-size: var(--sl-font-size-small);
        }
        div.filesystem-card-content {
            overflow: scroll;
        }
        div#repositories-card-content {
            height: 70vh;
        }
    `;

export default class ADWLMFilesystemManager extends LitElement {

    static properties = {
        entries: {
            type: Array,
        },
        file_to_save_metadata: {
            type: Object,
        },
        _visible_entries: {
            type: Array,
        },
        _selected_repository_path: {
            type: String,
        },
        _page_count: {
            type: Number,
        },
        current_page: {
            type: Number,
        },
        _items_per_page: {
            type: Number,
        },
        _repository_buttons_disabled: {
            type: Boolean,
        }
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("entries")) {
            let entries = this.entries;

            // set the number of pages
            this._page_count = Math.ceil(entries.length / this._items_per_page);

            // display the processed entries, according to the current page number
            this._display_page();
        }

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
                <div class="details-group-example">
                    <sl-details summary="Repositories" open>
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
                        <div id="repositories-card-content" class="filesystem-card-content">
                            ${this._initialize_filesystem.render({
                pending: () => html`Loading repository names...`,
                complete: () => html`<sl-tree id="repositories-tree">${this._visible_entries}</sl-tree>`,
            })}
                        </div>
                    </sl-details>

                    <sl-details summary="Second">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna
                        aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                    </sl-details>
                </div>
            </div>
            <adwlm-add-repository-dialog></adwlm-add-repository-dialog>
            <adwlm-rename-filesystem-entry-dialog></adwlm-rename-filesystem-entry-dialog>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;

        let add_repository_dialog = render_root.querySelector("adwlm-add-repository-dialog");
        let rename_filesystem_entry_dialog = render_root.querySelector("adwlm-rename-filesystem-entry-dialog");

        render_root.addEventListener("sl-lazy-load", async (event) => {
            let target = event.target;

            if (target.matches("sl-tree-item[lazy]")) {
                let entry_type = target.dataset.entryType;
                let entry_path = target.dataset.entryPath;

                switch (entry_type) {
                    case CONSTANTS.REPO_FOLDER_SCHEME_NAME:
                        this._selected_repository_path = entry_path;
                        break;
                }

                let entries = await filesystem.list_entries_from_workdir(this._selected_repository_path, entry_path);

                let fragment = new DocumentFragment();

                // process the folders
                for (const folder of entries.folders) {
                    const tree_item = document.createElement("sl-tree-item");

                    tree_item.dataset.entryType = CONSTANTS.FOLDER_SCHEME_NAME;
                    let folder_entry_path = folder.substring(CONSTANTS.FOLDER_SCHEME_LENGTH);
                    let folder_entry_name = folder_entry_path.includes("/") ? folder_entry_path.substring(folder_entry_path.lastIndexOf("/") + 1) : folder_entry_path;
                    tree_item.dataset.entryPath = folder_entry_path;
                    tree_item.dataset.entryName = folder_entry_name;
                    tree_item.innerText = folder_entry_name;
                    tree_item.lazy = true;

                    fragment.append(tree_item);
                }

                // process the files
                for (const file of entries.files) {
                    const tree_item = document.createElement("sl-tree-item");

                    tree_item.dataset.entryType = CONSTANTS.FILE_SCHEME_NAME;
                    let file_entry_path = file.substring(CONSTANTS.FILE_SCHEME_LENGTH);
                    let file_entry_name = file_entry_path.includes("/") ? file_entry_path.substring(file_entry_path.lastIndexOf("/") + 1) : file_entry_path;
                    tree_item.dataset.entryPath = file_entry_path;
                    tree_item.dataset.entryName = file_entry_name;
                    tree_item.innerText = file_entry_name;

                    fragment.append(tree_item);
                }

                target.append(fragment);
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
                }
            }

            if (selection.matches(`sl-tree-item[data-entry-type = '${CONSTANTS.FILE_SCHEME_NAME}']`)) {
                console.log(selection);
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

            if (target.matches("sl-button#add-repository")) {
                add_repository_dialog.repository_names = await filesystem.list_repository_names();
                add_repository_dialog.show();
            }

            if (target.matches("sl-button#remove-repository")) {
                target.loading = true;

                let repositories_tree = render_root.querySelector("sl-tree#repositories-tree");
                console.log(repositories_tree.querySelectorAll("sl-tree-item").length);

                await filesystem.remove_repository(this._selected_repository_path);
                await this._list_repository_names();

                // disable the repositories-tree
                // let repositories_tree = render_root.querySelector("sl-tree#repositories-tree");

                console.log(repositories_tree.querySelectorAll("sl-tree-item").length);

                this._repository_buttons_disabled = true;

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

        // TODO: delete this, as the button for commit and push has to be inside the filesystem-manager
        document.addEventListener("adwlm-filesystem-manager:commit-and-push", async (event) => {
            await filesystem.commit_and_push_file(this._selected_repository_path);
        });
        // END TODO
    }

    _init() {
        this.entries = [];
        this._visible_entries = [];
        this._page_count = 1;
        this.current_page = 1;
        this._items_per_page = 10;
        this._repository_buttons_disabled = true;
    }

    _process_entry(entry_path, entry_name, entry_type) {
        let processed_entry = {};

        switch (entry_type) {
            case CONSTANTS.REPO_FOLDER_SCHEME_NAME:
                processed_entry = html`<sl-tree-item lazy data-entry-type="${entry_type}" data-entry-path="${entry_path}" data-entry-name="${entry_name}">${entry_name}</sl-tree-item>`;
                break;
        }

        return processed_entry;
    }

    _display_page() {
        let processed_entries = [];
        let entries = this.entries;
        let current_page = this.current_page;
        let items_per_page = this._items_per_page;

        let start_index = (current_page - 1) * items_per_page;
        let end_index = current_page * items_per_page;
        let visible_entries = entries;//.slice(start_index, end_index);

        for (let visible_entry of visible_entries) {
            switch (true) {
                case visible_entry.startsWith(CONSTANTS.REPO_FOLDER_SCHEME_PART):
                    let repo_folder_path = visible_entry.substring(CONSTANTS.REPO_FOLDER_SCHEME_LENGTH - 1);
                    let repo_folder_name = visible_entry.substring(CONSTANTS.REPO_FOLDER_SCHEME_LENGTH);
                    let processed_entry = this._process_entry(repo_folder_path, repo_folder_name, CONSTANTS.REPO_FOLDER_SCHEME_NAME);

                    processed_entries.push(processed_entry);
                    break;
            };
        }
        this._visible_entries = processed_entries;
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
        let processed_repository_names = repository_names.map(name => `${CONSTANTS.REPO_FOLDER_SCHEME_PART}${name}`);

        this.entries = processed_repository_names;
    }

}

window.customElements.define("adwlm-filesystem-manager", ADWLMFilesystemManager);
