import GitDataSourceInterface from "./GitDataSourceInterface.js";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";

/**
 * @implements  GitDataSourceInterface
 */
export default class LocalGitLabRepo extends GitDataSourceInterface {
    constructor() {
        super();

        this.fs = new LightningFS(this.filesystem_name);
        this.pfs = this.fs.promises;
    }

    async create_repository(repository_to_clone) {
        let repository_folder_name = repository_to_clone.folder;
        let remote_origin_url = repository_to_clone.url;
        let repository_branch = repository_to_clone.branch;

        try {
            await this.pfs.mkdir(repository_folder_name);
        } catch (error) {
            console.error(error);
        }

        let start = performance.now();
        try {
            await git.clone({
                fs: this.fs,
                http,
                dir: repository_folder_name,
                corsProxy: "https://cors.isomorphic-git.org",
                url: remote_origin_url,
                ref: repository_branch,
                singleBranch: true,
                noTags: true,
                depth: 1
            });
        } catch (error) {
            console.error(error);
        }
        let end = performance.now();
        console.log("elapsed_time = " + (end - start) + "ms");
    }

    async delete_repository(repository_folder_name) {
        super.delete_repository();

        try {
            await git.deleteRemote({ fs: this.fs, dir: repository_folder_name, remote: "upstream" });
        } catch (error) {
            console.error(error);
        }

        await this._clear_directory(repository_folder_name);
        await this.pfs.rmdir(repository_folder_name);
    }

    // List the branches of a repository.
    async list_branches(repository_metadata) {
        let branch_metadata = await this._list_refs(repository_metadata, "heads");
        let branches = branch_metadata.map(metadatum => {
            let ref = metadatum.ref;

            return ref.substring("refs/heads/".length);
        });

        return branches;
    }

    // loads the repository when
    load_repository() {
        // set username

    }

    list_files(parent_dir) { }

    save_file() {

    }

    commit_file() {

    }

    async _list_refs(repository_url, refs_type) {
        let refs = await git.listServerRefs({
            http,
            corsProxy: "https://cors.isomorphic-git.org",
            url: repository_url,
            prefix: `refs/${refs_type}/`,
        });

        return refs;
    }

    async _clear_directory(dir) {
        for (let item of await this.pfs.readdir(dir)) {
            const item_path = `${dir}/` + item;
            if ((await this.pfs.stat(item_path)).type === 'file') {
                await this.pfs.unlink(item_path);
            } else {
                await this._clear_directory(item_path);
                await this.pfs.rmdir(item_path);
            }
        }
    }
}