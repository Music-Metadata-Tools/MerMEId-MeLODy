import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
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
    };

    static styles = styles;

    constructor() {
        super();
    }

    render() {
        return html`
            <div id="container">
                ${this._load_repository_names.render({
            pending: () => html`Loading repositories...`,
            complete: (data) => html`<sl-tree>${data}</sl-tree>`,
        })}
            </div>
        `;
    }

    // list repositories
    _load_repository_names = new Task(
        this,
        async ([]) => {
            window.fs = new LightningFS("mermeid");
            window.pfs = window.fs.promises;

            let repository_names = await pfs.readdir("/");
            repository_names.sort();
            // let tree_form_control = this.renderRoot.querySelector("input#search-input");
            // the tree item for the last use repo has to have @expanded
            let repository_tree_items = repository_names.map(repository_name => html`<sl-tree-item lazy>${repository_name}</sl-tree-item>`);

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
