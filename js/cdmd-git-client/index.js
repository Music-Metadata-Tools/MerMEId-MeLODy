import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";
//import "https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.17.1/cdn/components/tree/tree.js";

// conditionally import of the datatype for the repository data
import LocalGitLabRepo from "./LocalGitLabRepo.js";
let gitlab_client = new LocalGitLabRepo();

// RDF repository
// https://github.com/rdfjs/N3.js

const styles =
    css`
    sl-input#personal-access-token, sl-button#save-personal-access-token-button, sl-select#repository-branches {
        display: none;
    }`;

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
        fs: {
            type: Object,
            attribute: false,
        },
        pfs: {
            type: Object,
            attribute: false,
        }
    };

    updated(changedProperties) {
        if (changedProperties.has("_repository_names")) {
            // let tree_form_control = this.renderRoot.querySelector("input#search-input");
            // the tree item for the last use repo has to have @expanded
            this._repository_name_items = this._repository_names.map(repository_folder_name => html`<sl-tree-item lazy data-repository-folder-name="${repository_folder_name}">${repository_folder_name}</sl-tree-item>`);
        }
        super.updated(changedProperties);
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
                    <sl-button id="create-repository-toolbar-button" size="small" title="Add repository">
                        <sl-icon name="shield-plus"></sl-icon>
                    </sl-button>
                    <sl-button id="delete-repository" size="small" title="Delete repository">
                        <sl-icon name="shield-minus"></sl-icon>
                    </sl-button>
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
                </div>
                <sl-dialog id="create-repository-dialog" label="Create repository">
                    <sl-input id="repository-folder-name" placeholder="Example: 'folder_name5'." label="Repository folder name" value="mermeid-sample-data" required="true"autofocus="true"></sl-input>
                    <sl-input id="repository-url" label="Repository URL" value="https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data.git" required="true"></sl-input>
                    <sl-input id="personal-access-token" label="Personal access token" value=""></sl-input>
                    <sl-select id="repository-branches" label="Repository branches" value=""></sl-select>
                    <sl-button id="save-personal-access-token-button" slot="footer" variant="primary">Save token</sl-button>
                    <sl-button id="create-repository-dialog-button" slot="footer" variant="primary">Clone</sl-button>
                </sl-dialog>
                https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/Telemann-MEI.git
                ${this._initialize_filesystem.render({
            pending: () => html`Loading repositories...`,
            complete: () => html`<sl-tree>${this._repository_name_items}<sl-tree-item data-relative-path="1008.ttl">1008.ttl</sl-tree-item></sl-tree>`,
        })}
            </div>
        `;
    }

    createRenderRoot() {
        const render_root = super.createRenderRoot();

        render_root.addEventListener("sl-lazy-load", async (event) => {
            const target = event.target;

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

                target.lazy = false;
            }
        });

        render_root.addEventListener("click", async (event) => {
            const target = event.target;

            if (target.matches("sl-tree-item[lazy], sl-tree-item[lazy] *")) {
                this.repository_folder_name = `/${target.dataset.repositoryFolderName}`;
            }

            // open the file in editor
            if (target.matches("sl-tree-item:not([lazy])")) {
                let file_relative_path = target.dataset.relativePath;

                // TODO: remove this
                if (file_relative_path === "1008.ttl") {

                    this.dispatchEvent(new CustomEvent("cdmd-git-client:selected-file-contents", {
                        "detail": file_1008_ttl,
                        "bubbles": true,
                        "composed": true,
                    }));
                    return;
                }
                // END

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

            if (target.matches("sl-button#create-repository-toolbar-button, sl-button#create-repository-toolbar-button *")) {
                let create_repository_dialog = render_root.querySelector("sl-dialog#create-repository-dialog");
                create_repository_dialog.show();
            }

            if (target.matches("sl-button#create-repository-dialog-button")) {
                let repository_folder_name_input = render_root.querySelector("sl-input#repository-folder-name");
                let personal_access_token_input = render_root.querySelector("sl-input#personal-access-token")
                let personal_access_token_button = render_root.querySelector("sl-button#save-personal-access-token-button");
                let repository_branches_select = render_root.querySelector("sl-select#repository-branches");

                let repository_folder_name = repository_folder_name_input.value;

                // check if the repository folder name is valid
                var repository_folder_name_regex = /^[a-zA-Z0-9][\w.-]*$/;
                if (!repository_folder_name_regex.test(repository_folder_name)) {
                    repository_folder_name_input.setCustomValidity("The repository folder name is not valid. It has to contains only ASCII letters or digits, and optionally, `-`, or `-`. Example: `folder_name5`.");
                    repository_folder_name_input.reportValidity();
                }

                // check if repository_folder_name already exists
                let repository_names = await this._get_repository_names();
                if (repository_names.includes(repository_folder_name)) {
                    repository_folder_name_input.setCustomValidity("The repository folder name already exists!");
                    repository_folder_name_input.reportValidity();
                }

                let repository_url_string = render_root.querySelector("sl-input#repository-url").value;

                // check if repository_url is valid
                try {
                    new URL(repository_url_string);
                } catch (err) {
                    repository_folder_name_input.setCustomValidity("The repository URL is not valid.");
                    repository_folder_name_input.reportValidity();
                }

                // check if the repository is public; if not, display the personal access token input
                let is_public_repository = await gitlab_client.is_public_repository(repository_url_string);
                if (!is_public_repository) {
                    // display the input form control for entering the personal access token
                    personal_access_token_input.style.display = "inline";
                    personal_access_token_button.style.display = "inline-block";
                    target.style.display = "none";
                    repository_branches_select.style.display = "inline-block";

                    personal_access_token_input.setCustomValidity("The repository is not public, so you need a personal access token to clone it. After entering the token, please save it by pressing the button `Save token`.");
                    personal_access_token_input.reportValidity();

                    return;
                } else {
                    // display the branches, for user to select one of them
                    repository_branches_select.style.display = "inline-block";
                    let branches = await gitlab_client.list_branches(repository_url_string);
                    console.log(branches);
                    /*for (const file of files) {
                        const treeItem = document.createElement("sl-tree-item");
                        treeItem.innerText = file;
                        lazyItem.append(treeItem);
                    }*/


                }


                // clone the repo

            }

            if (target.matches("sl-button#delete-repository, sl-button#delete-repository *")) {
                target.loading = true;
                gitlab_client.delete_repository(this.repository_folder_name);
                let repository_names = await this._get_repository_names();
                this._repository_names = repository_names;
                target.loading = false;
            }

            if (target.matches("sl-button#save-personal-access-token-button")) {

            }
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
            // TO BE REMOVED: automatic cloning, for demonstration
            if (this._repository_names.length === 0) {
                //this._load_repository();
            }
            // END

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

    async _load_repository() {
        // the repository_folder_name and url has to be set by user, through a dialog window
        this.repository_folder_name = "/mermeid_sample_data";
        let remote_origin_url = "https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data";

        try {
            await gitlab_client.pfs.mkdir(this.repository_folder_name);
        } catch (error) {
            console.error(error);
        }
        console.log(this.repository_folder_name);

        // the branch name has to be get somehow automatically
        let ref = "main";

        let start = performance.now();
        try {
            await git.clone({
                fs: gitlab_client.fs,
                http,
                dir: this.repository_folder_name,
                corsProxy: "https://cors.isomorphic-git.org",
                url: remote_origin_url,
                ref,
                singleBranch: true,
                noTags: true,
                depth: 1
            });
        } catch (error) {
            console.error(error);
        }
        let end = performance.now();
        console.log("elapsed_time = " + (end - start) + "ms");
        // elapsed_time = 115799ms
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

let file_1008_ttl =
    `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix schema: <http://schema.org/> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix geo: <http://www.opengis.net/ont/geosparql#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix prov: <http://www.w3.org/ns/prov#> .

@prefix cidoc: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix gnd: <https://d-nb.info/standards/elementset/gnd#> .
@prefix melod: <https://mei-metadata.org/> .
@prefix owl: <https://www.w3.org/TR/owl-ref/> .
@prefix schema: <http://schema.org/> .

<https://liszt-portal.de/places/1008>
  a melod:Place, cidoc:E53_Place, schema:Place, gnd:TerritorialCorporateBodyOrAdministrativeUnit ;
  owl:sameAs <https://d-nb.info/gnd/4044660-8>, <http://www.wikidata.org/entity/Q90>, <http://viaf.org/viaf/240792131>, <https://sws.geonames.org/2988507> ;
  schema:name "Paris" ;
  schema:alternateName "Lutetia", "Lutecia", "Lutetia Parisiorum",
      "Parisia", "Pa-li", "Ville de Paris", "P'ariz", "Paryžius", "Paříž", "Bārīs",
      "Bali (Paris)", "Pariž", "Parigi", "Parijs", "Lutitia", "Parisius", "Lutèce", "Commune de Paris",
      "Parisii", "Parrhisius", "Loticia Parisiorum", "Ville de Paris", "Lutetia";
      cidoc:P89_falls_within <https://liszt-portal.de/places/17> ;
      gnd:dateOfEstablishment "486" ;
      gnd:biographicalOrHistoricalInformation "Hauptstadt von Frankreich, seit Neolithikum besiedelt, von Kelten gegründet, seit 486 Hauptstadt des Fränk. Reiches"@de;
      schema:description "Hauptstadt von Frankreich, seit Neolithikum besiedelt, von Kelten gegründet, seit 486 Hauptstadt des Fränk. Reiches"@de;
  .
`;
