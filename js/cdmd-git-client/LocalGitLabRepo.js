import GitDataSourceInterface from "./GitDataSourceInterface.js";
import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";

/**
 * @implements  GitDataSourceInterface
 */
export default class LocalGitLabRepo extends GitDataSourceInterface {
    constructor() {
        super();

        this.fs = new LightningFS(this.filesystem_name);
        this.pfs = this.fs.promises;
    }
    create_repository(custom_element) { }

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

    // loads the repository when
    load_repository() {
        // set username

    }

    list_files(parent_dir) { }

    save_file() {

    }

    commit_file() {

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