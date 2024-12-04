import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import "https://cdn.jsdelivr.net/npm/@lion/pagination@0.9.1/lion-pagination.js/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import "./add-repository-dialog/index.js";
import "./rename-repository-dialog/index.js";

// conditionally import of the datatype for the repository data
import LocalGitLabRepo from "../virtual-filesystem/index.js";
let filesystem = new LocalGitLabRepo();

const styles =
    css`
        :host {
            width: 14vw;
            display: inline-block;
        }
        div#container {
            display: flex;
            flex-direction: column;
        }
        lion-pagination {
            margin-bottom: 0px;
        }
        sl-card#repositories-card::part(base) {
            height: 30vh;
        }
        sl-card#files-card::part(base) {
            height: 50vh;
        }
        sl-card.filesystem {
            margin-bottom: 5px;
            font-size: var(--sl-font-size-small);
        }
        sl-card.filesystem::part(base) {
            border-color: var(--sl-color-primary-600);
        }
        sl-card.filesystem div[slot = "header"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
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
            height: 22vh;
        }
        div#files-card-content {
            height: 42vh;
        }
    `;

export default class CDMDFilesystemManager extends LitElement {

    static properties = {
        entries: {
            type: Array,
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
        _repo_folder_scheme_name: {
            type: String,
        },
        _repo_folder_scheme_part: {
            type: String,
        },
        _repo_folder_scheme_length: {
            type: Number,
        },
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
    }

    static styles = styles;

    constructor() {
        super();

        this._init();
    }

    render() {
        return html`
            <div id="container">
                <sl-card id="repositories-card" class="filesystem">
                    <div slot="header">
                        Repositories
                        <sl-button-group>
                            <sl-button id="add-repository" size="small" title="Add repository">
                                <sl-icon name="shield-plus"></sl-icon>
                            </sl-button>
                            <sl-button id="remove-repository" size="small" title="Remove repository">
                                <sl-icon name="shield-minus"></sl-icon>
                            </sl-button>
                            <sl-button id="rename-repository" size="small" title="Rename repository">
                                <sl-icon name="shield"></sl-icon>
                            </sl-button>
                            <sl-button id="synchronize-repository" size="small" title="Synchronize repository">
                                <sl-icon name="arrow-counterclockwise"></sl-icon>
                            </sl-button>
                        </sl-button-group>
                    </div>
                    <div id="repositories-card-content" class="filesystem-card-content">
                        ${this._initialize_filesystem.render({
            pending: () => html`Loading repository names...`,
            complete: () => html`<sl-tree>${this._visible_entries}</sl-tree>`,
        })}
                    </div>
                </sl-card>
                <sl-card id="files-card" class="filesystem">
                    <div slot="header">
                        Files
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
                    <div id="files-card-content" class="filesystem-card-content">
                        <!--<lion-pagination count="${this._page_count}" current="${this.current_page}"></lion-pagination>-->
                        ${this._initialize_filesystem.render({
            pending: () => html`Loading repository names...`,
            complete: () => html`<sl-tree>${this._visible_entries}</sl-tree>`,
        })}
                    </div>
                </sl-card>
            </div>
            <cdmd-add-repository-dialog></cdmd-add-repository-dialog>
            <cdmd-rename-filesystem-entry-dialog></cdmd-rename-filesystem-entry-dialog>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;
        let add_repository_dialog = render_root.querySelector("cdmd-add-repository-dialog");
        let rename_filesystem_entry_dialog = render_root.querySelector("cdmd-rename-filesystem-entry-dialog");

        /*render_root.querySelector("lion-pagination").addEventListener("current-changed", event => {
            this.current_page = event.target.current;
            this._display_page();
        });*/

        render_root.addEventListener("sl-selection-change", async (event) => {
            let target = event.target;

            if (target.matches("div#repositories-card-content sl-tree")) {
                let selected_tree_item = event.detail.selection[0];
                this._selected_repository_path = selected_tree_item.dataset.entryPath;
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

                await filesystem.remove_repository(this._selected_repository_path);
                await this._list_repository_names();

                target.loading = false;
            }

            if (target.matches("sl-button#rename-repository")) {
                rename_filesystem_entry_dialog.entry_type = this._repo_folder_scheme_name;
                rename_filesystem_entry_dialog.label_1 = "Rename repository";
                rename_filesystem_entry_dialog.label_2 = "New repository name";
                rename_filesystem_entry_dialog.show();
            }
        });

        render_root.addEventListener("cdmd-git-client:repository-branches", async (event) => {
            let repository_metadata = event.detail;

            let branches = await filesystem.list_branches(repository_metadata);

            add_repository_dialog.repository_branches = branches;
        });

        render_root.addEventListener("cdmd-git-client:repository-to-add", async (event) => {
            let repository_metadata = event.detail;

            // add the repository
            await filesystem.add_repository(repository_metadata);

            await this._list_repository_names();

            add_repository_dialog.hide();
            add_repository_dialog.reset();
        });

        render_root.addEventListener("cdmd-rename-filesystem-entry-dialog:new-entry-name", async (event) => {
            let new_entry_metadata = event.detail;
            let processed_name = new_entry_metadata.name;
            switch (new_entry_metadata.type) {
                case this._repo_folder_scheme_name:
                    processed_name = `/${processed_name}`;
                break;
            }

            await filesystem.rename_entry(this._selected_repository_path, processed_name);

            await this._list_repository_names();

            rename_filesystem_entry_dialog.hide();
        });
    }

    _init() {
        this.entries = [];
        this._visible_entries = [];
        this._page_count = 1;
        this.current_page = 1;
        this._items_per_page = 10;
        this._repo_folder_scheme_name = "repofolder";
        this._repo_folder_scheme_part = `${this._repo_folder_scheme_name}:/`;
        this._repo_folder_scheme_length = this._repo_folder_scheme_part.length;
    }

    _process_entry(entry_path, entry_name, entry_type) {
        let processed_entry = {};

        switch (entry_type) {
            case this._repo_folder_scheme_name:
                processed_entry = html`<sl-tree-item data-entry-type="${entry_type}" data-entry-path="${entry_path}">${entry_name}</sl-tree-item>`;
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
                case visible_entry.startsWith(this._repo_folder_scheme_part):
                    let repo_folder_path = visible_entry.substring(this._repo_folder_scheme_length - 1);
                    let repo_folder_name = visible_entry.substring(this._repo_folder_scheme_length);
                    let processed_entry = this._process_entry(repo_folder_path, repo_folder_name, this._repo_folder_scheme_name);

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
        let processed_repository_names = repository_names.map(name => `${this._repo_folder_scheme_part}${name}`);

        this.entries = processed_repository_names;
    }

}

window.customElements.define("cdmd-filesystem-manager", CDMDFilesystemManager);
