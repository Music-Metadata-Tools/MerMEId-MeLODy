import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";
import "./create-repository-dialog/index.js";

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
            // the tree item for the last use repo has to have @expanded
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
                    <sl-button id="create-repository-toolbar-button" size="small" title="Add repository">
                        <sl-icon name="shield-plus"></sl-icon>
                    </sl-button>
                    <sl-button id="delete-repository" size="small" title="Delete repository" disabled>
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
                ${this._initialize_filesystem.render({
            pending: () => html`Loading repositories...`,
            complete: () => html`<sl-tree>${this._repository_name_items}<sl-tree-item data-relative-path="1008.ttl">1008.ttl</sl-tree-item></sl-tree>`,
        })}
            </div>
            <cdmd-create-repository-dialog></cdmd-create-repository-dialog>
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
            let delete_repository_button = render_root.querySelector("sl-button#delete-repository");

            // this is for clicking the name of a folder for a repository
            if (target.matches("sl-tree-item[data-repository-folder-name]")) {
                this.repository_folder_name = `/${target.dataset.repositoryFolderName}`;
                delete_repository_button.disabled = false;
            }

            // open the file in editor
            if (target.matches("sl-tree-item:not([data-repository-folder-name])")) {
                delete_repository_button.disabled = true;

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
                let create_repository_dialog = render_root.querySelector("cdmd-create-repository-dialog");
                create_repository_dialog.repository_names = await this._get_repository_names();
                create_repository_dialog.show();
            }

            if (target.matches("sl-button#delete-repository, sl-button#delete-repository *")) {
                let button = target.closest("sl-button");
                button.loading = true;

                await gitlab_client.delete_repository(this.repository_folder_name);
                let repository_names = await this._get_repository_names();
                this._repository_names = repository_names;

                button.loading = false;
                button.disabled = true;
            }
        });

        render_root.addEventListener("cdmd-git-client:repository-branches", async (event) => {
            let repository_metadata = event.detail;

            let branches = await gitlab_client.list_branches(repository_metadata);

            let dialog = render_root.querySelector("cdmd-create-repository-dialog");
            dialog.repository_branches = branches;
        });

        render_root.addEventListener("cdmd-git-client:repository-to-create", async (event) => {
            let repository_metadata = event.detail;

            // create the repository to clone data structure

            await gitlab_client.create_repository(repository_metadata);

            let repository_names = await this._get_repository_names();
            this._repository_names = repository_names;

            let dialog = render_root.querySelector("cdmd-create-repository-dialog");
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
// updated list of repo after deletion of a repo
