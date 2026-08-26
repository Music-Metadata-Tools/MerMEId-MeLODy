import * as FILESYSTEM_MANAGER_CONSTANTS from "../constants.js";
import git from "#isomorphic-git";
import http from "#isomorphic-git-http";
import init_oxigraph, * as oxigraph from "#oxigraph";
import { createProvider, ensureDir, pushViaApi } from "../api-provider.js";
import FSADirectoryFilesystem from "./fsa-directory-filesystem.js";
import OPFSDirectoryFilesystem from "./opfs-directory-filesystem.js";
import LocalRepositoryStore from "./local-repository-store.js";
await init_oxigraph();

export default class ADWLMVirtualFilesystem {
    constructor(fs = null, { httpPlugin = null, corsProxy = FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY } = {}) {
        this._filesystem_name = "mermeid";
        this.fs = fs ?? new OPFSDirectoryFilesystem();
        this.pfs = this.fs.promises;
        this._http = httpPlugin ?? http;
        this._corsProxy = corsProxy;
        this._localRepositories = new Map();
        // All local repos ever added, whether or not read/write permission is
        // currently granted for their handle - lets list_repository_names()
        // show repos added in a previous browser session, even before the
        // user has re-granted permission for them.
        this._localRepositoryHandles = new Map();
        this._localRepositoryStore = new LocalRepositoryStore();
        // FileSystemDirectoryHandle permission can survive a page reload but
        // not a fresh browser session, so restore what's possible (silently,
        // via queryPermission()) on startup; anything left over is reconnected
        // on demand through ensure_local_repository_access().
        this._localRepositoriesReady = this._restore_local_repositories();
        this.store = null;
        this.index_store = null;
        this.entity_store = null;
    }

    // .dirty.json/.snapshot.json bookkeeping (_readDirtySet/_writeDirtySet
    // and friends) always lives on the shared `this.pfs`, keyed by
    // repository name, regardless of whether the repo's actual content is on
    // that same shared fs or a local folder via the File System Access API -
    // so this directory has to exist there too, mirroring what
    // add_repository() does for API-cloned repos. Idempotent: swallows the
    // "already exists" error so it's safe to call every time a local repo
    // becomes accessible (added, or reconnected after a reload).
    async _ensure_repository_metadata_dir(name) {
        try {
            await this.pfs.mkdir(name);
        } catch (error) {
            // already exists - fine
        }
    }

    async _restore_local_repositories() {
        const stored = await this._localRepositoryStore.getAll();

        for (const [name, dirHandle] of stored) {
            this._localRepositoryHandles.set(name, dirHandle);

            try {
                const permission = await dirHandle.queryPermission({ mode: "readwrite" });
                if (permission === "granted") {
                    this._localRepositories.set(name, { dirHandle, fs: new FSADirectoryFilesystem(dirHandle) });
                    await this._ensure_repository_metadata_dir(name);
                }
            } catch (error) {
                console.warn(`Could not restore local repository '${name}':`, error);
            }
        }
    }

    // Re-grants access to a previously added local repository whose handle
    // survived a reload/restart but whose permission did not. Must be called
    // from a user-gesture handler (e.g. a click), since requestPermission()
    // silently no-ops otherwise. Returns true for non-local repositories too,
    // since they need no reconnection.
    async ensure_local_repository_access(name) {
        await this._localRepositoriesReady;

        if (this._localRepositories.has(name)) {
            return true;
        }

        const dirHandle = this._localRepositoryHandles.get(name);
        if (!dirHandle) {
            return true;
        }

        let permission = await dirHandle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
            permission = await dirHandle.requestPermission({ mode: "readwrite" });
        }
        if (permission !== "granted") {
            return false;
        }

        this._localRepositories.set(name, { dirHandle, fs: new FSADirectoryFilesystem(dirHandle) });
        await this._ensure_repository_metadata_dir(name);

        return true;
    }

    async add_local_repository(name, dirHandle, { username, token } = {}) {
        let permission = await dirHandle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
            permission = await dirHandle.requestPermission({ mode: "readwrite" });
        }
        if (permission !== "granted") {
            throw new Error(`Read/write permission for the folder '${name}' was not granted.`);
        }
        
        const fs = new FSADirectoryFilesystem(dirHandle);

        let hasGit = true;
        try {
            await dirHandle.getDirectoryHandle(".git");
        } catch (error) {
            hasGit = false;
        }

        if (!hasGit) {
            // Write a real, git-CLI-compatible .git directly into the picked folder.
            await git.init({ fs, dir: "/" });
        }
        
        // Store credentials the same way add_repository() does for cloned
        // repos, so commit_and_push_file/pull/canPullSafely can authenticate
        // pushes/pulls for locally-loaded repos too (e.g. cloned via SSH,
        // where isomorphic-git can still push/pull over the HTTPS remote).
        // Writing them into .git/config means they also survive a reload
        // together with the folder itself - no separate credential storage
        // needed.
        if (username || token) {
            await git.setConfig({ fs, dir: "/", path: "user.pat", value: token });
            await git.setConfig({ fs, dir: "/", path: "user.name", value: username });
        }

        let branch_name = await git.getConfig({
                fs,
                dir: "/",
                path: "branch.name"
            });

        await git.setConfig({
            fs,
            dir: "/",
            path: "branch.name",
            value: branch_name
        });

        try {

            let remote_origin_url = await git.getConfig({
                fs,
                dir: "/",
                path: "remote.origin.url"
            });
            const provider = createProvider(remote_origin_url, token, {
                onLog: (message) => console.log(message),
                onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
            });
        } catch (error) {
            console.error(error);
        }

        await this._ensure_repository_metadata_dir(name);

        this._localRepositories.set(name, { dirHandle, fs });
        this._localRepositoryHandles.set(name, dirHandle);
        await this._localRepositoryStore.put(name, dirHandle);
    }

    async remove_local_repository(repository_path) {
        this._localRepositories.delete(repository_path);
        this._localRepositoryHandles.delete(repository_path);
        await this._localRepositoryStore.delete(repository_path);
    }

    _get_fs_for_repository(repository_path) {
        const repoName = repository_path.replace(/^\//, "");
        const local = this._localRepositories.get(repoName);

        return local ? local.fs : this.fs;
    }

    _get_dir_for_repository(repository_path) {
        const repoName = repository_path.replace(/^\//, "");

        return this._localRepositories.has(repoName) ? "/" : repository_path;
    }

    // Resolves a repo-relative path to an absolute path inside the repo's own `fs`.
    _get_path_for_repository(repository_path, relative_path) {
        const dir = this._get_dir_for_repository(repository_path);

        return `${dir}/${relative_path}`.replace(/\/{2,}/g, "/");
    }

    // isomorphic-git only speaks HTTP(S) - a repo cloned via `git@host:path.git`
    // or `ssh://git@host/path.git` (e.g. by a local git CLI, then opened here via
    // the File System Access API) would otherwise fail with UnknownTransportError.
    // Most hosts serve the same repository over HTTPS too, so the SSH remote URL
    // is converted at call-time and passed explicitly to push/pull/fetch - the
    // stored remote in .git/config is left untouched, so a local git CLI can keep
    // using it over SSH.
    _to_https_url(url) {
        if (!url || /^https?:\/\//i.test(url)) {
            return url;
        }

        // ssh://[user@]host[:port]/path
        let match = url.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i);
        if (match) {
            return `https://${match[1]}/${match[2]}`;
        }

        // scp-like syntax, e.g. git@gitlab.example.org:group/repo.git
        match = url.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
        if (match) {
            return `https://${match[1]}/${match[2]}`;
        }

        return url;
    }

    async _get_push_pull_url(fs, dir) {
        const remote_url = await git.getConfig({
            fs,
            dir,
            path: `remote.${FILESYSTEM_MANAGER_CONSTANTS.REMOTE_NAME}.url`
        });

        return this._to_https_url(remote_url);
    }

    // git.getConfigAll() always returns an array - even when nothing is stored
    // ([] is truthy in JS - so `onAuth: () => ({ username, password })` would
    // silently send an *empty* Basic-Auth header instead of no header at all,
    // which reads to the server exactly like a wrong password: 401, no matter
    // what was typed in the dialog). git.getConfig() returns the raw value (or
    // undefined), so missing credentials are actually falsy and easy to spot.
    async _get_credentials_for_repository(fs, dir) {
        const token = await git.getConfig({ fs, dir, path: "user.pat" });
        const username = await git.getConfig({ fs, dir, path: "user.name" });

        if (!token || !username) {
            console.warn(`No stored credentials found for repository at '${dir}' - requests will be sent without authentication.`);
        }

        return { username, token };
    }

    async is_public_repository(repository_metadata) {
        let is_public = true;
        let repository_url = repository_metadata.url;

        try {
            await git.getRemoteInfo2({
                http: this._http,
                corsProxy: this._corsProxy,
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

        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION
        // try {
        //     await git.clone({
        //         fs: this.fs,
        //         http: this._http,
        //         dir: repository_folder_name,
        //         corsProxy: this._corsProxy,
        //         url: remote_origin_url,
        //         ref: repository_branch,
        //         singleBranch: true,
        //         noTags: true,
        //         cache: {},
        //         depth: 1,
        //         onAuth: () => ({
        //             username: username,
        //             password: personal_acces_token,
        //         }),
        //     });
        // } catch (error) {
        //     console.error(error);
        // }
        // ---------------------------------------------------------------------

        try {
            // Replaces git.clone(): loads all files via the GitHub/GitLab API instead
            // of the Git network protocol - this eliminates the CORS proxy entirely.
            const provider = createProvider(remote_origin_url, personal_acces_token, {
                onLog: (message) => console.log(message),
                onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
            });
            const files = await provider.fetchAllFiles(repository_branch);

            const snapshot = {};

            for (const file of files) {
                const full_path = `${repository_folder_name}/${file.path}`;
                const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                if (parent_folder_path !== repository_folder_name) {
                    // ensureDir() creates intermediate directories level by level, since
                    // Lightning-FS does not reliably create all missing directories at
                    // once with { recursive: true } (unlike Node.js) - see api-provider.js.
                    await ensureDir(this.fs, parent_folder_path);
                }

                await this.pfs.writeFile(full_path, file.content, "utf8");

                // Needed by list_staged_files()/unstageFile() to later detect which
                // files have changed since the last sync.
                snapshot[file.path] = file.content;
            }

            await this.pfs.writeFile(
                `${repository_folder_name}/.snapshot.json`,
                JSON.stringify(snapshot),
                "utf8"
            );

            // Sets up a local (empty) Git repo, so other, untouched methods (e.g.
            // list_entries_from_workdir(), which uses git.walk(WORKDIR())) keep
            // working. Deliberately WITHOUT git.add()/git.commit() - the Git object
            // model is no longer used for diffing here (see list_staged_files()).
            //
            // IMPORTANT for later: once commit_and_push_file() is touched, a local
            // commit with the correct parent commit (= current remote HEAD) needs to
            // be added here, otherwise a non-forced git.push() will fail as "not a
            // fast-forward" because the local history doesn't descend from the remote.
            await git.init({ fs: this.fs, dir: repository_folder_name });

            await git.addRemote({
                fs: this.fs,
                dir: repository_folder_name,
                remote: FILESYSTEM_MANAGER_CONSTANTS.REMOTE_NAME,
                url: remote_origin_url,
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

        // store the branch name, so pull() can rebuild the API provider later
        // without needing the user to re-select it
        await git.setConfig({
            fs: this.fs,
            dir: repository_folder_name,
            path: "branch.name",
            value: repository_branch
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
        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION
        // let branch_metadata = await this._list_refs(repository_metadata, "heads");
        // let branches = branch_metadata.map(metadatum => {
        //     let ref = metadatum.ref;
        //     return ref.substring("refs/heads/".length);
        // });
        // return branches;
        // ---------------------------------------------------------------------

        // Replaces git.listServerRefs(): lists branches via the GitHub/GitLab
        // API instead of the Git network protocol - this eliminates the CORS
        // proxy for the "add repository" dialog's branch dropdown too, same
        // idea as add_repository()/pull()/commit_and_push_file() above. At
        // this point (before cloning) there's no local repo/config yet, so
        // url/token come straight from the dialog's repository_metadata,
        // not from git config.
        const provider = createProvider(repository_metadata.url, repository_metadata.token, {
            onLog: (log_line) => console.log(log_line),
            onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
        });

        return await provider.listBranches();
    }

    // list repositories
    async list_repository_names() {
        await this._localRepositoriesReady;

        let gitRepos = await this.pfs.readdir("/");
        let localRepos = Array.from(this._localRepositoryHandles.keys());

        // Local repos also get a metadata-only directory on the shared fs
        // (see _ensure_repository_metadata_dir()), so their name would
        // otherwise show up in both gitRepos and localRepos.
        let localRepoNames = new Set(localRepos);
        let allRepos = [...gitRepos.filter(name => !localRepoNames.has(name)), ...localRepos];
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

        // ---------------------------------------------------------------------
        // .dirty.json update for rename_entry() - reverted, this function is
        // old/unused for now (see list_staged_files() for what .dirty.json is).
        // Would also need old_entry_relative_path/new_entry_relative_path fixed
        // at the call site first (filesystem-manager/index.js:974 currently
        // passes a hardcoded "1008.ttl" for old_entry_relative_path).
        //
        // const to_relative = (absolute_path) => {
        //     const prefix = `${repository_path}/`;
        //     return absolute_path.startsWith(prefix) ? absolute_path.slice(prefix.length) : absolute_path;
        // };
        // const old_relative_path = to_relative(old_entry_absolute_path);
        // const new_relative_path = to_relative(new_entry_absolute_path);
        //
        // if (!new_relative_path.includes("/") || !new_relative_path.endsWith(".ttl")) {
        //     return;
        // }
        //
        // try {
        //     let snapshot = {};
        //     try {
        //         snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
        //     } catch (error) {
        //         // no snapshot yet
        //     }
        //
        //     const dirty = await this._readDirtySet(repository_path);
        //
        //     if (old_relative_path in snapshot) {
        //         dirty[old_relative_path] = "deleted";
        //     } else {
        //         delete dirty[old_relative_path];
        //     }
        //     dirty[new_relative_path] = "changed";
        //
        //     await this._writeDirtySet(repository_path, dirty);
        // } catch (error) {
        //     console.error("Failed to update dirty-file tracking after rename:", error);
        // }
        // ---------------------------------------------------------------------
    }

    async list_entries_from_workdir(repository_path, parent_folder_relative_path) {
        let folders = [];
        let files = [];

        if (repository_path === `/${parent_folder_relative_path}`) {
            parent_folder_relative_path = "";
        } else {
            parent_folder_relative_path = `${parent_folder_relative_path}/`;
        }
        await git.walk({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path),
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
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        // remove the file from the git index
        await git.remove({ fs, dir, filepath: file_relative_path });
        await fs.promises.unlink(this._get_path_for_repository(repository_path, file_relative_path));

        // Keep .dirty.json in sync (see list_staged_files()). filesystem-
        // manager/index.js also calls this with a bare directory name (to
        // clean up an empty folder after removing its last file) - that's
        // not a tracked file, so skip it, same guard as unstageFile().
        if (!file_relative_path.includes("/") || !file_relative_path.endsWith(".ttl")) {
            return;
        }

        try {
            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot yet
            }

            const dirty = await this._readDirtySet(repository_path);
            if (file_relative_path in snapshot) {
                // known from a previous sync - the deletion itself is the change to push.
                dirty[file_relative_path] = "deleted";
            } else {
                // never synced before (a brand new, unpushed file) - deleting
                // it is a net no-op, nothing left to push for this path.
                delete dirty[file_relative_path];
            }
            await this._writeDirtySet(repository_path, dirty);
        } catch (error) {
            console.error("Failed to update dirty-file tracking after delete:", error);
        }
    }

    async save_and_stage_file(repository_path, file_contents, file_relative_path) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        const absolute_path = this._get_path_for_repository(repository_path, file_relative_path);

        try {
            // Create parent directories recursively
            let parent_folder_path = absolute_path.substring(0, absolute_path.lastIndexOf('/'));
            try {
                await fs.promises.mkdir(parent_folder_path, { recursive: true });
            } catch (err) {
                // Ignore directory exists error
                if (err.code !== 'EEXIST') {
                    throw err;
                }
            }

            // Write file with overwrite
            await fs.promises.writeFile(absolute_path, file_contents, {
                encoding: 'utf8',
                flag: 'w'  // This will overwrite existing files
            });

            // Stage the file
            await git.add({
                fs,
                dir,
                filepath: file_relative_path
            });

            // Update the Git index
            await git.updateIndex({
                fs,
                dir,
                add: true,
                filepath: file_relative_path
            });

            // Keep .dirty.json in sync (see list_staged_files() for why this
            // exists): if the new content matches what's in .snapshot.json,
            // the edit was reverted back to the synced state, so it's no
            // longer "changed" - otherwise mark/keep it as changed. This is
            // a single-file read, not a repo-wide scan, so it stays cheap
            // regardless of repository size.
            try {
                let snapshot = {};
                try {
                    snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
                } catch (error) {
                    // no snapshot yet - everything counts as changed
                }

                const dirty = await this._readDirtySet(repository_path);
                if (snapshot[file_relative_path] === file_contents) {
                    delete dirty[file_relative_path];
                } else {
                    dirty[file_relative_path] = "changed";
                }
                await this._writeDirtySet(repository_path, dirty);
            } catch (error) {
                console.error("Failed to update dirty-file tracking after save:", error);
            }

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
        let file_contents = "";

        await git.walk({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path),
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

    async read_directory_files(repository_path, directory_path) {
        const fileContents = {};

        await git.walk({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path),
            trees: [git.WORKDIR()],
            map: async (entry_path, [entry]) => {
                // Check if entry is in the target directory
                if (!entry_path.startsWith(directory_path)) {
                    return;
                }

                const entry_type = await entry.type();

                // Only read files (blobs) in the top level of the directory
                if (entry_type === "blob" && !entry_path.startsWith(".")) {
                    const relative_file_path = entry_path.substring(directory_path.length + 1);

                    // Only include files directly in the directory (no subdirectories)
                    if (!relative_file_path.includes("/")) {
                        let content = await entry.content();
                        if (content) {
                            content = new TextDecoder().decode(content);
                        }
                        fileContents[relative_file_path] = content;
                    }
                }
            },
        });

        return fileContents;
    }

    // Reads .dirty.json: { "<path>": "changed" | "deleted", ... } - the set
    // of paths known to differ from .snapshot.json (the last-synced state),
    // maintained incrementally by save_and_stage_file()/add_file()/
    // rename_entry()/unstageFile()/commit_and_push_file()/pull() below,
    // instead of being recomputed by scanning the whole repository every
    // time list_staged_files() is called (see there for why that mattered).
    async _readDirtySet(repository_path) {
        try {
            return JSON.parse(await this.pfs.readFile(`${repository_path}/.dirty.json`, "utf8"));
        } catch (error) {
            return {};
        }
    }

    async _writeDirtySet(repository_path, dirty) {
        await this.pfs.writeFile(`${repository_path}/.dirty.json`, JSON.stringify(dirty), "utf8");
    }

    async list_staged_files(repository_path) {
        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION (Git TREE() vs STAGE())
        // let changed_files = await git.walk({
        //     fs: this.fs,
        //     dir: repository_path,
        //     trees: [git.TREE(), git.STAGE()],
        //     map: async (entry_path, [tree_entry, stage_entry]) => {
        //         if (tree_entry === null) {
        //             //console.log(`${JSON.stringify(tree_entry)} ${JSON.stringify(stage_entry)}`);
        //             let status = await git.status({ fs: this.fs, dir: repository_path, filepath: entry_path });
        //             console.log(status);
        //             return entry_path;
        //         }
        //         let entry_type = await tree_entry.type();
        //
        //         // TODO: consider the case of deleted files
        //         if (stage_entry === null && entry_path.endsWith(".ttl")) {
        //             return `${entry_path}-deleted`;
        //         }
        //         // END TODO:
        //
        //         if (entry_type === "blob" && !entry_path.startsWith(".")) {
        //             let workdir_oid = await tree_entry.oid();
        //             let stage_oid = await stage_entry.oid();
        //             if (workdir_oid !== stage_oid) {
        //                 // TODO: add Git status for each entry
        //                 return entry_path;
        //             }
        //         }
        //     },
        // });
        // return changed_files;
        // ---------------------------------------------------------------------

        // ---------------------------------------------------------------------
        // PREVIOUS IMPLEMENTATION (.snapshot.json vs a full working-directory
        // scan) - correct, but O(total .ttl files in the repo) on every call,
        // since it re-reads and re-compares every single file's full content
        // regardless of whether it changed. Fine for small repos, noticeably
        // slow for large ones - replaced below by reading an incrementally
        // maintained .dirty.json instead, which costs O(files actually
        // changed) instead of O(files in the repo).
        // let snapshot = {};
        // try {
        //     snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
        // } catch (error) {
        //     // no snapshot yet (e.g. very first load) - treat every file as new
        // }
        //
        // let changed_files = [];
        // let seen_paths = new Set();
        //
        // await git.walk({
        //     fs: this.fs,
        //     dir: repository_path,
        //     trees: [git.WORKDIR()],
        //     map: async (entry_path, [entry]) => {
        //         if (!entry_path.endsWith(".ttl")) {
        //             return;
        //         }
        //         let entry_type = await entry?.type();
        //         if (entry_type !== "blob") {
        //             return;
        //         }
        //
        //         seen_paths.add(entry_path);
        //
        //         let content = await entry.content();
        //         if (content) {
        //             content = new TextDecoder().decode(content);
        //         }
        //
        //         if (!(entry_path in snapshot) || snapshot[entry_path] !== content) {
        //             changed_files.push(entry_path);
        //         }
        //     },
        // });
        //
        // // files that were in the snapshot but no longer exist on disk = deleted
        // for (const snapshot_path of Object.keys(snapshot)) {
        //     if (!seen_paths.has(snapshot_path)) {
        //         changed_files.push(`${snapshot_path}-deleted`);
        //     }
        // }
        //
        // return changed_files;
        // ---------------------------------------------------------------------

        let start = performance.now();

        const dirty = await this._readDirtySet(repository_path);
        const changed_files = Object.entries(dirty).map(([path, status]) =>
            status === "deleted" ? `${path}-deleted` : path
        );

        let end = performance.now();
        console.log("elapsed time for listing the staged files = " + (end - start) + "ms");

        return changed_files;
    }

    async commit_and_push_file(repository_path, staged_file_paths, selected_staged_file_paths, message) {
        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION
        // // get some metadata
        // let current_branch = await git.currentBranch({
        //     fs: this.fs,
        //     dir: repository_path,
        //     fullname: false
        // });
        // let personal_access_token = await git.getConfigAll({
        //     fs: this.fs,
        //     dir: repository_path,
        //     path: "user.pat"
        // });
        // let username = await git.getConfigAll({
        //     fs: this.fs,
        //     dir: repository_path,
        //     path: "user.name"
        // });
        //
        // if(!message || message.trim().length === 0){
        //     message= `${(new Date()).toISOString()}, ${username}`
        // }
        // // in case when not all files were selected,
        // // unstage the files that were not selected
        // if (selected_staged_file_paths.length > 0) {
        //     let to_unstage_file_paths = staged_file_paths.filter(path => !selected_staged_file_paths.includes(path));
        //     for (const to_unstage_file_path of to_unstage_file_paths) {
        //         await git.resetIndex({
        //             fs: this.fs,
        //             dir: repository_path,
        //             filepath: to_unstage_file_path
        //         });
        //     }
        // }
        //
        // // commit the staged files
        // let sha = await git.commit({
        //     fs: this.fs,
        //     dir: repository_path,
        //     author: {
        //         name: username,
        //         email: username,
        //     },
        //     message: message
        // });
        //
        // let push_result = {};
        // try {
        //     // push all the committed files
        //     push_result = await git.push({
        //         fs: this.fs,
        //         http: this._http,
        //         dir: repository_path,
        //         remote: FILESYSTEM_MANAGER_CONSTANTS.REMOTE_NAME,
        //         ref: current_branch,
        //         force: false,
        //         onAuth: () => ({
        //             username: username,
        //             password: personal_access_token,
        //         }),
        //     });
        // } catch (error) {
        //     //console.error(error);
        //     throw error;
        // }
        //
        // // in case when not all files were selected,
        // // stage back the files that were not selected
        // if (selected_staged_file_paths.length > 0) {
        //     let to_stage_back_file_paths = staged_file_paths.filter(path => !selected_staged_file_paths.includes(path));
        //     for (const to_stage_back_file_path of to_stage_back_file_paths) {
        //         await git.add({
        //             fs: this.fs,
        //             dir: repository_path,
        //             filepath: to_stage_back_file_path
        //         });
        //     }
        // }
        //
        // return push_result.ok;
        // ---------------------------------------------------------------------

        // Replaces git.commit()/git.push(): pushes changed files via the
        // GitHub/GitLab API instead of the Git network protocol - this
        // eliminates the CORS proxy entirely, same idea as add_repository()/
        // pull() above. Reuses pushViaApi() from api-provider.js, which was
        // already written for this but unused until now.
        //
        // Deliberately minimal for now: conflict detection is untouched (see
        // canPullSafely()), and deletions aren't supported yet by
        // provider.pushFiles() (see api-provider.js) - "-deleted" entries are
        // skipped below instead of failing the whole push. Both are planned
        // as separate follow-ups.
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        let personal_access_token = await git.getConfigAll({
            fs,
            dir,
            path: "user.pat"
        });
        let username = await git.getConfigAll({
            fs,
            dir,
            path: "user.name"
        });
        let remote_origin_url = await git.getConfig({
            fs,
            dir,
            path: "remote.origin.url"
        });
        let repository_branch = await git.getConfig({
            fs,
            dir,
            path: "branch.name"
        });

        if (!message || message.trim().length === 0) {
            message = `${(new Date()).toISOString()}, ${username}`;
        }

        // Only push what was actually selected - or, if nothing was
        // explicitly selected, everything that's currently staged (mirrors
        // the OLD IMPLEMENTATION's unstage/restage dance above, just without
        // needing to touch the Git index for it).
        let paths_to_push = selected_staged_file_paths.length > 0
            ? selected_staged_file_paths
            : staged_file_paths;

        // "-deleted" entries carry the suffix themselves (see
        // list_staged_files() above) - strip it to get the real path.
        let deleted_paths = paths_to_push
            .filter(path => path.endsWith("-deleted"))
            .map(path => path.replace(/-deleted$/, ""));

        // filesystem-manager/index.js also mixes bare directory names into
        // paths_to_push (so a folder's checkbox stays in sync when a file
        // inside it is selected) - those aren't files and have no content
        // to read, so they'd otherwise reach the API push with an empty
        // body. Only keep entries that actually look like a staged file
        // (matches the same file/directory check filesystem-manager/index.js
        // itself uses to sort _staged_files vs. _staged_directories).
        let directory_paths = paths_to_push.filter(path =>
            !path.endsWith("-deleted") && !(path.includes("/") && path.endsWith(".ttl"))
        );
        let changed_paths = paths_to_push.filter(path =>
            !path.endsWith("-deleted") && path.includes("/") && path.endsWith(".ttl")
        );

        if (directory_paths.length > 0) {
            console.warn("Skipping non-file entries (directories) from push:", directory_paths);
        }

        console.log("commit_and_push_file(): staged_file_paths =", staged_file_paths,
            "| selected_staged_file_paths =", selected_staged_file_paths,
            "| resulting changed_paths =", changed_paths,
            "| resulting deleted_paths =", deleted_paths);

        if (changed_paths.length === 0 && deleted_paths.length === 0) {
            // Nothing left to push after filtering - this is what makes
            // pushViaApi() return null further down, which surfaces to the
            // user as the generic "An error occured while sharing..." toast
            // with no console error at all otherwise. Logging this
            // explicitly here, together with the raw inputs above, so this
            // case is diagnosable instead of silent.
            console.warn("commit_and_push_file(): nothing to push after filtering - check the logged paths above for why.");
        }

        const provider = createProvider(remote_origin_url, personal_access_token, {
            onLog: (log_line) => console.log(log_line),
            onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
        });

        // Read the snapshot BEFORE pushing, so we can tell which of the
        // changed paths are genuinely new (not in the snapshot yet) vs.
        // edits to an already-existing file. GitLab's commit API needs to
        // know this (action "create" vs "update" - see pushFiles() in
        // api-provider.js); GitHub's doesn't care either way.
        const snapshot_path = `${repository_path}/.snapshot.json`;
        let snapshot = {};
        try {
            snapshot = JSON.parse(await this.pfs.readFile(snapshot_path, "utf8"));
        } catch (error) {
            // no snapshot yet - every path counts as new
        }
        let new_paths = new Set(changed_paths.filter(path => !(path in snapshot)));

        let commit;
        try {
            commit = await pushViaApi({
                provider,
                branch: repository_branch,
                changedPaths: new Set(changed_paths),
                deletedPaths: new Set(deleted_paths),
                newPaths: new_paths,
                fs,
                dir,
                message,
            });
        } catch (error) {
            throw error;
        }

        // Keep the snapshot baseline in sync with what was just pushed, so
        // future change-detection compares against the new, now-remote state.
        try {
            for (const path of changed_paths) {
                snapshot[path] = await this.pfs.readFile(`${repository_path}/${path}`, "utf8");
            }
            for (const path of deleted_paths) {
                delete snapshot[path];
            }
            await this.pfs.writeFile(snapshot_path, JSON.stringify(snapshot), "utf8");
        } catch (error) {
            console.error("Failed to update snapshot after push:", error);
        }

        // Keep .dirty.json in sync (see list_staged_files()): whatever was
        // just pushed is no longer "changed" relative to the new snapshot.
        try {
            const dirty = await this._readDirtySet(repository_path);
            for (const path of [...changed_paths, ...deleted_paths]) {
                delete dirty[path];
            }
            await this._writeDirtySet(repository_path, dirty);
        } catch (error) {
            console.error("Failed to update dirty-file tracking after push:", error);
        }

        return commit !== null;
    }

    async canPullSafely(repository_path, changed_files) {
        // API-cloned repos (see add_repository() above) never get a real
        // local commit, so there's no HEAD for the Git-based logic below to
        // compare against - it would just fail with "Could not find
        // refs/heads/...". Detect that up front and skip straight to "no
        // known conflicts" instead of hitting the network only to fail.
        // Real conflict detection for these repos is a planned follow-up
        // (see pull()/commit_and_push_file() above) - this only avoids the
        // pointless failed attempt in the meantime.
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        const has_commit = await git.resolveRef({ fs, dir, ref: "HEAD" })
            .then(() => true, () => false);
        if (!has_commit) {
            // Same "nothing to report" sentinel the untouched logic below
            // already returns for "no remote changes" (see further down) -
            // canMerge[0]/canMerge[1] both come out undefined either way,
            // which is exactly what let the push through untouched before
            // this fix (canPullSafely() used to throw and get caught,
            // returning plain `false`, with the same [0]/[1] result).
            return [];
        }

        let current_branch = await git.currentBranch({
            fs,
            dir,
            fullname: false
        });
        let { username, token: personal_access_token } = await this._get_credentials_for_repository(fs, dir);

        try {
            await git.fetch({
            fs,
            http: this._http,
            dir,
            url: await this._get_push_pull_url(fs, dir),
            corsProxy: this._corsProxy,
            onAuth: () => (username && personal_access_token
                ? { username, password: personal_access_token }
                : {})
            });

            const localLog = await git.log({
                fs,
                dir,
                ref: 'HEAD',
                depth: 100
            });

            const remoteLog = await git.log({
                fs,
                dir,
                ref: `origin/${current_branch}`,
                depth: 100
            });

            const remoteOids = new Set(remoteLog.map(c => c.oid));

            const baseCommit = localLog.find(c => remoteOids.has(c.oid));

            if (!baseCommit) {
                throw new Error('No common ancestor found');
            }

            const base = baseCommit.oid;

            if (localLog === remoteLog) {
                console.log("No remote changes");
                return [];
            }

            const remoteChanges = [];

            await git.walk({
            fs,
            dir,
            trees: [
                git.TREE({ ref: base }),
                git.TREE({ ref: `origin/${current_branch}` })
            ],
            map: async (filepath, [A, B]) => {
                const oidA = await A?.oid();
                const oidB = await B?.oid();

                if (oidA !== oidB) {
                remoteChanges.push(filepath);
                }
            }
            });

            const normalizePath = (path) => path.replace(/-deleted$/, '');

            const conflicts = changed_files.filter(f =>
            remoteChanges.includes(normalizePath(f))
            );

            console.log("Remote changes:", remoteChanges, "Changed files local: ", changed_files, "Conflicts with local changes:", conflicts);


            return [conflicts.length===0, remoteChanges.length];


        } catch (e) {
            console.error("Error in canPullSafely: ", e);
            return false;
        }
    }

    async pull(repository_path) {
        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION
        // // get some metadata
        // let personal_access_token = await git.getConfigAll({
        //     fs: this.fs,
        //     dir: repository_path,
        //     path: "user.pat"
        // });
        // let username = await git.getConfigAll({
        //     fs: this.fs,
        //     dir: repository_path,
        //     path: "user.name"
        // });
        // let current_branch = await git.currentBranch({
        //     fs: this.fs,
        //     dir: repository_path,
        //     fullname: false
        // });
        //
        // // pull the changes from the remote repository
        // try {
        //     await git.pull({
        //         fs: this.fs,
        //         http: this._http,
        //         dir: repository_path,
        //         ref: current_branch,
        //         singleBranch: true,
        //         corsProxy: this._corsProxy,
        //         onAuth: () => ({
        //             username: username,
        //             password: personal_access_token,
        //         })
        //     });
        // } catch (error) {
        //     console.error(error);
        //     throw error;
        // }
        // ---------------------------------------------------------------------

        // Replaces git.pull(): re-downloads all files via the GitHub/GitLab
        // API instead of the Git network protocol - this eliminates the CORS
        // proxy entirely, same idea as add_repository() above.
        //
        // Deliberately minimal for now: no conflict detection with local
        // unsaved changes (canPullSafely() still uses the old Git-based
        // approach, untouched here) - that's a planned separate follow-up.
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        let personal_access_token = await git.getConfigAll({
            fs,
            dir,
            path: "user.pat"
        });
        let remote_origin_url = await git.getConfig({
            fs,
            dir,
            path: "remote.origin.url"
        });
        let repository_branch = await git.getConfig({
            fs,
            dir,
            path: "branch.name"
        });

        let start = performance.now();
        try {
            const provider = createProvider(remote_origin_url, personal_access_token, {
                onLog: (log_line) => console.log(log_line),
                onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
            });

            // Read the OLD snapshot BEFORE overwriting it, so we know which
            // paths existed as of the last sync - anything that was in there
            // but is missing from the freshly-fetched file list was deleted
            // on the remote since then, and should be removed locally too.
            // Paths that are NOT in the old snapshot (e.g. a new local file
            // nobody has pushed yet) are left alone either way, since this
            // loop only ever looks at old_snapshot's keys.
            let old_snapshot = {};
            try {
                old_snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot yet - nothing to compare against, so nothing to delete
            }

            const files = await provider.fetchAllFiles(repository_branch);
            const snapshot = {};
            const seen_paths = new Set();

            for (const file of files) {
                const full_path = `${repository_path}/${file.path}`;
                const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                if (parent_folder_path !== repository_path) {
                    // see add_repository() above for why ensureDir() is needed
                    await ensureDir(this.fs, parent_folder_path);
                }

                await this.pfs.writeFile(full_path, file.content, "utf8");
                snapshot[file.path] = file.content;
                seen_paths.add(file.path);
            }

            for (const old_path of Object.keys(old_snapshot)) {
                if (!seen_paths.has(old_path)) {
                    try {
                        await this.pfs.unlink(`${repository_path}/${old_path}`);
                    } catch (error) {
                        // already gone locally too - nothing to do
                    }
                }
            }

            await this.pfs.writeFile(
                `${repository_path}/.snapshot.json`,
                JSON.stringify(snapshot),
                "utf8"
            );

            // pull() unconditionally overwrites local content with the
            // remote's (no conflict detection - see canPullSafely()), so
            // after this every file matches the new snapshot by definition.
            // Keep .dirty.json in sync (see list_staged_files()) by clearing
            // it entirely, rather than leaving stale "changed" entries for
            // files that were just overwritten.
            try {
                await this._writeDirtySet(repository_path, {});
            } catch (error) {
                console.error("Failed to clear dirty-file tracking after pull:", error);
            }
        } catch (error) {
            console.error(error);
            throw error;
        }
        let end = performance.now();
        console.log("elapsed time for pull() via API = " + (end - start) + "ms");
    }

    async has_remote(repository_path) {
        const remotes = await git.listRemotes({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path)
        });

        return remotes.length > 0;
    }

    async unstageFile(repository_path, file_relative_path) {
        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION
        // let current_branch = await git.currentBranch({
        //     fs: this.fs,
        //     dir: repository_path,
        //     fullname: false
        // });
        //
        // try {
        //     // Reset the index entry for this file
        //     await git.resetIndex({
        //         fs: this.fs,
        //         dir: repository_path,
        //         filepath: file_relative_path
        //     });
        //
        //     // Restore the file from current branch
        //     await git.checkout({
        //         fs: this.fs,
        //         dir: repository_path,
        //         ref: current_branch,
        //         force: true,
        //         filepaths: [file_relative_path]
        //     });
        //
        //     return true;
        // } catch (error) {
        //     console.error('Error unstaging file:', error);
        //     throw new Error(`Failed to unstage file: ${error.message}`);
        // }
        // ---------------------------------------------------------------------

        // Replaces git.resetIndex()+git.checkout(): restores the file from
        // .snapshot.json instead of the last Git commit - API-cloned repos
        // never get a real commit (see add_repository() above), so
        // git.checkout() would just fail with "Could not find
        // refs/heads/...". .snapshot.json holds exactly the last-known-
        // synced content - i.e. how the file looked before the local,
        // unpushed edit that's being undone here.

        // filesystem-manager/index.js also calls this with a bare directory
        // name, to clean up an empty folder after unstaging its last file
        // (see the "unstage-files" button handler there) - that's not a
        // tracked file and has no snapshot entry, so just no-op instead of
        // trying to "restore" a folder.
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        let plain_path = file_relative_path.replace(/-deleted$/, "");
        if (!plain_path.includes("/") || !plain_path.endsWith(".ttl")) {
            return true;
        }

        try {
            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot at all - nothing to restore from
            }

            if (plain_path in snapshot) {
                // known from a previous sync (edited OR locally deleted) -
                // restore its last-synced content. This also recreates a
                // locally-deleted file, which is exactly "undo the delete".
                const full_path = `${repository_path}/${plain_path}`;
                const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                if (parent_folder_path !== repository_path) {
                    await ensureDir(this.fs, parent_folder_path);
                }

                await this.pfs.writeFile(full_path, snapshot[plain_path], "utf8");
            } else if (!file_relative_path.endsWith("-deleted")) {
                // never synced before (a brand new, unpushed file) - there's
                // nothing to restore to, so undo the creation entirely.
                try {
                    await this.pfs.unlink(`${repository_path}/${plain_path}`);
                } catch (error) {
                    // already gone - nothing to do
                }
            }

            // Keep .dirty.json in sync (see list_staged_files()) - whatever
            // just got undone is no longer "changed".
            try {
                const dirty = await this._readDirtySet(repository_path);
                delete dirty[plain_path];
                await this._writeDirtySet(repository_path, dirty);
            } catch (error) {
                console.error("Failed to update dirty-file tracking after unstage:", error);
            }

            return true;
        } catch (error) {
            console.error('Error unstaging file:', error);
            throw new Error(`Failed to unstage file: ${error.message}`);
        }
    }

    async _list_refs(repository_metadata, refs_type) {
        let refs = await git.listServerRefs({
            http: this._http,
            corsProxy: this._corsProxy,
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

    async generate_indexes_for_all_files(repository_path, pushed_file_paths) {
        try {
            // Group pushed files by their folder
            const folderMap = new Map();
            
            pushed_file_paths.forEach(filePath => {
                // Extract folder name (e.g., "persons" from "persons/123456.ttl")
                const folderName = filePath.split('/')[0];
                
                if (!folderMap.has(folderName)) {
                    folderMap.set(folderName, []);
                }
                folderMap.get(folderName).push(filePath);
            });

            const generatedIndexes = {};

            // For each folder, execute the corresponding SPARQL query
            for (const [folderName, files] of folderMap.entries()) {
                try {
                    
                    // Read all TTL files from the folder
                    const folderContent = await this.read_directory_files(repository_path, folderName);
                    
                    // Combine all RDF content
                    let combinedRdf = '';
                    for (const [filename, content] of Object.entries(folderContent)) {
                        if (filename.endsWith('.ttl')) {
                            combinedRdf += content + '\n';
                        }
                    }

                    // Load the SPARQL query
                    const sparqlQuery = await this._loadSparqlQuery(repository_path, `modules/datasets-generator/${folderName}`);
                    
                    if (!sparqlQuery) {
                        //console.warn(`No SPARQL query found for folder: ${folderName}`);
                        continue;
                    }

                    if (!combinedRdf || combinedRdf.trim() === '') {
                        //console.warn(`Combined RDF content is empty for folder: ${folderName}`);
                        continue;
                    }

                    // Execute SPARQL query
                    let indexContent = await this._executeSparqlQuery(combinedRdf, sparqlQuery);

                    // Save the index file
                    if (!indexContent || indexContent.trim() === '' || indexContent.length === 0) {
                        //console.warn(`Generated index content is empty for folder: ${folderName}`);
                        continue;
                    } else {
                        const indexPath = `indexes/${folderName}.ttl`;
                        await this.save_and_stage_file(repository_path, indexContent, indexPath);

                        generatedIndexes[folderName] = {
                            path: indexPath,
                            filesProcessed: Object.keys(folderContent).length,
                            success: true
                        };

                        console.log(`Index generated successfully for ${folderName}`);
                    }
                    

                } catch (error) {
                    console.error(`Failed to generate index for folder ${folderName}:`, error);
                    generatedIndexes[folderName] = {
                        success: false,
                        error: error.message
                    };
                }
            }

            return generatedIndexes;

        } catch (error) {
            console.error('Error in generate_indexes_for_pushed_files:', error);
            throw error;
        }
    }

    async generate_indexes_for_saved_file(repository_path, saved_file_path, is_deleted=false) {
        try {
            
            const folderName = saved_file_path.split('/')[0];

            const generatedIndexes = {};

            // For each folder, execute the corresponding SPARQL query
            try {
                
                // Read all TTL files from the folder
                const rdf = await this.read_file(repository_path, saved_file_path);

                if (!rdf || rdf.trim() === '') {
                    console.warn(`RDF content is empty for file: ${saved_file_path}`);
                    return;
                }

                // Load the SPARQL query
                const sparqlQuery = await this._loadSparqlQuery(repository_path, `modules/datasets-generator/${folderName}`);
                
                if (!sparqlQuery) {
                    //console.warn(`No SPARQL query found for folder: ${folderName}`);
                    return;
                }

                // Execute SPARQL query
                let indexContent = await this._executeSparqlQuery(rdf, sparqlQuery);

                // Save the index file
                if (!indexContent || indexContent.trim() === '') {
                    //console.warn(`Generated index content is empty for folder: ${folderName}`);
                    return;
                }

                let indexFile = await this.read_file(repository_path, `indexes/${folderName}.ttl`);

                if (indexContent !== '' && indexFile !== '') {

                    if (is_deleted===true) {
                        indexContent = await this._executeSparqlUpdate(indexFile, indexContent, is_deleted=true);
                    } else {
                        indexContent = await this._executeSparqlUpdate(indexFile, indexContent, is_deleted=false);
                    }
                    const indexPath = `indexes/${folderName}.ttl`;
                    await this.save_and_stage_file(repository_path, indexContent, indexPath);

                    generatedIndexes[folderName] = {
                        path: indexPath,
                        filesProcessed: saved_file_path,
                        success: true
                    };

                    console.log(`Index updated successfully for ${folderName}`);
                } else {
                    console.warn(`No existing index file found for folder: ${folderName}.`);
                }
                

            } catch (error) {
                console.error(`Failed to generate index for folder ${folderName}:`, error);
                generatedIndexes[folderName] = {
                    success: false,
                    error: error.message
                };
            }

            return generatedIndexes;

        } catch (error) {
            console.error('Error in generate_indexes_for_saved_file:', error);
            throw error;
        }
    }

    async _loadSparqlQuery(repository_path, folderName) {
        try {
            // Load SPARQL query from the virtual filesystem
            // Path: {folderName}.sparql
            const sparqlQueryPath = `${folderName}.sparql`;
            
            const sparqlContent = await this.read_file(repository_path, sparqlQueryPath);
            
            if (!sparqlContent || sparqlContent.trim() === '') {
                //console.warn(`SPARQL query file is empty for folder: ${folderName}`);
                return null;
            }

            return sparqlContent;
        } catch (error) {
            console.error(`Failed to load SPARQL query for ${folderName}:`, error);
            return null;
        }
    }

    async _executeSparqlQuery(rdfContent, sparqlQuery) {
        try {

            this.store = new oxigraph.Store();

            await this.store.load(rdfContent, { format: 'text/turtle' });

            let result = await this.store.query(sparqlQuery, { type: 'construct', format: 'text/turtle' });

            if (result === null) {
                console.warn("SPARQL query returned null result");
                return '';
            }
            result = this._triplesToTurtle(result.toString({ format: 'text/turtle' }));

            return result || '';

        } catch (error) {
            console.error('Error executing SPARQL query with Oxygraph:', error);
            return '';
        }
    }

    async _executeSparqlUpdate(existingIndexContent, updateContent, is_deleted=false) {
        try {

            this.entity_store = new oxigraph.Store();
            this.index_store = new oxigraph.Store();

            await this.entity_store.load(updateContent, { format: 'text/turtle' });
            await this.index_store.load(existingIndexContent, { format: 'text/turtle' });

            let deleteIris = new Set();
            for (let binding of this.entity_store.query("SELECT DISTINCT ?s ?p ?o WHERE { ?s ?p ?o }")) {
                deleteIris.add(binding.get("s").value);
            }

            const deleteWhereClauses = Array.from(deleteIris).map(iri => `DELETE WHERE { <${iri}> ?p ?o }`).join('\n');
            
            const updateQuery = `${deleteWhereClauses}`

            await this.index_store.update(updateQuery);

            let result = this.index_store.query("CONSTRUCT { ?s ?p ?o . } WHERE { ?s ?p ?o . }", { format: 'text/turtle' });
            result = this._triplesToTurtle(result.toString({ format: 'text/turtle' }));

            if (is_deleted===false) {
                result = updateContent + '\n' + result;
            }

            return result || existingIndexContent;


        } catch (error) {
            console.error('Error executing SPARQL update with Oxygraph:', error);
            return existingIndexContent; 
        }
    }

    _triplesToTurtle(triples) {
        let turtle = triples
            .replace(/>,/g, '> .\n')
            .replace(/<http/g, '<http')
            .replace(/,<urn/g, '.\n<urn')
            .replace(/,<http/g, '.\n<http')
            .trim();

        if (turtle.length > 0 && !turtle.endsWith('.')) {
            turtle = turtle + `.`;
        }

        return turtle;
    }
}