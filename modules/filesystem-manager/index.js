import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import "https://cdn.jsdelivr.net/npm/@lion/pagination@0.9.1/lion-pagination.js/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import "./add-repository-dialog/index.js";

// conditionally import of the datatype for the repository data
import LocalGitLabRepo from "../virtual-filesystem/index.js";
let filesystem = new LocalGitLabRepo();

const styles =
    css`
        :host {
            width: 13vw;
            display: inline-block;
        }
        div#container {
            display: flex;
            flex-direction: column;
        }
        sl-tab-group.filesystem sl-tab {
            width: 50%;
        }
        lion-pagination {
            margin-bottom: 0px;
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
                ${this._initialize_filesystem.render({
                    pending: () => html`Loading repository names...`,
                    complete: () => html`<sl-select label="Repositories">${this._visible_entries}</sl-select>`,
                })}
                <sl-button-group>
                    <sl-button id="add-repository-toolbar-button" size="small">
                        <sl-icon name="shield-plus" label="Add repository"></sl-icon>
                    </sl-button>
                    <sl-button id="delete-repository" size="small" title="Delete repository" disabled>
                        <sl-icon name="shield-minus" label="Delete repository"></sl-icon>
                    </sl-button>
                    <sl-button id="rename-repository" size="small" title="Rename repository">
                        <sl-icon name="shield-shaded" label="Rename repository"></sl-icon>
                    </sl-button>
                </sl-button-group>
                <sl-tab-group class="filesystem">
                    <sl-tab slot="nav" panel="repositories">Repositories</sl-tab>
                    <sl-tab slot="nav" panel="files">Files</sl-tab>
                    <sl-tab-panel name="repositories">

                    </sl-tab-panel>
                    <sl-tab-panel name="files">
                        <sl-button-group>
                            <sl-button size="small" title="Add folder">
                                <sl-icon name="folder-plus"></sl-icon>
                            </sl-button>
                            <sl-button size="small" title="Delete folder">
                                <sl-icon name="folder-minus"></sl-icon>
                            </sl-button>
                            <sl-button size="small" title="Add file">
                                <sl-icon name="file-earmark-plus"></sl-icon>
                            </sl-button>
                            <sl-button size="small" title="Delete file">
                                <sl-icon name="file-earmark-minus"></sl-icon>
                            </sl-button>
                        </sl-button-group>
                    </sl-tab-panel>
                </sl-tab-group>
                <lion-pagination count="${this._page_count}" current="${this.current_page}"></lion-pagination>
                ${this._initialize_filesystem.render({
            pending: () => html`Loading repository names...`,
            complete: () => html`<sl-tree><sl-tree-item open>Repositories${this._visible_entries}</sl-tree-item><sl-divider></sl-divider>${this._visible_entries}</sl-tree>`,
        })}
            </div>
            <cdmd-add-repository-dialog></cdmd-add-repository-dialog>
        `;
    }

    firstUpdated() {
        let render_root = this.renderRoot;

        render_root.querySelector("lion-pagination").addEventListener("current-changed", event => {
            this.current_page = event.target.current;
            this._display_page();
        });

        this.addEventListener("click", async (event) => {
            let target = event.composedPath()[0];
            //let shadow_root = 
            if (target.matches("sl-button#add-repository-toolbar-button, sl-button#add-repository-toolbar-button *")) {
                let add_repository_dialog = this.querySelector("cdmd-add-repository-dialog");
                add_repository_dialog.repository_names = await this._get_repository_names();
                add_repository_dialog.show();
            }
        });

        render_root.querySelector("div#container").addEventListener("sl-show", event => {
            let target = event.target;

            if (target.matches("sl-details, sl-details > *")) {
                let container = target.closest("div#container");
                console.log(container);

                [...container.querySelectorAll("sl-details")].map(details => (details.open = event.target === details));
            }
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
                processed_entry = html`<sl-option value="${entry_path}">${entry_name}</sl-option>`;
                //<sl-tree-item lazy data-entry-type="${entry_type}" data-entry-path="${entry_path}">${entry_name}</sl-tree-item>`;
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
        let visible_entries = entries.slice(start_index, end_index);

        for (let visible_entry of visible_entries) {
            switch (true) {
                case visible_entry.startsWith(this._repo_folder_scheme_part):
                    console.log(visible_entry);
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
            let repository_names = await filesystem.list_repository_names();
            let processed_repository_names = repository_names.map(name => `repofolder:/${name}`);

            this.entries = processed_repository_names;
        },
        () => []
    );

}

window.customElements.define("cdmd-filesystem-manager", CDMDFilesystemManager);