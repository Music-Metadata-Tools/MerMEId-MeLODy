import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";
//import "https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.17.1/cdn/components/tree/tree.js";

const styles =
    css`

`;

export default class CDMDGitClient extends LitElement {
    static properties = {
        datalist: {
            type: Array
        },
        file_system_name: {
            type: String
        },
        repository_folder_name: {
            type: String
        },
    };

    static styles = styles;

    constructor() {
        super();

        this.file_system_name = "mermeid";
    }

    render() {
        return html`
            <div id="container">
                ${this._get_repository_folder_names.render({
            pending: () => html`Loading repositories...`,
            complete: (data) => html`<sl-tree>${data}</sl-tree>`,
        })}
            </div>
        `;
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        render_root.addEventListener("sl-lazy-load", async (event) => {
            const target = event.target;

            if (target.matches("sl-tree-item[lazy]")) {
                this.repository_folder_name = `/${target.dataset.repositoryFolderName}`;

                // get remote.origin.url
                let remote_origin_url = await git.getConfig({
                    fs: this.fs,
                    dir: this.repository_folder_name,
                    path: 'remote.origin.url'
                });

                // get refs/HEAD
                let refs = await git.listServerRefs({
                    http,
                    corsProxy: "https://cors.isomorphic-git.org",
                    url: remote_origin_url,
                    prefix: "HEAD",
                });
                console.log(refs);

                // 

                //await this._git_pull(this.repository_folder_name);

                //let file_relative_paths = await git.walk({ fs: this.fs, gitdir: this.repository_folder_name, trees: '/' });

                let file_relative_paths = await git.listFiles({ fs: this.fs, dir: this.repository_folder_name, ref: 'HEAD' });

                for (const file_relative_path of file_relative_paths) {
                    if (!file_relative_path.startsWith("data/")) {
                        const tree_item = document.createElement("sl-tree-item");
                        tree_item.dataset.relativePath = file_relative_path;
                        tree_item.innerText = file_relative_path;
                        target.append(tree_item);
                    }
                }

                target.lazy = false;
            }
        });

        render_root.addEventListener("click", async (event) => {
            const target = event.target;

            // open the file in editor
            if (target.matches("sl-tree-item:not([lazy])")) {
                let file_relative_path = target.dataset.relativePath;

                // get the file contents
                console.log(this.repository_folder_name);
                let commitOid = await git.resolveRef({ fs: this.fs, dir: this.repository_folder_name, ref: "HEAD" });

                let { blob } = await git.readBlob({
                    fs: this.fs,
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
        });

        return render_root;
    }

    async _set_username() {
        await git.setConfig({
            fs: this.fs,
            dir: this.repository_folder_name,
            path: "user.name",
            value: "Claudius Teodorescu"
        }); s
    }

    _list_files() {
        //let file_relative_paths = await git.listFiles({ fs: this.fs, dir: this.repository_folder_name, ref: 'HEAD' });

        //this._process_file_relative_paths(file_relative_paths);
    }

    async _git_pull() {
        let start = performance.now();
        try {
            await git.pull({
                fs: this.fs,
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

    // list repositories
    _get_repository_folder_names = new Task(
        this,
        async ([]) => {
            this.fs = new LightningFS(this.file_system_name);
            this.pfs = this.fs.promises;

            let repository_folder_names = await this.pfs.readdir("/");
            repository_folder_names.sort();
            // let tree_form_control = this.renderRoot.querySelector("input#search-input");
            // the tree item for the last use repo has to have @expanded
            let repository_tree_items = repository_folder_names.map(repository_folder_name => html`<sl-tree-item lazy data-repository-folder-name="${repository_folder_name}">${repository_folder_name}</sl-tree-item>`);

            return repository_tree_items;
        },
        () => []
    );

    /*_load_repository = new Task(
        this,
        async ([]) => {
            window.fs = new LightningFS("mermeid");

            window.pfs = window.fs.promises;
            window.dir = "/";
            let repositories = await pfs.readdir(window.dir);
            //console.log(repositories);

            let dirs = "/gretil_text_corpus";
            let start = performance.now();
            let files = await git.listFiles({ fs: window.fs, dir: "/gretil_text_corpus", ref: 'HEAD' })
            let end = performance.now();
            let elapsed_time = end - start;
            console.log("elapsed_time for listFiles() = " + elapsed_time + "ms");

            console.log(await pfs.readdir("/"));
            try {
                await pfs.stat(dirs);
            } catch (error) {
                console.log("clone the repo");
                await pfs.mkdir(dirs);
                let start = performance.now();
                try {
                    await git.clone({
                        fs,
                        http,
                        dir: dirs,
                        corsProxy: 'https://cors.isomorphic-git.org',
                        url: 'https://github.com/sanskrit-texts/gretil-corpus.git',
                        ref: 'main',
                        singleBranch: true,
                        depth: 1
                    });
                } catch (error) {
                    console.error(error);
                    // Expected output: ReferenceError: nonExistentFunction is not defined
                    // (Note: the exact output may be browser-dependent)
                }
                let end = performance.now();
                let elapsed_time = end - start;
                console.log("elapsed_time = " + elapsed_time + "ms");
                // elapsed_time = 115799ms
            }

            return repositories;
        },
        () => []
    );*/


}

window.customElements.define("cdmd-git-client", CDMDGitClient);
