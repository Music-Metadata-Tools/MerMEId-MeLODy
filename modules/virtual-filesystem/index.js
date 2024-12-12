import git from "https://cdn.jsdelivr.net/npm/isomorphic-git@1.27.1/+esm";
import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js";
import diff from "https://cdn.jsdelivr.net/npm/diff-lines@1.1.1/+esm";

export default class VirtualFilesystem {
    constructor() {
        this._filesystem_name = "mermeid";
        this.fs = new LightningFS(this._filesystem_name);
        this.pfs = this.fs.promises;
    }

    async is_public_repository(repository_metadata) {
        let is_public = true;
        let repository_url = repository_metadata.url;

        try {
            await git.getRemoteInfo2({
                http,
                corsProxy: "https://cors.isomorphic-git.org",
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
                corsProxy: "https://cors.isomorphic-git.org",
                url: remote_origin_url,
                ref: repository_branch,
                singleBranch: true,
                noTags: true,
                cache: {},
                depth: 1,
                onAuth: () => ({
                    username: repository_metadata.username,
                    password: repository_metadata.token,
                }),
            });
        } catch (error) {
            console.error(error);
        }
        let end = performance.now();
        console.log("elapsed_time = " + (end - start) + "ms");
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
        let repository_names = await this.pfs.readdir("/");
        repository_names.sort();

        return repository_names;
    }

    // loads the repository when
    load_repository() {
        // set username

    }

    async walk(entry_path) {
        //let file_relative_paths = await git.walk({ fs: gitlab_client.fs, gitdir: this.repository_folder_name, trees: '/' });

        return await git.walk({
            "fs": this.fs,
            dir: entry_path,
            trees: [git.STAGE()],
            map: async (filePath, [A]) => console.log(A),
        });
    }

    async rename_entry(old_path, new_path) {
        await this.pfs.rename(old_path, new_path);
    }

    async list_entries_from_workdir(parent_folder_path) {
        let repository_path = "/mermeid-01";
        let entries = [];
        await git.walk({
            "fs": this.fs,
            dir: repository_path,
            trees: [git.WORKDIR()],
            map: async (entry_path, [entry]) => {
                let entry_type = await entry.type();

                if (entry_type === "tree" && !entry_path.startsWith(".")) {
                    entries.push(`folder:/${entry_path}`);

                    return null;
                }

                if (entry_type === "blob" && !entry_path.startsWith(".")) {
                    entries.push(`file:/${entry_path}`);
                }
            },
        });

        entries.sort();

        return entries;
    }

    async save_file(repository_path, file_contents, file_relative_path) {
        await this.pfs.writeFile(`${repository_path}/${file_relative_path}`, file_contents);
        //await git.add({ fs: this.fs, dir: repository_path, filepath: file_relative_path })

        /*
        let oid = await git.writeBlob({
            fs: this.fs,
            dir: repository_path,
            blob: new TextEncoder().encode(file_contents)
        });

        // Write the object in the object database to the index.
        let oid2 = await git.updateIndex({
            fs: this.fs,
            dir: repository_path,
            add: true,
            filepath: file_relative_path,
            oid
        });

        console.log(oid2);*/
    }

    async read_file(repository_path, file_relative_path) {
        let file_contents = "";

        await git.walk({
            "fs": this.fs,
            dir: repository_path,
            trees: [git.WORKDIR()],
            map: async (entry_path, [entry]) => {
                if (entry_path === file_relative_path) {
                    file_contents = await entry.content();
                }
            },
        });
        file_contents = new TextDecoder().decode(file_contents);

        return file_contents;
    }

    async commit_and_push_file(repository_path) {
        /*let value = await git.getConfigAll({
            "fs": this.fs,
            dir: '/mermeid-01',
            path: "user.email"
        });
        console.log(value);*/

        //return;
        let sha = await git.commit({
            "fs": this.fs,
            dir: repository_path,
            author: {
                name: 'Mr. Test',
                email: 'mrtest@example.com',
            },
            message: 'Added the a.txt file'
        });
        console.log(sha);

        let pushResult = await git.push({
            "fs": this.fs,
            http,
            dir: repository_path,
            remote: 'origin',
            ref: 'main',
            onAuth: () => ({
                username: "teoclaud",
                password: "aGrcXmKzFAypt57zox-y",
            }),
        });
        console.log(pushResult);
        /*
        let start = performance.now();
        await git.walk({
            "fs": this.fs,
            dir: repository_path,
            trees: [git.WORKDIR(), git.STAGE()],
            map: async (entry_path, [workdir_entry, stage_entry]) => {
                let entry_type = await workdir_entry.type();

                if (entry_type === "blob" && !entry_path.startsWith(".")) {
                    let workdir_oid = await workdir_entry.oid();
                    let stage_oid = await stage_entry.oid();
                    //let status = await git.status({ "fs": this.fs, dir: repository_path, filepath: entry_path });
                    if (workdir_oid !== stage_oid) {
                        console.log(`${entry_path}`);
                    }
                }
            },
        });
        let end = performance.now();
        console.log("elapsed time for detecting files that have unstaged changes = " + (end - start) + "ms");
*/
        /*let start = performance.now();
        let filenames = await git.walk({
            "fs": this.fs,
            dir: repository_path,
            trees: [git.STAGE(), git.WORKDIR()],
            map: async (filepath, [head, workdir]) => {
                //console.log(workdir);
                return {
                    filepath,
                    oid: await head?.oid(),
                    diff: diff(
                        (await head?.content())?.toString('utf8') || '',
                        (await workdir?.content())?.toString('utf8') || ''
                    )
                }
            },
        });
        let end = performance.now();
        console.log("elapsed time for detecting files that have unstaged changes = " + (end - start) + "ms");
*/
        /*const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;

        let start = performance.now();
        const filenames = (await git.statusMatrix({
            "fs": this.fs,
            dir: repository_path,
        }))
            .filter(row => row[WORKDIR] !== row[STAGE])
            .map(row => [row[FILE], row[WORKDIR]]);
        let end = performance.now();
        console.log("elapsed time for detecting files that have unstaged changes = " + (end - start) + "ms");

        console.log(filenames);*/
    }

    async pull() {
        //this._set_username();
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
        console.log("elapsed time for git.pull() = " + (end - start) + "ms");
    }

    async _list_refs(repository_metadata, refs_type) {
        let refs = await git.listServerRefs({
            http,
            corsProxy: "https://cors.isomorphic-git.org",
            url: repository_metadata.url,
            prefix: `refs/${refs_type}/`,
            onAuth: () => ({
                username: repository_metadata.username,
                password: repository_metadata.token,
            }),
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