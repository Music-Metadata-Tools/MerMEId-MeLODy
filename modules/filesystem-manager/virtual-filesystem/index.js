import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";
import * as FILESYSTEM_MANAGER_CONSTANTS from "../constants.js";

export default class ADWLMVirtualFilesystem {
    constructor() {
        this._filesystem_name = "mermeid";
        this.fs = new LightningFS(this._filesystem_name);
        this.pfs = this.fs.promises;
        this._localRepositories = new Map();
    }

    async add_local_repository(name, dirHandle) {
        this._localRepositories.set(name, dirHandle);
    }

    async remove_local_repository(repository_path) {
        this._localRepositories.delete(repository_path);
    }

    async is_public_repository(repository_metadata) {
        let is_public = true;
        let repository_url = repository_metadata.url;

        try {
            await git.getRemoteInfo2({
                http,
                corsProxy: FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY,
                url: repository_url
            });

            return is_public;
        } catch (error) {
            let status_code = error.data.statusCode;

            if (status_code === 401) {
                is_public = false;

                return is_public;
            } else {
                // Maybe deal with more error codes, or even return the error messages
                // or even replace alert().
                alert(`HTTP error: ${status_code}.`);

                return is_public;
            }
        }
    }

    async add_repository(repository_metadata) {
        let repository_folder_name = repository_metadata.folder;
        let personal_acces_token = repository_metadata.token;
        let username = repository_metadata.username;
        let remote_origin_url = repository_metadata.url;
        let repository_branch = repository_metadata.branch;

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
                corsProxy: FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY,
                url: remote_origin_url,
                ref: repository_branch,
                singleBranch: true,
                noTags: true,
                cache: {},
                depth: 1,
                onAuth: () => ({
                    username: username,
                    password: personal_acces_token,
                }),
            });
        } catch (error) {
            console.error(error);
        }
        let end = performance.now();
        console.log("elapsed time for cloning = " + (end - start) + "ms");

        // store the user's personal acces token
        await git.setConfig({
            fs: this.fs,
            dir: repository_folder_name,
            path: "user.pat",
            value: personal_acces_token
        });

        // store the username
        await git.setConfig({
            fs: this.fs,
            dir: repository_folder_name,
            path: "user.name",
            value: username
        });
    }

    async remove_repository(repository_folder_name) {
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

    // list repositories
    async list_repository_names() {
        let gitRepos = await this.pfs.readdir("/");
        let localRepos = Array.from(this._localRepositories.keys());

        let allRepos = [...gitRepos, ...localRepos];
        allRepos.sort();

        return allRepos;
    }

    async rename_entry(repository_path, old_entry_absolute_path, new_entry_absolute_path, old_entry_relative_path, new_entry_relative_path) {
        /*
        TODO: this is for renaming a file, but it is not working, due to a limitation of ismorphic-git
        // remove from the Git index the old path to file
        await git.resetIndex({
            fs: this.fs,
            dir: repository_path,
            filepath: old_entry_relative_path
        });
        */

        // rename the entry
        await this.pfs.rename(old_entry_absolute_path, new_entry_absolute_path);

        /*
        // add to the Git index the new path to file
        await git.add({
            fs: this.fs,
            dir: repository_path,
            filepath: new_entry_relative_path
        });
        // END TODO
        */
    }

    async list_entries_from_workdir(repository_path, parent_folder_relative_path) {
        const repoName = repository_path.replace("/", "");
        
        if (this._localRepositories.has(repoName)) {
            const dirHandle = this._localRepositories.get(repoName);

            let currentHandle = dirHandle;

            let relativePath = parent_folder_relative_path;

            if (relativePath.startsWith(repoName)) {
                relativePath = relativePath.slice(repoName.length);
                if (relativePath.startsWith("/")) {
                    relativePath = relativePath.slice(1);
                }
            }

            if (relativePath && relativePath !== "") {
                const parts = relativePath.split("/").filter(Boolean);

                for (const part of parts) {
                    try {
                        currentHandle = await currentHandle.getDirectoryHandle(part);
                    } catch (err) {
                        console.warn("Directory not found:", part, err);
                        return { folders: [], files: [] };
                    }
                }
            }

            let folders = [];
            let files = [];

            for await (const [name, handle] of currentHandle.entries()) {
                if (name.startsWith(".")) continue;

                if (handle.kind === "directory") {
                    folders.push(
                        parent_folder_relative_path
                            ? `${parent_folder_relative_path}/${name}`
                            : name
                    );
                } else {
                    files.push(
                        parent_folder_relative_path
                            ? `${parent_folder_relative_path}/${name}`
                            : name
                    );
                }
            }

            folders.sort();
            files.sort();

            return { folders, files };
        }

        let folders = [];
        let files = [];

        if (repository_path === `/${parent_folder_relative_path}`) {
            parent_folder_relative_path = "";
        } else {
            parent_folder_relative_path = `${parent_folder_relative_path}/`;
        }
        await git.walk({
            fs: this.fs,
            dir: repository_path,
            trees: [git.WORKDIR()],
            map: async (entry_path, [entry]) => {
                if (!entry_path.startsWith(parent_folder_relative_path)) {
                    return;
                }
                let entry_type = await entry.type();

                if (entry_type === "tree" && !entry_path.startsWith(".")) {
                    folders.push(entry_path);

                    return null;
                }

                if (entry_type === "blob" && !entry_path.startsWith(".")) {
                    files.push(entry_path);
                }
            },
        });

        folders.sort();
        files.sort();

        return {
            folders,
            files
        };
    }

    async add_file(repository_path, file_relative_path) {
        // remove the file from the git index
        await git.remove({ fs: this.fs, dir: repository_path, filepath: file_relative_path });
        await this.pfs.unlink(`${repository_path}/${file_relative_path}`);
    }

    async save_and_stage_file(repository_path, file_contents, file_relative_path) {
        const repoName = repository_path.replace("/", "");

        if (this._localRepositories.has(repoName)) {
            const dirHandle = this._localRepositories.get(repoName);

            let relativePath = file_relative_path;

            if (relativePath.startsWith(repoName)) {
                relativePath = relativePath.slice(repoName.length);
                if (relativePath.startsWith("/")) {
                    relativePath = relativePath.slice(1);
                }
            }

            const parts = relativePath.split("/").filter(Boolean);

            let currentHandle = dirHandle;

            try {
                for (let i = 0; i < parts.length - 1; i++) {
                    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
                }

                const fileHandle = await currentHandle.getFileHandle(parts.at(-1), { create: true });

                const writable = await fileHandle.createWritable();
                await writable.write(file_contents);
                await writable.close();

                return {
                    success: true,
                    filename: parts.at(-1),
                    folder: parts[0],
                    path: relativePath
                };

            } catch (error) {
                console.error("Error writing local file:", error);
                throw new Error(`Failed to save local file: ${error.message}`);
            }
        }



        try {
            // Create parent directories recursively
            let parent_folder_path = `${repository_path}/${file_relative_path}`.substring(0, `${repository_path}/${file_relative_path}`.lastIndexOf('/'));
            try {
                await this.pfs.mkdir(parent_folder_path, { recursive: true });
            } catch (err) {
                // Ignore directory exists error
                if (err.code !== 'EEXIST') {
                    throw err;
                }
            }

            // Write file with overwrite
            await this.pfs.writeFile(`${repository_path}/${file_relative_path}`, file_contents, { 
                encoding: 'utf8',
                flag: 'w'  // This will overwrite existing files
            });
            
            // Stage the file
            await git.add({ 
                fs: this.fs, 
                dir: repository_path, 
                filepath: file_relative_path 
            });

            // Update the Git index
            await git.updateIndex({
                fs: this.fs,
                dir: repository_path,
                add: true,
                filepath: file_relative_path
            });

            // Return success with file details
            return {
                success: true,
                filename: file_relative_path.split('/').pop(),
                folder: file_relative_path.split('/')[0],
                path: file_relative_path
            };
        } catch (error) {
            console.error('Error saving file:', error);
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }

    async read_file(repository_path, file_path) {
        const repoName = repository_path.replace("/", "");

        if (this._localRepositories.has(repoName)) {
            const dirHandle = this._localRepositories.get(repoName);

            let relativePath = file_path;

            if (relativePath.startsWith(repoName)) {
                relativePath = relativePath.slice(repoName.length);
                if (relativePath.startsWith("/")) {
                    relativePath = relativePath.slice(1);
                }
            }

            const parts = relativePath.split("/").filter(Boolean);

            let currentHandle = dirHandle;

            try {
                for (let i = 0; i < parts.length - 1; i++) {
                    currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
                }

                const fileHandle = await currentHandle.getFileHandle(parts.at(-1));
                const file = await fileHandle.getFile();

                return await file.text();

            } catch (err) {
                console.error("Failed to read local file:", {
                    repoName,
                    file_path,
                    relativePath,
                    parts
                });
                throw err;
            }
        }


        let file_contents = "";

        await git.walk({
            fs: this.fs,
            dir: repository_path,
            trees: [git.WORKDIR()],
            map: async (entry_path, [entry]) => {
                if (entry_path === file_path) {
                    file_contents = await entry.content();
                }
            },
        });
        if (file_contents) {
            file_contents = new TextDecoder().decode(file_contents);
        }

        return file_contents;
    }

    async list_staged_files(repository_path) {
        let start = performance.now();
        let changed_files = await git.walk({
            fs: this.fs,
            dir: repository_path,
            trees: [git.TREE(), git.STAGE()],
            map: async (entry_path, [tree_entry, stage_entry]) => {
                if (tree_entry === null) {
                    console.log(`${JSON.stringify(tree_entry)} ${JSON.stringify(stage_entry)}`);
                    let status = await git.status({ fs: this.fs, dir: repository_path, filepath: entry_path });
                    console.log(status);
                    return entry_path;
                }
                let entry_type = await tree_entry.type();

                // TODO: consider the case of deleted files
                if (stage_entry === null && entry_path.endsWith(".ttl")) {
                    return `${entry_path}-deleted`;
                }
                // END TODO:

                if (entry_type === "blob" && !entry_path.startsWith(".")) {
                    let workdir_oid = await tree_entry.oid();
                    let stage_oid = await stage_entry.oid();
                    if (workdir_oid !== stage_oid) {
                        // TODO: add Git status for each entry
                        return entry_path;
                    }
                }
            },
        });
        let end = performance.now();
        console.log("elapsed time for listing the staged files = " + (end - start) + "ms");

        return changed_files;
    }

    async commit_and_push_file(repository_path, staged_file_paths, selected_staged_file_paths) {
        // get some metadata
        let current_branch = await git.currentBranch({
            fs: this.fs,
            dir: repository_path,
            fullname: false
        });
        let personal_access_token = await git.getConfigAll({
            fs: this.fs,
            dir: repository_path,
            path: "user.pat"
        });
        let username = await git.getConfigAll({
            fs: this.fs,
            dir: repository_path,
            path: "user.name"
        });

        let commit_message = `${(new Date()).toISOString()}, ${username}`;

        // in case when not all files were selected,
        // unstage the files that were not selected
        if (selected_staged_file_paths.length > 0) {
            let to_unstage_file_paths = staged_file_paths.filter(path => !selected_staged_file_paths.includes(path));
            for (const to_unstage_file_path of to_unstage_file_paths) {
                await git.resetIndex({
                    fs: this.fs,
                    dir: repository_path,
                    filepath: to_unstage_file_path
                });
            }
        }

        // commit the staged files
        let sha = await git.commit({
            fs: this.fs,
            dir: repository_path,
            author: {
                name: username,
                email: username,
            },
            message: commit_message
        });

        let push_result = {};
        try {
            // push all the committed files
            push_result = await git.push({
                fs: this.fs,
                http,
                dir: repository_path,
                remote: FILESYSTEM_MANAGER_CONSTANTS.REMOTE_NAME,
                ref: current_branch,
                force: false,
                onAuth: () => ({
                    username: username,
                    password: personal_access_token,
                }),
            });
        } catch (error) {
            //console.error(error);
            throw error;
        }

        // in case when not all files were selected,
        // stage back the files that were not selected
        if (selected_staged_file_paths.length > 0) {
            let to_stage_back_file_paths = staged_file_paths.filter(path => !selected_staged_file_paths.includes(path));
            for (const to_stage_back_file_path of to_stage_back_file_paths) {
                await git.add({
                    fs: this.fs,
                    dir: repository_path,
                    filepath: to_stage_back_file_path
                });
            }
        }

        return push_result.ok;
    }

    async pull(repository_path) {
        // get some metadata
        let personal_access_token = await git.getConfigAll({
            fs: this.fs,
            dir: repository_path,
            path: "user.pat"
        });
        let username = await git.getConfigAll({
            fs: this.fs,
            dir: repository_path,
            path: "user.name"
        });
        let current_branch = await git.currentBranch({
            fs: this.fs,
            dir: repository_path,
            fullname: false
        });

        // pull the changes from the remote repository
        let start = performance.now();
        try {
            await git.pull({
                fs: this.fs,
                http,
                dir: repository_path,
                ref: current_branch,
                singleBranch: true,
                corsProxy: FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY,
                onAuth: () => ({
                    username: username,
                    password: personal_access_token,
                })
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
        let end = performance.now();
        console.log("elapsed time for git.pull() = " + (end - start) + "ms");
    }

    async unstageFile(repository_path, file_relative_path) {
        let current_branch = await git.currentBranch({
            fs: this.fs,
            dir: repository_path,
            fullname: false
        });

        try {
            // Reset the index entry for this file
            await git.resetIndex({
                fs: this.fs,
                dir: repository_path,
                filepath: file_relative_path
            });

            // Restore the file from current branch
            await git.checkout({
                fs: this.fs,
                dir: repository_path,
                ref: current_branch,
                force: true,
                filepaths: [file_relative_path]
            });

            return true;
        } catch (error) {
            console.error('Error unstaging file:', error);
            throw new Error(`Failed to unstage file: ${error.message}`);
        }
    }

    async _list_refs(repository_metadata, refs_type) {
        let refs = await git.listServerRefs({
            http,
            corsProxy: FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY,
            url: repository_metadata.url,
            prefix: `refs/${refs_type}/`,
            onAuth: () => ({
                username: repository_metadata.username,
                password: repository_metadata.token,
            }),
        });

        return refs;
    }

    async _clear_directory(directory) {
        for (let item of await this.pfs.readdir(directory)) {
            const item_path = `${directory}/` + item;
            if ((await this.pfs.stat(item_path)).type === 'file') {
                await this.pfs.unlink(item_path);
            } else {
                await this._clear_directory(item_path);
                await this.pfs.rmdir(item_path);
            }
        }
    }
}