import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";

// conditionally import of the datatype for the repository data
import LocalGitLabRepo from "./LocalGitLabRepo.js";
let gitlab_client = new LocalGitLabRepo();

// RDF repository
// https://github.com/rdfjs/N3.js

const styles =
    css``;

export default class CDMDGitClient extends LitElement {
    static properties = {
        datalist: {
            type: Array,
        },
        filesystem_name: {
            type: String,
        },
        repository_folder_name: {
            type: String,
        },
        _repository_names: {
            state: true,
        },
        _repository_name_items: {
            type: Array,
        },
    };

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has("_repository_names")) {
            // let tree_form_control = this.renderRoot.querySelector("input#search-input");
            this._repository_name_items = this._repository_names.map(repository_folder_name => html`<sl-tree-item lazy data-repository-folder-name="${repository_folder_name}">${repository_folder_name}</sl-tree-item>`);
        }
    }

    static styles = styles;

    constructor() {
        super();

        this.filesystem_name = "mermeid";
        this._repository_names = [];
    }

    render() {
        return html`
            <div id="container">
                <div id="toolbar">
                    <sl-button id="add-repository-toolbar-button" size="small" title="Add repository">
                        <sl-icon name="shield-plus"></sl-icon>
                    </sl-button>
                    <sl-button id="remove-repository" size="small" title="Remove repository" disabled>
                        <sl-icon name="shield-minus"></sl-icon>
                    </sl-button>
                    <sl-button size="small" title="Add folder">
                        <sl-icon name="folder-plus"></sl-icon>
                    </sl-button>
                    <sl-button size="small" title="Remove folder">
                        <sl-icon name="folder-minus"></sl-icon>
                    </sl-button>
                    <sl-button size="small" title="Add file">
                        <sl-icon name="file-earmark-plus"></sl-icon>
                    </sl-button>
                    <sl-button size="small" title="Remove file">
                        <sl-icon name="file-earmark-minus"></sl-icon>
                    </sl-button>
                </div>
                ${this._initialize_filesystem.render({
            pending: () => html`Loading repository names...`,
            complete: () => html`<sl-tree>${this._repository_name_items}</sl-tree>`,
        })}
            </div>
            <cdmd-add-repository-dialog></cdmd-add-repository-dialog>
        `;
    }

    firstUpdated() {
        //console.log(this.shadowRoot.querySelector("sl-button"));
    }

    createRenderRoot() {
        let render_root = super.createRenderRoot();

        render_root.addEventListener("sl-lazy-load", async (event) => {
            let target = event.target;

            // this is for clicking the expand icon
            if (target.matches("sl-tree-item[lazy], sl-tree-item[lazy] *")) {
                this.repository_folder_name = `/${target.dataset.repositoryFolderName}`;
                /*
                                // get remote.origin.url
                                let remote_origin_url = await git.getConfig({
                                    fs: gitlab_client.fs,
                                    dir: this.repository_folder_name,
                                    path: "remote.origin.url"
                                });
                                remote_origin_url = "https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data";

                                // get refs/HEAD
                                let refs = await git.listServerRefs({
                                    http,
                                    corsProxy: "https://cors.isomorphic-git.org",
                                    url: remote_origin_url,
                                    prefix: "HEAD",
                                });
                                let head_commit = refs[0].oid;
                                console.log(head_commit);

                                let commitOid = await git.resolveRef({ fs: gitlab_client.fs, dir: this.repository_folder_name, ref: "HEAD" });
                                console.log(commitOid);

                                if (commitOid !== head_commit) {
                                    await this._git_pull();
                                }*/

                //let file_relative_paths = await git.walk({ fs: gitlab_client.fs, gitdir: this.repository_folder_name, trees: '/' });

                let file_relative_paths = await git.listFiles({ fs: gitlab_client.fs, dir: this.repository_folder_name, ref: 'HEAD' });

                for (const file_relative_path of file_relative_paths) {
                    if (!file_relative_path.startsWith("data/")) {
                        const tree_item = document.createElement("sl-tree-item");
                        tree_item.dataset.relativePath = file_relative_path;
                        tree_item.innerText = file_relative_path;
                        target.append(tree_item);
                    }
                }
            }
        });

        render_root.addEventListener("click", async (event) => {
            let target = event.target;
            let remove_repository_button = render_root.querySelector("sl-button#remove-repository");

            // this is for clicking the name of a folder for a repository
            if (target.matches("sl-tree-item[data-repository-folder-name]")) {
                this.repository_folder_name = `/${target.dataset.repositoryFolderName}`;
                remove_repository_button.disabled = false;
            }

            // open the file in editor
            if (target.matches("sl-tree-item:not([data-repository-folder-name])")) {
                remove_repository_button.disabled = true;

                let file_relative_path = target.dataset.relativePath;

                // get the file contents
                let commitOid = await git.resolveRef({ fs: gitlab_client.fs, dir: this.repository_folder_name, ref: "HEAD" });

                let { blob } = await git.readBlob({
                    fs: gitlab_client.fs,
                    dir: this.repository_folder_name,
                    oid: commitOid,
                    filepath: file_relative_path
                });
                let file_contents = new TextDecoder().decode(blob);

                this.dispatchEvent(new CustomEvent("cdmd-git-client:selected-file-contents", {
                    "detail": file_contents,
                    "bubbles": true,
                    "composed": true,
                }));
            }

            if (target.matches("sl-button#add-repository-toolbar-button, sl-button#add-repository-toolbar-button *")) {
                let add_repository_dialog = render_root.querySelector("cdmd-add-repository-dialog");
                add_repository_dialog.repository_names = await this._get_repository_names();
                add_repository_dialog.show();
            }

            if (target.matches("sl-button#remove-repository, sl-button#remove-repository *")) {
                let button = target.closest("sl-button");
                button.loading = true;

                await gitlab_client.remove_repository(this.repository_folder_name);
                let repository_names = await this._get_repository_names();
                this._repository_names = repository_names;

                button.loading = false;
                button.disabled = true;
            }
        });

        render_root.addEventListener("cdmd-git-client:repository-branches", async (event) => {
            let repository_metadata = event.detail;

            let branches = await gitlab_client.list_branches(repository_metadata);

            let dialog = render_root.querySelector("cdmd-add-repository-dialog");
            dialog.repository_branches = branches;
        });

        render_root.addEventListener("cdmd-git-client:repository-to-add", async (event) => {
            let repository_metadata = event.detail;

            // add the repository to clone data structure

            await gitlab_client.add_repository(repository_metadata);

            let repository_names = await this._get_repository_names();
            this._repository_names = repository_names;

            let dialog = render_root.querySelector("cdmd-add-repository-dialog");
            dialog.hide();
            dialog.reset();
        });

        render_root.addEventListener("sl-selection-change", (event) => {
            let target = event.target;

            // console.log(target);
        });

        return render_root;
    }

    async _set_username() {
        await git.setConfig({
            fs: gitlab_client.fs,
            dir: this.repository_folder_name,
            path: "user.name",
            value: "Claudius Teodorescu"
        });
    }

    _list_files() {
        //let file_relative_paths = await git.listFiles({ fs: gitlab_client.fs, dir: this.repository_folder_name, ref: 'HEAD' });

        //this._process_file_relative_paths(file_relative_paths);
    }

    async _git_pull() {
        this._set_username();
        let start = performance.now();
        try {
            await git.pull({
                fs: gitlab_client.fs,
                http,
                dir: this.repository_folder_name,
                ref: "main",
                singleBranch: true
            });
        } catch (error) {
            console.error(error);
        }
        let end = performance.now();
        console.log("elapsed_time for git.pull() = " + (end - start) + "ms");
    }

    _process_file_relative_paths(file_relative_paths) {
        console.log(file_relative_paths);
    }

    // initialize the filesystem
    _initialize_filesystem = new Task(
        this,
        async ([]) => {
            let repository_names = await this._get_repository_names();

            this._repository_names = repository_names;
        },
        () => []
    );

    // list repositories
    async _get_repository_names() {
        let repository_names = await gitlab_client.pfs.readdir("/");
        repository_names.sort();

        return repository_names;
    }

    /*_load_repository = new Task(
        this,
        async ([]) => {
            window.fs = new LightningFS("mermeid");

            window.pfs = window.fs.promises;
            window.dir = "/";

            let dirs = "/gretil_text_corpus";
            let start = performance.now();
            let files = await git.listFiles({ fs: window.fs, dir: "/gretil_text_corpus", ref: 'HEAD' })
            let end = performance.now();
            let elapsed_time = end - start;
            console.log("elapsed_time for listFiles() = " + elapsed_time + "ms");

            try {
                await pfs.stat(dirs);
            } catch (error) {
                console.log("clone the repo");
                await pfs.mkdir(dirs);
            }

            return repositories;
        },
        () => []
    );*/


}

window.customElements.define("cdmd-git-client", CDMDGitClient);
