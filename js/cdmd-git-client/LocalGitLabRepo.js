import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";

/**
 * @implements  GitDataSourceInterface
 */
export default class LocalGitLabRepo {
    create_repository(custom_element) { }

    async delete_repository(custom_element) {
        try {
            await git.deleteRemote({ fs: custom_element.fs, dir: custom_element.repository_folder_name, remote: "upstream" });
        } catch (error) {
            console.error(error);
        }

        let clearDirectory = async (dir) => {

        };
        console.log(custom_element.repository_folder_name);

        await this._clear_directory(custom_element, custom_element.repository_folder_name);
        await custom_element.pfs.rmdir(custom_element.repository_folder_name);

        await custom_element._get_repository_names();
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

    async _clear_directory(custom_element, dir) {
        for (let item of await custom_element.pfs.readdir(dir)) {
            const item_path = `${dir}/` + item;
            if ((await custom_element.pfs.stat(item_path)).type === 'file') {
                await custom_element.pfs.unlink(item_path);
            } else {
                await this._clear_directory(custom_element, item_path);
                await custom_element.pfs.rmdir(item_path);
            }
        }
    }
}