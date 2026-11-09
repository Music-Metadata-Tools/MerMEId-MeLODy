import * as FILESYSTEM_MANAGER_CONSTANTS from "../constants.js";
import git from "#isomorphic-git";
import http from "#isomorphic-git-http";
import init_oxigraph, * as oxigraph from "#oxigraph";
import { createProvider, ensureDir, pushViaApi, mapWithConcurrency } from "../api-provider.js";
import FSADirectoryFilesystem from "./fsa-directory-filesystem.js";
import OPFSDirectoryFilesystem from "./opfs-directory-filesystem.js";
import LocalRepositoryStore from "./local-repository-store.js";

const CONFIG_PATH = "configuration/config.json";
// Pushing config.json to this branch starts the data repo pipeline that changes the project domain on main.
const PROJECT_DOMAIN_BRANCH = "melody/project-domain";
const PIPELINE_POLL_MS = 10 * 1000;
const PIPELINE_TIMEOUT_MS = 30 * 60 * 1000;
await init_oxigraph();

export default class ADWLMVirtualFilesystem {
    // CORS PROXY REMNANT (pending deletion)
    // constructor(fs = null, { httpPlugin = null, corsProxy = FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY } = {}) {
    constructor(fs = null, { httpPlugin = null } = {}) {
        this._filesystem_name = "mermeid";
        this.fs = fs ?? new OPFSDirectoryFilesystem();
        this.pfs = this.fs.promises;
        this._http = httpPlugin ?? http;
        // CORS PROXY REMNANT (pending deletion)
        // this._corsProxy = corsProxy;
        this._localRepositories = new Map();
        // All added local repos, including those whose permission is not (yet) re-granted.
        this._localRepositoryHandles = new Map();
        this._localRepositoryStore = new LocalRepositoryStore();
        // Restores permissions that survived a reload; the rest is re-requested
        // via ensure_local_repository_access().
        this._localRepositoriesReady = this._restore_local_repositories();
        this.store = null;
        this.index_store = null;
        this.entity_store = null;

        // In-memory cache of .remote-tree.json: repository_path -> { tree, childrenIndex }.
        // Kept in sync by _writeRemoteTree(), the only writer.
        this._remoteTreeCache = new Map();
    }

    // .dirty.json/.snapshot.json always live on the shared this.pfs (keyed by
    // repository name), also for local repos, so this directory must exist there.
    // Idempotent.
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

    // Re-grants access to a stored local repository. Must be called from a user
    // gesture (requestPermission() requires it). Returns true for non-local repositories.
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
        
        // Credentials are stored in .git/config, as in add_repository().
        if (username || token) {
            await git.setConfig({ fs, dir: "/", path: "user.pat", value: token });
            await git.setConfig({ fs, dir: "/", path: "user.name", value: username });
        }

        // OLD IMPLEMENTATION
        // let branch_name = await git.getConfig({
        //         fs,
        //         dir: "/",
        //         path: "branch.name"
        //     });

        // "branch.name" is only set by add_repository(), so use the checked-out branch.
        let branch_name = await git.currentBranch({ fs, dir: "/", fullname: false });

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

    // Converts SSH remote URLs (git@host:path, ssh://...) to HTTPS for requests.
    // The remote stored in .git/config stays unchanged.
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

    // Uses git.getConfig(), not getConfigAll(): the latter returns [] when unset,
    // which is truthy and would be sent as empty credentials.
    async _get_credentials_for_repository(fs, dir) {
        const token = await git.getConfig({ fs, dir, path: "user.pat" });
        const username = await git.getConfig({ fs, dir, path: "user.name" });

        if (!token || !username) {
            console.warn(`No stored credentials found for repository at '${dir}' - requests will be sent without authentication.`);
        }

        return { username, token };
    }

    // get credentials for repository settings
    async get_credentials(repository_path) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        return this._get_credentials_for_repository(fs, dir);
    }

    async update_credentials(repository_path, { username, token } = {}) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        await git.setConfig({ fs, dir, path: "user.pat", value: token });
        await git.setConfig({ fs, dir, path: "user.name", value: username });
    }

    // CORS PROXY REMNANT (pending deletion)
    // async is_public_repository(repository_metadata) {
    //     let is_public = true;
    //     let repository_url = repository_metadata.url;
    //
    //     try {
    //         await git.getRemoteInfo2({
    //             http: this._http,
    //             corsProxy: this._corsProxy,
    //             url: repository_url
    //         });
    //
    //         return is_public;
    //     } catch (error) {
    //         let status_code = error.data.statusCode;
    //
    //         if (status_code === 401) {
    //             is_public = false;
    //
    //             return is_public;
    //         } else {
    //             alert(`HTTP error: ${status_code}.`);
    //
    //             return is_public;
    //         }
    //     }
    // }

    async add_repository(repository_metadata, { onProgress } = {}) {
        let repository_folder_name = repository_metadata.folder;
        let personal_acces_token = repository_metadata.token;
        let username = repository_metadata.username;
        let remote_origin_url = repository_metadata.url;
        let repository_branch = repository_metadata.branch;
        // Lazy loading (default): only the file tree is fetched now, file contents
        // on first read. Persisted as "lazy.enabled" for pull().
        let use_lazy_loading = repository_metadata.use_lazy_loading !== false;

        try {
            await this.pfs.mkdir(repository_folder_name);
        } catch (error) {
            console.error(error);
        }

        let start = performance.now();

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

        try {
            const provider = createProvider(remote_origin_url, personal_acces_token, {
                onLog: (message) => console.log(message),
                onProgress: (current, total, label) => {
                    console.log(`${label}: ${current}/${total}`);
                    onProgress?.(current, total, label);
                },
            });

            if (use_lazy_loading) {
                // Only the file tree; contents are downloaded on first read
                // (see _ensureFilesDownloaded()).
                const tree = await provider.fetchFileTree(repository_branch);
                await this._writeRemoteTree(repository_folder_name, new Map(tree.map(entry => [entry.path, entry.sha])));
            } else {
                // Full download. No .remote-tree.json is written, which turns all
                // lazy-loading code paths into no-ops for this repo.
                const files = await provider.fetchAllFiles(repository_branch);
                await mapWithConcurrency([...files], 5, async (file) => {
                    const full_path = `${repository_folder_name}/${file.path}`;
                    const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));
                    if (parent_folder_path !== repository_folder_name) {
                        await ensureDir(this.fs, parent_folder_path);
                    }
                    await this.pfs.writeFile(full_path, file.content, "utf8");
                });
            }

            // Empty local Git repo without commits; needed for git.walk(WORKDIR()) and git config.
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

        // store the branch name for pull()/push
        await git.setConfig({
            fs: this.fs,
            dir: repository_folder_name,
            path: "branch.name",
            value: repository_branch
        });

        // store the loading mode for pull()
        await git.setConfig({
            fs: this.fs,
            dir: repository_folder_name,
            path: "lazy.enabled",
            value: use_lazy_loading ? "true" : "false"
        });
    }

    async remove_repository(repository_folder_name) {
        try {
            await git.deleteRemote({ fs: this.fs, dir: repository_folder_name, remote: "upstream" });
        } catch (error) {
            console.error(error);
        }

        // OLD IMPLEMENTATION
        // await this._clear_directory(repository_folder_name);

        // rmdir() deletes recursively.
        await this.pfs.rmdir(repository_folder_name);
    }

    // List the branches of a repository.
    async list_branches(repository_metadata) {
        // OLD IMPLEMENTATION
        // let branch_metadata = await this._list_refs(repository_metadata, "heads");
        // let branches = branch_metadata.map(metadatum => {
        //     let ref = metadatum.ref;
        //     return ref.substring("refs/heads/".length);
        // });
        // return branches;

        // No local repo exists yet, so url/token come from the dialog.
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

        // NOT ACTIVE: .dirty.json update for renames. rename_entry() is currently
        // unused; its call site passes a hardcoded old_entry_relative_path.
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
            // caps git.walk()'s concurrency - see read_directory_files() below
            iterate: (walk, children) => mapWithConcurrency([...children], 5, walk),
            map: async (entry_path, [entry]) => {
                if (!entry_path.startsWith(parent_folder_relative_path)) {
                    return;
                }
                // skip ".crswap" temp files (File System Access API's
                // in-progress write swap files) - reading one throws ENOENT
                if (entry_path.endsWith(".crswap")) {
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

        // OLD IMPLEMENTATION
        // const remote_tree = await this._readRemoteTree(repository_path);
        // if (remote_tree) {
        //     const seen_folders = new Set(folders);
        //     const seen_files = new Set(files);
        //     for (const remote_path of remote_tree.keys()) {
        //         if (!remote_path.startsWith(parent_folder_relative_path) || remote_path.startsWith(".")) {
        //             continue;
        //         }
        //         const rest = remote_path.slice(parent_folder_relative_path.length);
        //         const slash_index = rest.indexOf("/");
        //         if (slash_index === -1) {
        //             if (rest && !seen_files.has(remote_path)) {
        //                 files.push(remote_path);
        //                 seen_files.add(remote_path);
        //             }
        //         } else {
        //             const folder_path = parent_folder_relative_path + rest.slice(0, slash_index);
        //             if (!seen_folders.has(folder_path)) {
        //                 folders.push(folder_path);
        //                 seen_folders.add(folder_path);
        //             }
        //         }
        //     }
        // }

        // Lazy repos: add this folder's remote entries that are not downloaded yet.
        const remote_children = await this._getRemoteTreeChildren(repository_path, parent_folder_relative_path);
        if (remote_children) {
            const seen_folders = new Set(folders);
            const seen_files = new Set(files);

            for (const folder_path of remote_children.folders) {
                if (!seen_folders.has(folder_path)) {
                    folders.push(folder_path);
                    seen_folders.add(folder_path);
                }
            }
            for (const file_path of remote_children.files) {
                if (!seen_files.has(file_path)) {
                    files.push(file_path);
                    seen_files.add(file_path);
                }
            }
        }

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

        // Also called with bare directory names, which are not tracked in .dirty.json.
        const is_tracked_path = file_relative_path.includes("/") && file_relative_path.endsWith(".ttl");
        let dirty = {};

        if (is_tracked_path) {
            try {
                dirty = await this._readDirtySet(repository_path);
                // capture pre-delete baseline before the unlink below - see
                // _captureSnapshotBaselineOnFirstTouch()
                await this._captureSnapshotBaselineOnFirstTouch(repository_path, file_relative_path, dirty);
            } catch (error) {
                console.error("Failed to capture snapshot baseline before delete:", error);
            }
        }

        // remove the file from the git index
        await git.remove({ fs, dir, filepath: file_relative_path });
        await fs.promises.unlink(this._get_path_for_repository(repository_path, file_relative_path));

        if (!is_tracked_path) {
            return;
        }

        try {
            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot yet
            }

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
            // Capture pre-edit baseline before the write below - see
            // _captureSnapshotBaselineOnFirstTouch(). `dirty` is reused further down.
            const dirty = await this._readDirtySet(repository_path);
            await this._captureSnapshotBaselineOnFirstTouch(repository_path, file_relative_path, dirty);

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

            // Content equal to the snapshot baseline means the edit was reverted.
            try {
                let snapshot = {};
                try {
                    snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
                } catch (error) {
                    // no snapshot yet - everything counts as changed
                }

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

    // Reason why the project domain cannot be changed right now, or null.
    async get_project_domain_lock_reason(repository_path) {
        if (!await this.has_remote(repository_path)) {
            return "Only possible for repositories with a remote.";
        }
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        const branch = await git.getConfig({ fs, dir, path: "branch.name" });
        if (branch !== "main") {
            return `Only possible on branch main (current: ${branch}).`;
        }
        if ((await this.list_staged_files(repository_path)).length > 0) {
            return "Share your local changes first.";
        }
        return null;
    }

    // Pushes config.json to PROJECT_DOMAIN_BRANCH; the pipeline then rewrites all IRIs and pushes them to main.
    // Resolves on pipeline success. On pipeline failure or timeout the branch is deleted, main stays unchanged.
    // onStatus(status, url) reports pending | running | success | failed.
    async change_project_domain(repository_path, config_contents, domain, { onStatus = () => {} } = {}) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        const { token } = await this._get_credentials_for_repository(fs, dir);
        const provider = createProvider(await this._get_push_pull_url(fs, dir), token);

        let commit;
        try {
            commit = await provider.pushFilesToNewBranch("main", PROJECT_DOMAIN_BRANCH,
                [{ path: CONFIG_PATH, content: config_contents }], `Change project domain to ${domain}`);
        } catch (error) {
            if (error.status === 400 || error.status === 422) {
                throw new Error(`Branch ${PROJECT_DOMAIN_BRANCH} already exists: a project domain change is running or a previous one was interrupted. Wait for it or delete the branch in the remote repository. (${error.message})`);
            }
            throw error;
        }

        const deadline = Date.now() + PIPELINE_TIMEOUT_MS;
        let status = "pending";
        let url = null;
        while (true) {
            try {
                ({ status, url } = await provider.getPipelineStatus(commit.id));
                onStatus(status, url);
            } catch (error) {
                // Without read access the pipeline keeps running, so the branch is left to it.
                if ([401, 403, 404].includes(error.status)) {
                    throw new Error(`Cannot read the pipeline status (${error.status}), the access token may lack the right to read pipelines/actions. Check the pipeline in the remote repository and synchronize afterwards.`);
                }
                console.warn("Reading the pipeline status failed, retrying:", error);
            }
            if (status === "success") {
                // A pipeline without the central domain job also succeeds, but changes nothing.
                const [main_config] = await provider.fetchFilesByPath([CONFIG_PATH], "main");
                if (JSON.parse(main_config.content ?? "{}").projectDomain === JSON.parse(config_contents).projectDomain) {
                    return;
                }
                await provider.deleteBranch(PROJECT_DOMAIN_BRANCH).catch((error) => console.error(error));
                const error = new Error("The pipeline finished, but the project domain was not changed. Does this repository use the central MerMEId MeLODy pipeline?");
                error.url = url;
                throw error;
            }
            if (status === "failed" || Date.now() > deadline) {
                await provider.deleteBranch(PROJECT_DOMAIN_BRANCH).catch((error) => console.error(error));
                const error = new Error(status === "failed"
                    ? "The pipeline changing the project domain failed. Nothing was changed."
                    : "The pipeline did not finish within 30 minutes. Nothing was changed.");
                error.url = url;
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, PIPELINE_POLL_MS));
        }
    }

    // Lazy repos: downloads paths listed in .remote-tree.json that are not on
    // disk yet. No-op for repos without a manifest.
    async _ensureFilesDownloaded(repository_path, file_relative_paths) {
        const remote_tree = await this._readRemoteTree(repository_path);
        if (!remote_tree) {
            return;
        }

        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        const missing_paths = [];
        for (const path of file_relative_paths) {
            if (!remote_tree.has(path)) {
                continue; // not a known remote file either - genuinely doesn't exist
            }
            try {
                await fs.promises.stat(this._get_path_for_repository(repository_path, path));
            } catch (error) {
                missing_paths.push(path);
            }
        }

        if (missing_paths.length === 0) {
            return;
        }

        const remote_origin_url = await git.getConfig({ fs, dir, path: "remote.origin.url" });
        const repository_branch = await git.getConfig({ fs, dir, path: "branch.name" });
        const personal_access_token = await git.getConfigAll({ fs, dir, path: "user.pat" });

        const provider = createProvider(remote_origin_url, personal_access_token, {
            onLog: (log_line) => console.log(log_line),
            onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
        });

        const files = await provider.fetchFilesByPath(missing_paths, repository_branch);

        await mapWithConcurrency(files, 5, async (file) => {
            if (file.content === null) {
                return; // gone remotely too by now - nothing to write
            }
            const full_path = this._get_path_for_repository(repository_path, file.path);
            const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));
            if (parent_folder_path !== dir) {
                await ensureDir(fs, parent_folder_path);
            }
            await fs.promises.writeFile(full_path, file.content, "utf8");
        });
    }

    async _ensureFileDownloaded(repository_path, file_relative_path) {
        await this._ensureFilesDownloaded(repository_path, [file_relative_path]);
    }

    async read_file(repository_path, file_path) {
        await this._ensureFileDownloaded(repository_path, file_path);

        // OLD IMPLEMENTATION
        // let file_contents = "";
        // await git.walk({
        //     fs: this._get_fs_for_repository(repository_path),
        //     dir: this._get_dir_for_repository(repository_path),
        //     trees: [git.WORKDIR()],
        //     iterate: (walk, children) => mapWithConcurrency([...children], 5, walk),
        //     map: async (entry_path, [entry]) => {
        //         if (entry_path === file_path && !entry_path.endsWith(".crswap")) {
        //             file_contents = await entry.content();
        //         }
        //     },
        // });
        // if (file_contents) {
        //     file_contents = new TextDecoder().decode(file_contents);
        // }
        // return file_contents;

        // Returns "" for a missing file.
        const fs = this._get_fs_for_repository(repository_path);
        const full_path = this._get_path_for_repository(repository_path, file_path);

        try {
            return await fs.promises.readFile(full_path, "utf8");
        } catch (error) {
            return "";
        }
    }

    async read_directory_files(repository_path, directory_path) {
        const fileContents = {};

        // Lazy repos: download the directory's files first; the walk only sees files on disk.
        const remote_tree = await this._readRemoteTree(repository_path);
        if (remote_tree) {
            const prefix = `${directory_path}/`;
            const top_level_paths = [...remote_tree.keys()].filter(path =>
                path.startsWith(prefix) && !path.slice(prefix.length).includes("/")
            );
            await this._ensureFilesDownloaded(repository_path, top_level_paths);
        }

        await git.walk({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path),
            trees: [git.WORKDIR()],
            // Limits concurrency: under heavy File System Access API load,
            // isomorphic-git's read() returns null and entry.content() fails.
            iterate: (walk, children) => mapWithConcurrency([...children], 5, walk),
            map: async (entry_path, [entry]) => {
                // Check if entry is in the target directory
                if (!entry_path.startsWith(directory_path)) {
                    return;
                }

                // skip ".crswap" temp files - see list_entries_from_workdir() above
                if (entry_path.endsWith(".crswap")) {
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

    // .dirty.json: { "<path>": "changed" | "deleted" } - paths that differ from
    // the last synced state. Updated on save, delete, unstage, push and pull.
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

    // .remote-tree.json (lazy repos): path -> blob SHA of every remote file;
    // pull() uses the SHAs to re-fetch only changed files. Returns null if
    // there is no manifest (not a lazy repo). Cached in this._remoteTreeCache.
    async _readRemoteTree(repository_path) {
        const cached = this._remoteTreeCache.get(repository_path);
        if (cached) {
            return cached.tree;
        }

        try {
            const data = JSON.parse(await this.pfs.readFile(`${repository_path}/.remote-tree.json`, "utf8"));

            // Legacy format: array of paths without SHAs; pull() refreshes these once.
            const tree = Array.isArray(data)
                ? new Map(data.map((path) => [path, undefined]))
                : new Map(Object.entries(data));

            this._remoteTreeCache.set(repository_path, { tree, childrenIndex: null });
            return tree;
        } catch (error) {
            return null;
        }
    }

    async _writeRemoteTree(repository_path, pathToShaMap) {
        await this.pfs.writeFile(`${repository_path}/.remote-tree.json`, JSON.stringify(Object.fromEntries(pathToShaMap)), "utf8");
        // childrenIndex is rebuilt on demand by _getRemoteTreeChildren().
        this._remoteTreeCache.set(repository_path, { tree: pathToShaMap, childrenIndex: null });
    }

    // Returns { folders, files } of one folder from .remote-tree.json, or null.
    // parent_folder_relative_path: "" (root) or "a/b/" (with trailing slash).
    async _getRemoteTreeChildren(repository_path, parent_folder_relative_path) {
        const tree = await this._readRemoteTree(repository_path);
        if (!tree) {
            return null;
        }

        const cached = this._remoteTreeCache.get(repository_path);
        if (!cached.childrenIndex) {
            cached.childrenIndex = this._buildRemoteTreeChildrenIndex(tree);
        }

        return cached.childrenIndex.get(parent_folder_relative_path) ?? null;
    }

    // Builds folderKey ("" or "a/b/") -> { folders, files }. Skips paths starting with ".".
    _buildRemoteTreeChildrenIndex(tree) {
        const index = new Map();

        const ensureBucket = (folderKey) => {
            let bucket = index.get(folderKey);
            if (!bucket) {
                bucket = { folders: new Set(), files: new Set() };
                index.set(folderKey, bucket);
            }
            return bucket;
        };

        for (const path of tree.keys()) {
            if (path.startsWith(".")) {
                continue;
            }

            const segments = path.split("/");
            let folderKey = "";
            let folderPath = "";

            for (let i = 0; i < segments.length; i++) {
                const entryPath = folderPath ? `${folderPath}/${segments[i]}` : segments[i];

                if (i === segments.length - 1) {
                    ensureBucket(folderKey).files.add(entryPath);
                } else {
                    ensureBucket(folderKey).folders.add(entryPath);
                    folderPath = entryPath;
                    folderKey = `${entryPath}/`;
                }
            }
        }

        return index;
    }

    // Stores the pre-edit content in .snapshot.json on the first touch since the
    // last sync. Must run BEFORE the caller's write/unlink. A missing file gets
    // no baseline, which marks it as new.
    async _captureSnapshotBaselineOnFirstTouch(repository_path, file_relative_path, dirty) {
        if (file_relative_path in dirty) {
            return; // already touched - baseline (or its absence) was already decided
        }

        const fs = this._get_fs_for_repository(repository_path);
        const absolute_path = this._get_path_for_repository(repository_path, file_relative_path);

        try {
            const pre_edit_content = await fs.promises.readFile(absolute_path, "utf8");

            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot file yet - fine, this is its first-ever entry
            }

            snapshot[file_relative_path] = pre_edit_content;
            await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify(snapshot), "utf8");
        } catch (error) {
            // file doesn't exist on disk yet - brand new, never-synced file,
            // nothing to capture as a baseline.
        }
    }

    async list_staged_files(repository_path) {
        // OLD IMPLEMENTATION
        // let changed_files = await git.walk({
        //     fs: this.fs,
        //     dir: repository_path,
        //     trees: [git.TREE(), git.STAGE()],
        //     map: async (entry_path, [tree_entry, stage_entry]) => {
        //         if (tree_entry === null) {
        //             let status = await git.status({ fs: this.fs, dir: repository_path, filepath: entry_path });
        //             console.log(status);
        //             return entry_path;
        //         }
        //         let entry_type = await tree_entry.type();
        //
        //         if (stage_entry === null && entry_path.endsWith(".ttl")) {
        //             return `${entry_path}-deleted`;
        //         }
        //
        //         if (entry_type === "blob" && !entry_path.startsWith(".")) {
        //             let workdir_oid = await tree_entry.oid();
        //             let stage_oid = await stage_entry.oid();
        //             if (workdir_oid !== stage_oid) {
        //                 return entry_path;
        //             }
        //         }
        //     },
        // });
        // return changed_files;

        // OLD IMPLEMENTATION
        // let snapshot = {};
        // try {
        //     snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
        // } catch (error) {
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
        // for (const snapshot_path of Object.keys(snapshot)) {
        //     if (!seen_paths.has(snapshot_path)) {
        //         changed_files.push(`${snapshot_path}-deleted`);
        //     }
        // }
        //
        // return changed_files;

        // Deleted files get the suffix "-deleted".
        let start = performance.now();

        const dirty = await this._readDirtySet(repository_path);
        const changed_files = Object.entries(dirty).map(([path, status]) =>
            status === "deleted" ? `${path}-deleted` : path
        );

        let end = performance.now();
        console.log("elapsed time for listing the staged files = " + (end - start) + "ms");

        return changed_files;
    }

    // Shared by commit_and_push_file()/checkPushConflicts(): turns the UI's
    // staged/selected path lists into the three buckets pushing cares about.
    // Only what was selected, or everything staged if nothing was selected.
    _derivePathsToPush(staged_file_paths, selected_staged_file_paths) {
        let paths_to_push = selected_staged_file_paths.length > 0
            ? selected_staged_file_paths
            : staged_file_paths;

        // "-deleted" entries carry the suffix themselves - strip it.
        let deleted_paths = paths_to_push
            .filter(path => path.endsWith("-deleted"))
            .map(path => path.replace(/-deleted$/, ""));

        // filesystem-manager/index.js also mixes bare directory names in
        // (folder checkboxes) - those have no content, keep only real files.
        let directory_paths = paths_to_push.filter(path =>
            !path.endsWith("-deleted") && !(path.includes("/") && path.endsWith(".ttl"))
        );
        let changed_paths = paths_to_push.filter(path =>
            !path.endsWith("-deleted") && path.includes("/") && path.endsWith(".ttl")
        );

        return { changed_paths, deleted_paths, directory_paths };
    }

    // Checks the pushed files against their CURRENT remote content, so a
    // popup can offer a per-file choice instead of silently overwriting.
    // Only checks paths with a .snapshot.json baseline (brand-new files
    // can't conflict), fetched via fetchFilesByPath() to stay cheap.
    // Returns { path, baseline, local, remote, isLocalDeletion } per
    // path whose remote differs from the baseline; skips the case where a
    // locally-staged deletion matches a remote deletion too.
    async checkPushConflicts(repository_path, staged_file_paths, selected_staged_file_paths) {
        const { changed_paths, deleted_paths } = this._derivePathsToPush(staged_file_paths, selected_staged_file_paths);

        let snapshot = {};
        try {
            snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
        } catch (error) {
            // no snapshot at all - nothing has a baseline to conflict against
            return [];
        }

        const candidates = [...changed_paths, ...deleted_paths].filter(path => path in snapshot);
        if (candidates.length === 0) {
            return [];
        }

        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        const remote_origin_url = await git.getConfig({ fs, dir, path: "remote.origin.url" });
        const repository_branch = await git.getConfig({ fs, dir, path: "branch.name" });
        const personal_access_token = await git.getConfigAll({ fs, dir, path: "user.pat" });

        const provider = createProvider(remote_origin_url, personal_access_token, {
            onLog: (log_line) => console.log(log_line),
            onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
        });

        const remote_files = await provider.fetchFilesByPath(candidates, repository_branch);
        const remote_content_by_path = new Map(remote_files.map(f => [f.path, f.content]));
        const deleted_path_set = new Set(deleted_paths);

        const conflicts = [];

        for (const path of candidates) {
            const baseline = snapshot[path];
            const remote = remote_content_by_path.get(path) ?? null;
            const is_local_deletion = deleted_path_set.has(path);

            if (remote === baseline) {
                continue; // remote hasn't moved since our baseline - safe to push
            }

            if (remote === null && is_local_deletion) {
                continue; // remote already deleted it too - nothing to resolve
            }

            const local = is_local_deletion
                ? null
                : await fs.promises.readFile(this._get_path_for_repository(repository_path, path), "utf8");

            conflicts.push({ path, baseline, local, remote, isLocalDeletion: is_local_deletion });
        }

        return conflicts;
    }

    // Applies a "keep remote" decision: writes the CURRENT remote content
    // over the local file (or removes it, if remote_content is null), then
    // clears .dirty.json/.snapshot.json for this path. Doesn't reuse
    // unstageFile() - that restores the OLD baseline, not the current remote.
    async resolveConflictWithRemote(repository_path, file_relative_path, remote_content) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        const full_path = this._get_path_for_repository(repository_path, file_relative_path);

        if (remote_content === null) {
            // mirrors add_file() above: keep the git index in sync too, not just the file itself
            try {
                await git.remove({ fs, dir, filepath: file_relative_path });
            } catch (error) {
                // not in the index - fine
            }
            try {
                await fs.promises.unlink(full_path);
            } catch (error) {
                // already gone locally too - nothing to do
            }
        } else {
            const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

            if (parent_folder_path !== dir) {
                await ensureDir(fs, parent_folder_path);
            }

            await fs.promises.writeFile(full_path, remote_content, "utf8");

            // mirrors save_and_stage_file() above: keep the git index in sync too
            await git.add({ fs, dir, filepath: file_relative_path });
            await git.updateIndex({ fs, dir, add: true, filepath: file_relative_path });
        }

        try {
            const dirty = await this._readDirtySet(repository_path);
            delete dirty[file_relative_path];
            await this._writeDirtySet(repository_path, dirty);

            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot file - nothing to remove
            }
            delete snapshot[file_relative_path];
            await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify(snapshot), "utf8");
        } catch (error) {
            console.error("Failed to update dirty-file/snapshot tracking after resolving conflict:", error);
        }
    }

    async commit_and_push_file(repository_path, staged_file_paths, selected_staged_file_paths, message) {
        // OLD IMPLEMENTATION
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
        //     throw error;
        // }
        //
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

        // Pushes changed and deleted files via the GitHub/GitLab API (pushViaApi()).
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

        let { changed_paths, deleted_paths, directory_paths } = this._derivePathsToPush(staged_file_paths, selected_staged_file_paths);

        if (directory_paths.length > 0) {
            console.warn("Skipping non-file entries (directories) from push:", directory_paths);
        }

        console.log("commit_and_push_file(): staged_file_paths =", staged_file_paths,
            "| selected_staged_file_paths =", selected_staged_file_paths,
            "| resulting changed_paths =", changed_paths,
            "| resulting deleted_paths =", deleted_paths);

        if (changed_paths.length === 0 && deleted_paths.length === 0) {
            // pushViaApi() then returns null, which only shows a generic error toast.
            console.warn("commit_and_push_file(): nothing to push after filtering - check the logged paths above for why.");
        }

        const provider = createProvider(remote_origin_url, personal_access_token, {
            onLog: (log_line) => console.log(log_line),
            onProgress: (current, total, label) => console.log(`${label}: ${current}/${total}`),
        });

        // Paths without a snapshot baseline are new files; GitLab needs
        // "create" instead of "update" for them.
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

        // OLD IMPLEMENTATION
        // for (const path of changed_paths) {
        //     snapshot[path] = await this.pfs.readFile(`${repository_path}/${path}`, "utf8");
        // }

        // Pushed paths need no baseline; it is captured again on the next edit.
        try {
            for (const path of [...changed_paths, ...deleted_paths]) {
                delete snapshot[path];
            }
            await this.pfs.writeFile(snapshot_path, JSON.stringify(snapshot), "utf8");
        } catch (error) {
            console.error("Failed to update snapshot after push:", error);
        }

        // Pushed paths are no longer dirty.
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

    // CORS PROXY REMNANT (pending deletion); caller in filesystem-manager/index.js is commented out too.
    // async canPullSafely(repository_path, changed_files) {
    //     return [true, 1];
    //
    //     const fs = this._get_fs_for_repository(repository_path);
    //     const dir = this._get_dir_for_repository(repository_path);
    //     const has_commit = await git.resolveRef({ fs, dir, ref: "HEAD" })
    //         .then(() => true, () => false);
    //     if (!has_commit) {
    //         return [];
    //     }
    //
    //     let current_branch = await git.currentBranch({
    //         fs,
    //         dir,
    //         fullname: false
    //     });
    //     let { username, token: personal_access_token } = await this._get_credentials_for_repository(fs, dir);
    //
    //     try {
    //         await git.fetch({
    //         fs,
    //         http: this._http,
    //         dir,
    //         url: await this._get_push_pull_url(fs, dir),
    //         corsProxy: this._corsProxy,
    //         onAuth: () => (username && personal_access_token
    //             ? { username, password: personal_access_token }
    //             : {})
    //         });
    //
    //         const localLog = await git.log({
    //             fs,
    //             dir,
    //             ref: 'HEAD',
    //             depth: 100
    //         });
    //
    //         const remoteLog = await git.log({
    //             fs,
    //             dir,
    //             ref: `origin/${current_branch}`,
    //             depth: 100
    //         });
    //
    //         const remoteOids = new Set(remoteLog.map(c => c.oid));
    //
    //         const baseCommit = localLog.find(c => remoteOids.has(c.oid));
    //
    //         if (!baseCommit) {
    //             throw new Error('No common ancestor found');
    //         }
    //
    //         const base = baseCommit.oid;
    //
    //         if (localLog === remoteLog) {
    //             console.log("No remote changes");
    //             return [];
    //         }
    //
    //         const remoteChanges = [];
    //
    //         await git.walk({
    //         fs,
    //         dir,
    //         trees: [
    //             git.TREE({ ref: base }),
    //             git.TREE({ ref: `origin/${current_branch}` })
    //         ],
    //         map: async (filepath, [A, B]) => {
    //             const oidA = await A?.oid();
    //             const oidB = await B?.oid();
    //
    //             if (oidA !== oidB) {
    //             remoteChanges.push(filepath);
    //             }
    //         }
    //         });
    //
    //         const normalizePath = (path) => path.replace(/-deleted$/, '');
    //
    //         const conflicts = changed_files.filter(f =>
    //         remoteChanges.includes(normalizePath(f))
    //         );
    //
    //         console.log("Remote changes:", remoteChanges, "Changed files local: ", changed_files, "Conflicts with local changes:", conflicts);
    //
    //
    //         return [conflicts.length===0, remoteChanges.length];
    //
    //
    //     } catch (e) {
    //         console.error("Error in canPullSafely: ", e);
    //         return false;
    //     }
    // }

    async pull(repository_path) {
        // OLD IMPLEMENTATION
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

        // Syncs local files with the remote via the GitHub/GitLab API.
        // No conflict check against local changes yet.
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

            // OLD IMPLEMENTATION
            // let old_snapshot = {};
            // try {
            //     old_snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            // } catch (error) {}
            //
            // const files = await provider.fetchAllFiles(repository_branch);
            // const snapshot = {};
            // const seen_paths = new Set();
            // for (const file of files) {
            //     const full_path = `${repository_path}/${file.path}`;
            //     const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));
            //     if (parent_folder_path !== repository_path) {
            //         await ensureDir(this.fs, parent_folder_path);
            //     }
            //     await this.pfs.writeFile(full_path, file.content, "utf8");
            //     snapshot[file.path] = file.content;
            //     seen_paths.add(file.path);
            // }
            // for (const old_path of Object.keys(old_snapshot)) {
            //     if (!seen_paths.has(old_path)) {
            //         try { await this.pfs.unlink(`${repository_path}/${old_path}`); } catch (error) {}
            //     }
            // }
            // await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify(snapshot), "utf8");

            const dirty = await this._readDirtySet(repository_path);
            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot entries at all - fine, nothing was ever locally edited
            }

            // Local file paths before the pull, to detect remote deletions.
            const local_paths_before_pull = new Set();
            await git.walk({
                fs,
                dir,
                trees: [git.WORKDIR()],
                // see the same option in read_directory_files() above
                iterate: (walk, children) => mapWithConcurrency([...children], 5, walk),
                map: async (entry_path, [entry]) => {
                    // see the .crswap comment in list_entries_from_workdir() above
                    if (entry && !entry_path.startsWith(".") && !entry_path.endsWith(".crswap") && (await entry.type()) === "blob") {
                        local_paths_before_pull.add(entry_path);
                    }
                },
            });

            // Loading mode from "lazy.enabled"; without it, lazy if a .remote-tree.json exists.
            const lazy_config = await git.getConfig({ fs, dir, path: "lazy.enabled" });
            const is_lazy = lazy_config === "false"
                ? false
                : (lazy_config === "true" ? true : (await this._readRemoteTree(repository_path)) !== null);

            let remote_tree = null; // only used (and only written back) in lazy mode
            let seen_paths;
            const changed_paths = new Set();

            if (is_lazy) {
                // OLD IMPLEMENTATION
                // const seen_paths = new Set(tree.map(entry => entry.path));
                // const paths_to_refresh = [...local_paths_before_pull].filter(path => seen_paths.has(path));

                // Fetch the tree; re-fetch content only for downloaded files whose
                // SHA changed or is unknown. Other files are downloaded on first read.
                const tree = await provider.fetchFileTree(repository_branch);
                remote_tree = new Map(tree.map(entry => [entry.path, entry.sha]));
                seen_paths = new Set(remote_tree.keys());

                const previous_remote_tree = (await this._readRemoteTree(repository_path)) ?? new Map();

                const paths_to_refresh = [...local_paths_before_pull].filter(path => {
                    if (!remote_tree.has(path)) {
                        return false; // no longer remote - the deletion loop below handles it
                    }
                    const previous_sha = previous_remote_tree.get(path);
                    return previous_sha === undefined || previous_sha !== remote_tree.get(path);
                });

                if (paths_to_refresh.length > 0) {
                    const files = await provider.fetchFilesByPath(paths_to_refresh, repository_branch);

                    // Unchanged files are skipped, so changed_paths only lists what needs reindexing.
                    await mapWithConcurrency(files, 5, async (file) => {
                        if (file.content === null) {
                            return; // deleted remotely just now - the deletion loop below handles it
                        }

                        const full_path = this._get_path_for_repository(repository_path, file.path);

                        let current_content;
                        try {
                            current_content = await fs.promises.readFile(full_path, "utf8");
                        } catch (error) {
                            // shouldn't happen (path came from local_paths_before_pull) - be defensive anyway
                        }

                        if (current_content === file.content) {
                            return; // already up to date locally - nothing to write
                        }

                        const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                        if (parent_folder_path !== dir) {
                            await ensureDir(fs, parent_folder_path);
                        }

                        await fs.promises.writeFile(full_path, file.content, "utf8");
                        changed_paths.add(file.path);
                    });
                }
            } else {
                // Full mode: fetch and update all files.
                const files = await provider.fetchAllFiles(repository_branch);
                seen_paths = new Set(files.map(file => file.path));

                await mapWithConcurrency(files, 5, async (file) => {
                    const full_path = this._get_path_for_repository(repository_path, file.path);

                    let current_content;
                    try {
                        current_content = await fs.promises.readFile(full_path, "utf8");
                    } catch (error) {
                        // not downloaded yet at all - fine, falls through to the write below
                    }

                    if (current_content === file.content) {
                        return; // already up to date locally - nothing to write
                    }

                    const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                    if (parent_folder_path !== dir) {
                        await ensureDir(fs, parent_folder_path);
                    }

                    await fs.promises.writeFile(full_path, file.content, "utf8");
                    changed_paths.add(file.path);
                });
            }

            const deleted_paths = new Set();

            for (const old_path of local_paths_before_pull) {
                if (seen_paths.has(old_path)) {
                    continue; // still exists remotely
                }

                const is_new_unpushed_file = dirty[old_path] === "changed" && !(old_path in snapshot);
                if (is_new_unpushed_file) {
                    continue; // never existed remotely - leave it alone
                }

                try {
                    await fs.promises.unlink(this._get_path_for_repository(repository_path, old_path));
                    deleted_paths.add(old_path);
                } catch (error) {
                    // already gone locally too - nothing to do
                }
            }

            // OLD IMPLEMENTATION
            // await this._writeDirtySet(repository_path, {});
            // await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify({}), "utf8");

            // Only written/deleted paths are reset; new, unpushed files stay dirty.
            try {
                for (const path of [...changed_paths, ...deleted_paths]) {
                    delete dirty[path];
                    delete snapshot[path];
                }
                await this._writeDirtySet(repository_path, dirty);
                await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify(snapshot), "utf8");
            } catch (error) {
                console.error("Failed to clear dirty-file/snapshot tracking after pull:", error);
            }

            // Lazy repos: store the fresh SHAs for the next pull.
            if (is_lazy) {
                try {
                    await this._writeRemoteTree(repository_path, remote_tree);
                } catch (error) {
                    console.error("Failed to update remote-tree manifest after pull:", error);
                }
            }

            let end = performance.now();
            console.log("elapsed time for pull() via API = " + (end - start) + "ms");

            // Lets the caller regenerate indexes only for affected folders.
            return {
                changedPaths: [...changed_paths],
                deletedPaths: [...deleted_paths],
            };
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    async has_remote(repository_path) {
        const remotes = await git.listRemotes({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path)
        });

        return remotes.length > 0;
    }

    async has_token(repository_path) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);
        let personal_access_token = await git.getConfigAll({
            fs,
            dir,
            path: "user.pat"
        });

        return personal_access_token != '' ;
    }

    async unstageFile(repository_path, file_relative_path) {
        // OLD IMPLEMENTATION
        // let current_branch = await git.currentBranch({
        //     fs: this.fs,
        //     dir: repository_path,
        //     fullname: false
        // });
        //
        // try {
        //     await git.resetIndex({
        //         fs: this.fs,
        //         dir: repository_path,
        //         filepath: file_relative_path
        //     });
        //
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

        // Restores the file from .snapshot.json (the last synced content).
        // Bare directory names (also passed by the caller) are a no-op.
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
                // Edited or locally deleted file: restore the last synced content.
                const full_path = this._get_path_for_repository(repository_path, plain_path);
                const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                if (parent_folder_path !== dir) {
                    await ensureDir(fs, parent_folder_path);
                }

                await fs.promises.writeFile(full_path, snapshot[plain_path], "utf8");
            } else if (!file_relative_path.endsWith("-deleted")) {
                // New, unpushed file: remove it.
                try {
                    await fs.promises.unlink(this._get_path_for_repository(repository_path, plain_path));
                } catch (error) {
                    // already gone - nothing to do
                }
            }

            // No longer dirty; the baseline is no longer needed.
            try {
                const dirty = await this._readDirtySet(repository_path);
                delete dirty[plain_path];
                await this._writeDirtySet(repository_path, dirty);

                if (plain_path in snapshot) {
                    delete snapshot[plain_path];
                    await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify(snapshot), "utf8");
                }
            } catch (error) {
                console.error("Failed to update dirty-file/snapshot tracking after unstage:", error);
            }

            return true;
        } catch (error) {
            console.error('Error unstaging file:', error);
            throw new Error(`Failed to unstage file: ${error.message}`);
        }
    }

    // CORS PROXY REMNANT (pending deletion)
    // async _list_refs(repository_metadata, refs_type) {
    //     let refs = await git.listServerRefs({
    //         http: this._http,
    //         corsProxy: this._corsProxy,
    //         url: repository_metadata.url,
    //         prefix: `refs/${refs_type}/`,
    //         onAuth: () => ({
    //             username: repository_metadata.username,
    //             password: repository_metadata.token,
    //         }),
    //     });
    //
    //     return refs;
    // }

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
                    const sparqlQuery = await this._loadSparqlQuery(`modules/datasets-generator/${folderName}`);
                    
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
                const sparqlQuery = await this._loadSparqlQuery(`modules/datasets-generator/${folderName}`);
                
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
                    let newIndex = indexContent;

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
                        success: true,
                        index: newIndex
                    };

                    console.log(`Index updated successfully for ${folderName}`);
                } 
                else if (indexContent !== '' && indexFile === '') {
                    const indexPath = `indexes/${folderName}.ttl`;
                    await this.save_and_stage_file(repository_path, indexContent, indexPath);
                    console.log(`Saved new index file for: ${folderName}.`)
                }
                else {
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

    async _loadSparqlQuery(folderName) {
        try {
            // Load SPARQL query
            // Path: {folderName}.sparql
            const sparqlQueryPath = `${folderName}.sparql`;
            
            // Load sparql query content directly from the editors repo instead of the loaded data repo (for maintainability purposes).
            // Maybe add a check for project specific sparql queries from the data repo in the future.
            const sparqlContent = await fetch(sparqlQueryPath).then(response => response.text());
            //const sparqlContent = await this.read_file(repository_path, sparqlQueryPath);
            
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

            const result = this.store.query(sparqlQuery, { results_format: 'application/n-triples' });

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

            let result = this.index_store.query("CONSTRUCT { ?s ?p ?o . } WHERE { ?s ?p ?o . }", { results_format: 'application/n-triples' });

            if (is_deleted===false) {
                result = updateContent + '\n' + result;
            }

            return result || existingIndexContent;


        } catch (error) {
            console.error('Error executing SPARQL update with Oxygraph:', error);
            return existingIndexContent; 
        }
    }
}