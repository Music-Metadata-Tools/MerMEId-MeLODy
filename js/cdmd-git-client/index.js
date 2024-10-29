import { LitElement, html, css } from "https://cdn.jsdelivr.net/npm/lit/+esm";
import { Task } from "https://cdn.jsdelivr.net/npm/@lit/task@1.0.1/+esm";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";
//import "https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.17.1/cdn/components/tree/tree.js";

// RDF repository
// https://github.com/rdfjs/N3.js

const styles =
    css`

`;

export default class CDMDGitClient extends LitElement {
    static properties = {
        datalist: {
            type: Array
        },
        filesystem_name: {
            type: String
        },
        repository_folder_name: {
            type: String
        },
    };

    static styles = styles;

    constructor() {
        super();

        this.filesystem_name = "mermeid";
    }

    render() {
        return html`
            <div id="container">
                <div id="toolbar">
                    <sl-button size="small" title="Add repository">
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
                ${this._get_repository_folder_names.render({
            pending: () => html`Loading repositories...`,
            complete: (data) => html`<sl-tree>${data}<sl-tree-item data-relative-path="1008.ttl">1008.ttl</sl-tree-item></sl-tree>`,
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
                                    fs: this.fs,
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
                
                                let commitOid = await git.resolveRef({ fs: this.fs, dir: this.repository_folder_name, ref: "HEAD" });
                                console.log(commitOid);
                
                                if (commitOid !== head_commit) {
                                    await this._git_pull();
                                }*/

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
                console.log(target);
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

            if (target.matches("sl-button#delete-repository, sl-button#delete-repository *")) {
                target.loading = true;
                /*try {
                    await git.deleteRemote({ fs: this.fs, dir: this.repository_folder_name, remote: "upstream" });
                } catch (error) {
                    console.error(error);
                }*/
                console.log(this.repository_folder_name);
                this.fs.rmdir(this.repository_folder_name);
                target.loading = false;
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
        });
    }

    _list_files() {
        //let file_relative_paths = await git.listFiles({ fs: this.fs, dir: this.repository_folder_name, ref: 'HEAD' });

        //this._process_file_relative_paths(file_relative_paths);
    }

    async _git_pull() {
        this._set_username();
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
            this.fs = new LightningFS(this.filesystem_name);
            this.pfs = this.fs.promises;

            let repository_folder_names = await this.pfs.readdir("/");

            // TO BE REMOVED: automatic cloning, for demonstration
            if (repository_folder_names.length === 0 || !repository_folder_names.includes("mermeid_sample_data")) {
                this._load_repository();
                repository_folder_names = await this.pfs.readdir("/");
            }
            // END

            repository_folder_names.sort();

            // let tree_form_control = this.renderRoot.querySelector("input#search-input");
            // the tree item for the last use repo has to have @expanded
            let repository_tree_items = repository_folder_names.map(repository_folder_name => html`<sl-tree-item lazy data-repository-folder-name="${repository_folder_name}">${repository_folder_name}</sl-tree-item>`);

            return repository_tree_items;
        },
        () => []
    );

    async _load_repository() {
        // the repository_folder_name and url has to be set by user, through a dialog window
        this.repository_folder_name = "/mermeid_sample_data";
        let remote_origin_url = "https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data";

        try {
            await this.pfs.mkdir(this.repository_folder_name);
        } catch (error) {
            console.error(error);
        }

        // the branch name has to be get somehow automatically
        let ref = "main";

        let start = performance.now();
        try {
            await git.clone({
                fs: this.fs,
                http,
                dir: this.repository_folder_name,
                corsProxy: "https://cors.isomorphic-git.org",
                url: remote_origin_url,
                ref,
                singleBranch: true,
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