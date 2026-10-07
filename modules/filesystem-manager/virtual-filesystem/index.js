import * as FILESYSTEM_MANAGER_CONSTANTS from "../constants.js";
import git from "#isomorphic-git";
import http from "#isomorphic-git-http";
import init_oxigraph, * as oxigraph from "#oxigraph";
import { createProvider, ensureDir, pushViaApi, mapWithConcurrency } from "../api-provider.js";
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

        // In-memory cache for .remote-tree.json (see _readRemoteTree() /
        // _writeRemoteTree() below) - repository_path -> { tree, childrenIndex }.
        // Without this, EVERY list_entries_from_workdir() call (i.e. every
        // single folder expand in the tree UI) re-reads and re-parses the
        // whole manifest from OPFS - fine for a small repo, but for one with
        // tens of thousands of files this made expanding any folder (and
        // therefore opening any file via search/graph-view, which expands
        // every ancestor folder) noticeably slow. Lives only as long as this
        // object does (a fresh page load starts empty) and is kept in sync
        // because _writeRemoteTree() is the only place that ever changes
        // the manifest on disk.
        this._remoteTreeCache = new Map();
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

        // OLD IMPLEMENTATION
        // let branch_name = await git.getConfig({
        //         fs,
        //         dir: "/",
        //         path: "branch.name"
        //     });
        //
        // "branch.name" is never set by a real git CLI, only by
        // add_repository() - so this always read undefined and wrote it
        // right back, permanently unset, breaking pushes ("branch is
        // required"). Fixed: read the actual checked-out branch instead.
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

    async add_repository(repository_metadata, { onProgress } = {}) {
        let repository_folder_name = repository_metadata.folder;
        let personal_acces_token = repository_metadata.token;
        let username = repository_metadata.username;
        let remote_origin_url = repository_metadata.url;
        let repository_branch = repository_metadata.branch;
        // Whether this repo is cloned lazily (tree only, content fetched on
        // demand - see fetchFileTree()/_ensureFileDownloaded() etc. below)
        // or downloaded fully up front, like before lazy loading existed
        // (see the "add repository" dialog's "Lazy Loading verwenden"
        // switch). Defaults to true, so any other/older caller not yet
        // passing this field keeps getting the (now default) lazy
        // behavior. Persisted as the "lazy.enabled" git config value below,
        // so pull() later knows which of the two modes to keep using for
        // THIS repo without having to guess from whether a
        // .remote-tree.json manifest happens to exist.
        let use_lazy_loading = repository_metadata.use_lazy_loading !== false;

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
            const provider = createProvider(remote_origin_url, personal_acces_token, {
                onLog: (message) => console.log(message),
                onProgress: (current, total, label) => {
                    console.log(`${label}: ${current}/${total}`);
                    onProgress?.(current, total, label);
                },
            });

            if (use_lazy_loading) {
                // Replaces git.clone(): loads only the file TREE (paths, no content) via
                // the GitHub/GitLab API - this eliminates the CORS proxy entirely, same
                // as before, but also means the tree/menu is available immediately
                // without downloading any file content. Individual files are fetched
                // on demand the first time they're actually read - see
                // _ensureFileDownloaded()/_ensureFilesDownloaded() below, hooked into
                // read_file()/read_directory_files(), and list_entries_from_workdir()
                // (which merges this manifest into what it shows even before anything
                // has been downloaded).
                const tree = await provider.fetchFileTree(repository_branch);
                await this._writeRemoteTree(repository_folder_name, new Map(tree.map(entry => [entry.path, entry.sha])));
            } else {
                // "Repo vollständig laden" option: restores the pre-lazy-loading
                // behavior on purpose (e.g. for a repo the user knows they'll browse
                // exhaustively anyway, where paying the cost once up front beats
                // many later on-demand fetches). Deliberately does NOT write
                // .remote-tree.json - its absence is exactly what keeps
                // _ensureFileDownloaded()/_ensureFilesDownloaded()/
                // list_entries_from_workdir()'s manifest merge complete no-ops for
                // this repo (see _readRemoteTree()), so nothing else needs to know
                // or branch on use_lazy_loading at all - only pull() below does,
                // via the "lazy.enabled" config value set further down.
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

            // Replaced by a lazy baseline, captured on first edit instead of
            // eagerly for every file here - see _captureSnapshotBaselineOnFirstTouch() below.

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

        // store which of the two modes this repo was added with, so pull()
        // (see below) keeps using the same one on every future sync -
        // without this, pull() would have no explicit way to tell "eager,
        // by choice" apart from "lazy, but nothing downloaded yet" for a
        // repo that has no .remote-tree.json purely because it was just
        // added and no pull has happened yet.
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

        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION: manually walked the whole directory tree and
        // deleted every file/folder one at a time (see _clear_directory()
        // below), fully sequential (no concurrency at all, unlike the
        // read/write loops elsewhere in this file) - 2 separate async OPFS
        // calls (stat + unlink) per file. For an eager-loaded repo with
        // thousands of files this made "remove repository" extremely slow.
        //
        // await this._clear_directory(repository_folder_name);
        // ---------------------------------------------------------------------
        //
        // Fixed: entirely redundant - this.pfs.rmdir() below already deletes
        // the whole directory tree in one native, recursive call
        // (FSADirectoryFilesystem.rmdir() -> dirHandle.removeEntry(name,
        // { recursive: true })), handled by the browser/OS itself instead of
        // one-by-one from JS. _clear_directory() was doing the same work
        // twice, the slow way first.
        //
        // Measured after this fix on a 14,358-file repo: ~38s, almost
        // entirely inside this one call (git.deleteRemote() above: ~100ms).
        // That remaining cost is the browser's own native recursive delete
        // actually freeing every file's storage - there's no faster
        // primitive available for this; it's no longer duplicated work.
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

        // Lazy repos (see add_repository()) don't have every file physically
        // on disk yet - merge in whatever .remote-tree.json knows about at
        // this same folder level, so the tree/menu shows the full picture
        // even before anything's been downloaded. No-op (remote_children is
        // null) for local repos and repos added before this feature existed.
        //
        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION: scanned every single path in .remote-tree.json on
        // every call, just to find the handful belonging to this one folder -
        // fine for a small repo, but for one with tens of thousands of files
        // this meant every folder expand (and therefore every file opened via
        // search/graph-view, which expands each ancestor folder in turn) paid
        // a cost that scaled with the whole repo's size, not the folder's.
        //
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
        // ---------------------------------------------------------------------
        //
        // Fixed: _getRemoteTreeChildren() looks this one folder up in an
        // index built ONCE from the whole manifest (see
        // _buildRemoteTreeChildrenIndex()), instead of re-scanning
        // everything per call.
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

        // Keep .dirty.json in sync (see list_staged_files()) - filesystem-
        // manager/index.js also calls this with a bare directory name, which
        // isn't a tracked file, so skip it (same guard as unstageFile()).
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

            // Keep .dirty.json in sync (see list_staged_files() for why this
            // exists): if the new content matches what's in .snapshot.json, the
            // edit was reverted back to the synced state, so it's no longer
            // "changed" - otherwise mark/keep it as changed. Reuses `dirty` from above.
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

    // Lazy repos (see add_repository()) may know a file exists remotely
    // (.remote-tree.json) without it being physically downloaded yet -
    // fetches and writes any such missing paths now, the first time
    // they're actually read. No-op for paths already on disk, and for
    // repos without a manifest (local repos, or repos added before this
    // feature existed).
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

        // ---------------------------------------------------------------------
        // OLD IMPLEMENTATION: walked the ENTIRE workdir tree just to find one
        // already-known path. git.walk()'s default iterate() recurses into
        // every directory regardless of what map() does with each entry, so
        // this scaled with the TOTAL number of files physically on disk, not
        // with the single target file - harmless for a small repo, but for
        // an eager-loaded repo with thousands of files already downloaded,
        // opening any one file this way became very slow (e.g. every open
        // triggered from search/graph-view).
        //
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
        // ---------------------------------------------------------------------
        //
        // Fixed: file_path is already the exact path to read - no need to
        // search the whole tree for it. Same direct-read pattern already
        // used elsewhere in this file (pull(), _ensureFilesDownloaded()).
        // A missing file (including a stray same-named ".crswap" in-progress
        // write) throws and falls through to "", matching the old walk's
        // default when nothing matched.
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

        // Ensure every remotely-known top-level file in this directory is
        // downloaded first (lazy repos) - the walk below only sees what's
        // physically on disk, so anything not yet downloaded would
        // otherwise silently look like it doesn't exist.
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
            // Caps git.walk()'s default unbounded per-directory concurrency -
            // isomorphic-git's FileSystem.read() silently returns null on
            // failure, crashing entry.content() ("Cannot read properties of
            // null") under heavy File System Access API load otherwise.
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

    // Reads .remote-tree.json: path -> blob SHA, for every path known to
    // exist on the remote, for a lazily-cloned repo (see
    // add_repository()/pull() below) - same "always on the shared this.pfs"
    // placement as .dirty.json above. The SHA (not just the path) is what
    // lets pull() tell which already-downloaded files actually changed
    // remotely, instead of re-fetching content for everything on every
    // sync (see pull() below). Returns null (not an empty Map) when there's
    // no manifest at all, so callers can tell "not a lazy repo" (local
    // folder, or added before this feature existed) apart from "lazy repo
    // with zero known files".
    //
    // Backed by this._remoteTreeCache (see constructor) - for a repo with
    // tens of thousands of entries, re-reading + re-JSON.parse()-ing the
    // whole manifest on every call (every single folder expand in the tree
    // UI ends up calling this) was measurably slow. Cached per
    // repository_path for the lifetime of this object; _writeRemoteTree()
    // below is the only writer, so it keeps the cache in sync directly
    // instead of just invalidating it.
    async _readRemoteTree(repository_path) {
        const cached = this._remoteTreeCache.get(repository_path);
        if (cached) {
            return cached.tree;
        }

        try {
            const data = JSON.parse(await this.pfs.readFile(`${repository_path}/.remote-tree.json`, "utf8"));

            // Backward compatible: an earlier version of this manifest was a
            // flat array of paths only (no SHA tracking yet). Treated as
            // "SHA unknown" rather than failing outright - pull() then
            // refreshes those paths once (see paths_to_refresh below), which
            // self-heals the manifest into the new path->sha format.
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
        // childrenIndex: null - rebuilt lazily on next _getRemoteTreeChildren()
        // call (see below), no need to redo that work here on every write.
        this._remoteTreeCache.set(repository_path, { tree: pathToShaMap, childrenIndex: null });
    }

    // Folder-scoped lookup for list_entries_from_workdir()'s manifest merge
    // (see there) - backed by a per-repo index built ONCE from the whole
    // manifest (see _buildRemoteTreeChildrenIndex() below) and cached
    // alongside the tree itself, instead of linearly scanning every path in
    // the repo on every single folder expand. Returns null when there's no
    // manifest, or { folders: Set<path>, files: Set<path> } (possibly both
    // empty) for the requested folder - parent_folder_relative_path must be
    // in the same "" (root) / "a/b/" (trailing slash) form
    // list_entries_from_workdir() already uses internally.
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

    // Turns the flat path->sha manifest into folderKey -> { folders, files }
    // buckets (one entry per folder level, keyed the same "" / "a/b/" way as
    // parent_folder_relative_path), so a lookup for one folder afterwards is
    // O(children of that folder) instead of O(every path in the repo).
    // Mirrors the "skip a path whose FULL path starts with '.'" rule the old
    // linear-scan merge used.
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

    // Lazily captures the pre-edit content of `file_relative_path` into
    // .snapshot.json, but only on its first touch since the last sync
    // (skipped if already in `dirty`). Must run BEFORE the caller's own
    // write/unlink. Reads via _get_fs_for_repository() (not this.pfs), so
    // this works for both API-cloned and local repos. If the file doesn't
    // exist yet (ENOENT), it's brand-new - no baseline is captured, which is
    // what marks it as "new" elsewhere (commit_and_push_file(), unstageFile()).
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
        // pull() above. Reuses pushViaApi() from api-provider.js.
        //
        // Deliberately minimal for now: real conflict detection is still
        // pending (see canPullSafely()) - deletions ARE supported (see
        // deletedPaths below and pushFiles() in api-provider.js).
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

        // Keep the snapshot baseline in sync with what was just pushed.
        //
        // OLD IMPLEMENTATION
        // for (const path of changed_paths) {
        //     snapshot[path] = await this.pfs.readFile(`${repository_path}/${path}`, "utf8");
        // }
        //
        // Failed for local repos (wrong fs) and doesn't fit the lazy model -
        // a just-pushed path is no longer dirty, so it needs no baseline at
        // all. Fixed: just drop the entry; _captureSnapshotBaselineOnFirstTouch()
        // recreates it if the path is ever touched again.
        try {
            for (const path of [...changed_paths, ...deleted_paths]) {
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
        // TEMPORARILY DISABLED: still uses the old Git-based approach below
        // (git.fetch()+git.log()), which no longer works now that pushes go
        // via the API and never create a local commit - the local history
        // goes stale, causing false "modified both locally and remotely"
        // conflicts. Deferred until the other functions are confirmed
        // working; remove this return to re-enable. [true, 1] (not
        // [true, 0]) so "Synchronize" doesn't short-circuit before ever
        // calling pull() - side effect: "Push" now also runs its pre-push
        // pull+restage step every time (see filesystem-manager/index.js).
        return [true, 1];

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

            // ---------------------------------------------------------------------
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
            // ---------------------------------------------------------------------
            //
            // Wrote through the shared fs instead of the repo's own (broken
            // for local repos) and rebuilt a FULL .snapshot.json every pull,
            // which no longer fits the lazy model. Fixed: walk the current
            // local file tree instead (paths only, no content) to find what
            // existed before this pull. A path missing from the fresh fetch
            // is only protected from deletion if it's a brand-new,
            // never-pushed file (dirty but no snapshot baseline) - anything
            // else missing is a genuine remote deletion.
            const dirty = await this._readDirtySet(repository_path);
            let snapshot = {};
            try {
                snapshot = JSON.parse(await this.pfs.readFile(`${repository_path}/.snapshot.json`, "utf8"));
            } catch (error) {
                // no snapshot entries at all - fine, nothing was ever locally edited
            }

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

            // Which of the two add_repository() modes this repo uses (see
            // there) - an explicit "lazy.enabled" config value wins; a repo
            // added before that flag existed falls back to inferring it from
            // whether it already has a .remote-tree.json manifest (i.e. was
            // already being treated as lazy), so nothing changes for repos
            // added before this two-mode choice existed.
            const lazy_config = await git.getConfig({ fs, dir, path: "lazy.enabled" });
            const is_lazy = lazy_config === "false"
                ? false
                : (lazy_config === "true" ? true : (await this._readRemoteTree(repository_path)) !== null);

            let remote_tree = null; // only used (and only written back) in lazy mode
            let seen_paths;
            const changed_paths = new Set();

            if (is_lazy) {
                // Fetch only the TREE (paths, no content) - cheap regardless
                // of repo size - and only re-fetch CONTENT for paths that are
                // already physically downloaded (previously opened). A remote
                // file never opened before just gets added to
                // .remote-tree.json below, fetched lazily whenever it's
                // eventually opened (see _ensureFileDownloaded()).
                //
                // ---------------------------------------------------------------------
                // OLD IMPLEMENTATION: refreshed content for EVERY already-downloaded
                // path that still exists remotely, on every single pull - fine for a
                // freshly-added repo where only a handful of files were ever opened,
                // but for a repo where most/all files are already present locally
                // (e.g. a local folder import with a remote configured, or any
                // repo that's simply been browsed a lot) this could mean thousands
                // of individual fetchFilesByPath() REST calls at once, hammering
                // GitLab's per-instance rate limit (429) hard enough to abort the
                // whole pull.
                //
                // const seen_paths = new Set(tree.map(entry => entry.path));
                // const paths_to_refresh = [...local_paths_before_pull].filter(path => seen_paths.has(path));
                // ---------------------------------------------------------------------
                //
                // Fixed: the tree already carries each blob's current SHA "for
                // free" - compared against the SHA recorded in .remote-tree.json
                // the last time we wrote it (add_repository()/a previous pull()),
                // content only needs to be re-fetched for paths whose SHA
                // actually changed. On a routine sync where only a few files
                // changed, this turns "thousands of requests" into "a handful" -
                // a path with no previously-known SHA (a repo added before SHA
                // tracking existed, or a not-yet-migrated flat-array manifest,
                // see _readRemoteTree()) is refreshed once to be safe, then
                // self-heals going forward.
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

                    // Sequential writes made pull() slow for real local folders
                    // (per-call File System Access API latency adds up over
                    // thousands of files) - mapWithConcurrency runs several at once
                    // instead. Also skips writing a file whose fetched content
                    // already matches disk, so changed_paths accurately reflects
                    // what to reindex (see filesystem-manager/index.js).
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
                            // see add_repository() above for why ensureDir() is needed
                            await ensureDir(fs, parent_folder_path);
                        }

                        await fs.promises.writeFile(full_path, file.content, "utf8");
                        changed_paths.add(file.path);
                    });
                }
            } else {
                // Eager mode ("Repo vollständig laden" - see add_repository()):
                // every remote file's current content is checked/refreshed on
                // every pull, not just already-downloaded ones - matches the
                // "everything is always fully present locally" guarantee this
                // mode promises. fetchAllFiles() already tries GitLab's GraphQL
                // batch endpoint internally (see api-provider.js), so this
                // isn't thousands of individual REST calls even for a large
                // repo. seen_paths is derived straight from what came back -
                // no separate tree fetch needed since fetchAllFiles() already
                // includes every path.
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

            // Every path actually touched (changed_paths/deleted_paths) now
            // matches remote exactly and is no longer dirty.
            //
            // OLD IMPLEMENTATION cleared .dirty.json/.snapshot.json entirely,
            // including paths deliberately left untouched above (new,
            // unpushed files) - wiping their dirty entry made the next save
            // wrongly treat them as pre-existing, causing GitLab pushes to
            // fail ("A file with this name doesn't exist").
            //
            // await this._writeDirtySet(repository_path, {});
            // await this.pfs.writeFile(`${repository_path}/.snapshot.json`, JSON.stringify({}), "utf8");
            //
            // Fixed: only drop entries for paths actually written/deleted.
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

            // Keep the remote-tree manifest current (see add_repository()) -
            // lazy repos only. Written with the fresh SHAs (not just paths),
            // so the NEXT pull can again tell changed from unchanged files
            // without re-fetching content for everything - see
            // paths_to_refresh above. Eager repos never get a manifest at
            // all (see add_repository()), which is exactly what keeps them
            // eager on every future pull too, instead of silently drifting
            // into lazy mode the way any repo used to on its first pull.
            if (is_lazy) {
                try {
                    await this._writeRemoteTree(repository_path, remote_tree);
                } catch (error) {
                    console.error("Failed to update remote-tree manifest after pull:", error);
                }
            }

            let end = performance.now();
            console.log("elapsed time for pull() via API = " + (end - start) + "ms");

            // Returned so the caller can skip regenerating indexes entirely
            // when nothing changed, and otherwise only regenerate the
            // folders actually affected - see filesystem-manager/index.js.
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
                // Restored via the repo's own fs (fs/dir), not this.fs/this.pfs -
                // otherwise this silently wrote nowhere visible for a local repo.
                const full_path = this._get_path_for_repository(repository_path, plain_path);
                const parent_folder_path = full_path.substring(0, full_path.lastIndexOf("/"));

                if (parent_folder_path !== dir) {
                    await ensureDir(fs, parent_folder_path);
                }

                await fs.promises.writeFile(full_path, snapshot[plain_path], "utf8");
            } else if (!file_relative_path.endsWith("-deleted")) {
                // never synced before (a brand new, unpushed file) - there's
                // nothing to restore to, so undo the creation entirely.
                try {
                    await fs.promises.unlink(this._get_path_for_repository(repository_path, plain_path));
                } catch (error) {
                    // already gone - nothing to do
                }
            }

            // Keep .dirty.json in sync (see list_staged_files()) - whatever
            // just got undone is no longer "changed". Also drop its
            // .snapshot.json baseline - no longer needed until edited again.
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