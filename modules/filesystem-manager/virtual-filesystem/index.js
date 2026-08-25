import * as FILESYSTEM_MANAGER_CONSTANTS from "../constants.js";
import git from "#isomorphic-git";
import http from "#isomorphic-git-http";
import init_oxigraph, * as oxigraph from "#oxigraph";
import FSADirectoryFilesystem from "./fsa-directory-filesystem.js";
import LocalRepositoryStore from "./local-repository-store.js";
await init_oxigraph();

export default class ADWLMVirtualFilesystem {
    constructor(fs = null, { httpPlugin = null, corsProxy = FILESYSTEM_MANAGER_CONSTANTS.CORS_PROXY } = {}) {
        this._filesystem_name = "mermeid";
        this.fs = fs ?? new LightningFS(this._filesystem_name);
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

    async _restore_local_repositories() {
        const stored = await this._localRepositoryStore.getAll();

        for (const [name, dirHandle] of stored) {
            this._localRepositoryHandles.set(name, dirHandle);

            try {
                const permission = await dirHandle.queryPermission({ mode: "readwrite" });
                if (permission === "granted") {
                    this._localRepositories.set(name, { dirHandle, fs: new FSADirectoryFilesystem(dirHandle) });
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
        try {
            await git.clone({
                fs: this.fs,
                http: this._http,
                dir: repository_folder_name,
                corsProxy: this._corsProxy,
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
        await this._localRepositoriesReady;

        let gitRepos = await this.pfs.readdir("/");
        let localRepos = Array.from(this._localRepositoryHandles.keys());

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

    async list_staged_files(repository_path) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        let start = performance.now();
        let changed_files = await git.walk({
            fs,
            dir,
            trees: [git.TREE(), git.STAGE()],
            map: async (entry_path, [tree_entry, stage_entry]) => {
                if (tree_entry === null) {
                    //console.log(`${JSON.stringify(tree_entry)} ${JSON.stringify(stage_entry)}`);
                    let status = await git.status({ fs, dir, filepath: entry_path });
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

    async commit_and_push_file(repository_path, staged_file_paths, selected_staged_file_paths, message) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        // get some metadata
        let current_branch = await git.currentBranch({
            fs,
            dir,
            fullname: false
        });
        let { username, token: personal_access_token } = await this._get_credentials_for_repository(fs, dir);

        if(!message || message.trim().length === 0){
            message= `${(new Date()).toISOString()}, ${username}`
        }
        // in case when not all files were selected,
        // unstage the files that were not selected
        if (selected_staged_file_paths.length > 0) {
            let to_unstage_file_paths = staged_file_paths.filter(path => !selected_staged_file_paths.includes(path));
            for (const to_unstage_file_path of to_unstage_file_paths) {
                await git.resetIndex({
                    fs,
                    dir,
                    filepath: to_unstage_file_path
                });
            }
        }

        // commit the staged files
        let sha = await git.commit({
            fs,
            dir,
            author: {
                name: username,
                email: username,
            },
            message: message
        });

        let push_result = {};
        try {
            // push all the committed files
            push_result = await git.push({
                fs,
                http: this._http,
                dir,
                remote: FILESYSTEM_MANAGER_CONSTANTS.REMOTE_NAME,
                url: await this._get_push_pull_url(fs, dir),
                corsProxy: this._corsProxy,
                ref: current_branch,
                force: false,
                onAuth: () => (username && personal_access_token
                    ? { username, password: personal_access_token }
                    : {}),
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
                    fs,
                    dir,
                    filepath: to_stage_back_file_path
                });
            }
        }

        return push_result.ok;
    }

    async canPullSafely(repository_path, changed_files) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

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
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        // get some metadata
        let { username, token: personal_access_token } = await this._get_credentials_for_repository(fs, dir);
        let current_branch = await git.currentBranch({
            fs,
            dir,
            fullname: false
        });

        // pull the changes from the remote repository
        let start = performance.now();
        try {
            await git.pull({
                fs,
                http: this._http,
                dir,
                url: await this._get_push_pull_url(fs, dir),
                ref: current_branch,
                singleBranch: true,
                corsProxy: this._corsProxy,
                onAuth: () => (username && personal_access_token
                    ? { username, password: personal_access_token }
                    : {})
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
        let end = performance.now();
        console.log("elapsed time for git.pull() = " + (end - start) + "ms");
    }

    async has_remote(repository_path) {
        const remotes = await git.listRemotes({
            fs: this._get_fs_for_repository(repository_path),
            dir: this._get_dir_for_repository(repository_path)
        });

        return remotes.length > 0;
    }

    async unstageFile(repository_path, file_relative_path) {
        const fs = this._get_fs_for_repository(repository_path);
        const dir = this._get_dir_for_repository(repository_path);

        let current_branch = await git.currentBranch({
            fs,
            dir,
            fullname: false
        });

        try {
            // Reset the index entry for this file
            await git.resetIndex({
                fs,
                dir,
                filepath: file_relative_path
            });

            // Restore the file from current branch
            await git.checkout({
                fs,
                dir,
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