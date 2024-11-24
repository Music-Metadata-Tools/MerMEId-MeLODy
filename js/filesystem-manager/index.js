import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import "https://cdn.jsdelivr.net/npm/@lion/pagination@0.9.1/lion-pagination.js/+esm";

const styles =
    css``;

export default class CDMDFileManager extends LitElement {

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
            <lion-pagination count="${this._page_count}" current="${this.current_page}"></lion-pagination>
            <sl-tree>${this._visible_entries}</sl-tree>
        `;
    }

    firstUpdated() {
        this.pagination = this.renderRoot.querySelector("lion-pagination");

        this.pagination.addEventListener("current-changed", event => {
            this.current_page = event.target.current;
            this._display_page();
        });
    }

    _init() {
        this.entries = [];
        this._visible_entries = [];
        this._page_count = 1;
        this.current_page = 1;
        this._items_per_page = 10;
        this._repo_folder_scheme_name = "repofolder:/";
        this._repo_folder_scheme_length = this._repo_folder_scheme_name.length;
    }

    _generate_entry(entry_path, entry_name, entry_type) {
        let processed_entry = {};

        switch (entry_type) {
            case this._repo_folder_scheme_name:
                processed_entry = html`<sl-tree-item lazy data-repository-folder-name="${entry_path}">${entry_name}</sl-tree-item>`;
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
                case visible_entry.startsWith(this._repo_folder_scheme_name):
                    let repo_folder_path = visible_entry.substring(this._repo_folder_scheme_length - 1);
                    let repo_folder_name = visible_entry.substring(this._repo_folder_scheme_length);
                    let processed_entry = this._generate_entry(repo_folder_path, repo_folder_name, this._repo_folder_scheme_name);

                    processed_entries.push(processed_entry);
                    break;
            };
        }
        this._visible_entries = processed_entries;
    }

}

window.customElements.define("cdmd-filesystem-manager", CDMDFileManager);