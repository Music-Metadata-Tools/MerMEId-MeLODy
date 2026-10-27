// A minimal fs.promises-compatible adapter that lets isomorphic-git operate
// directly on a FileSystemDirectoryHandle (File System Access API), the same
// way it operates on @isomorphic-git/lightning-fs. This makes local, user-picked
// folders real git working directories (a genuine .git is written inside them),
// instead of a separate raw read/write path with no staging/commit/push/pull.

function normalize(path) {
    // Drop empty segments (from "//" or leading/trailing "/") as well as "."
    // segments (isomorphic-git sometimes joins paths down to "." for the repo
    // root) - both mean "this level", and the File System Access API rejects
    // "." as an invalid handle name.
    return path.split("/").filter(segment => segment !== "" && segment !== ".").join("/");
}

function splitParent(normalizedPath) {
    const lastSlash = normalizedPath.lastIndexOf("/");

    return lastSlash === -1
        ? { dirPath: "", name: normalizedPath }
        : { dirPath: normalizedPath.slice(0, lastSlash), name: normalizedPath.slice(lastSlash + 1) };
}

function makeError(code, message) {
    const error = new Error(message || code);
    error.code = code;

    return error;
}

export default class FSADirectoryFilesystem {
    constructor(rootHandle) {
        this._root = rootHandle;
        this._dirHandleCache = new Map([["", rootHandle]]);
        // isomorphic-git looks for fs.promises.* - exposing the instance itself
        // as its own "promises" object keeps this adapter a drop-in for LightningFS.
        this.promises = this;
    }

    _invalidate(normalizedPath) {
        for (const key of this._dirHandleCache.keys()) {
            if (key === normalizedPath || key.startsWith(`${normalizedPath}/`)) {
                this._dirHandleCache.delete(key);
            }
        }
    }

    async _resolveDir(path, { create = false } = {}) {
        const normalizedPath = normalize(path);

        if (this._dirHandleCache.has(normalizedPath)) {
            return this._dirHandleCache.get(normalizedPath);
        }

        const segments = normalizedPath ? normalizedPath.split("/") : [];
        let matchedDepth = 0;
        let handle = this._root;

        for (let depth = segments.length; depth >= 0; depth--) {
            const prefix = segments.slice(0, depth).join("/");
            if (this._dirHandleCache.has(prefix)) {
                matchedDepth = depth;
                handle = this._dirHandleCache.get(prefix);
                break;
            }
        }

        let currentPath = segments.slice(0, matchedDepth).join("/");
        for (let depth = matchedDepth; depth < segments.length; depth++) {
            const segment = segments[depth];
            try {
                handle = await handle.getDirectoryHandle(segment, { create });
            } catch (error) {
                if (error.name === "NotFoundError" || error.name === "TypeMismatchError") {
                    throw makeError("ENOENT", `ENOENT: no such directory, '${path}'`);
                }
                throw error;
            }
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            this._dirHandleCache.set(currentPath, handle);
        }

        return handle;
    }

    async _resolveFile(path, { create = false } = {}) {
        const normalizedPath = normalize(path);
        const { dirPath, name } = splitParent(normalizedPath);

        if (!name) {
            throw makeError("ENOENT", `ENOENT: no such file, '${path}'`);
        }

        const dirHandle = await this._resolveDir(dirPath, { create });

        try {
            return await dirHandle.getFileHandle(name, { create });
        } catch (error) {
            if (error.name === "NotFoundError" || error.name === "TypeMismatchError") {
                throw makeError("ENOENT", `ENOENT: no such file, '${path}'`);
            }
            throw error;
        }
    }

    async readFile(path, opts) {
        const encoding = typeof opts === "string" ? opts : opts?.encoding;
        const fileHandle = await this._resolveFile(path);
        const file = await fileHandle.getFile();

        if (encoding) {
            return await file.text();
        }

        return new Uint8Array(await file.arrayBuffer());
    }

    async writeFile(path, data) {
        const normalizedPath = normalize(path);
        const { dirPath } = splitParent(normalizedPath);

        if (dirPath) {
            await this._resolveDir(dirPath, { create: true });
        }

        const fileHandle = await this._resolveFile(path, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
    }

    async unlink(path) {
        const normalizedPath = normalize(path);
        const { dirPath, name } = splitParent(normalizedPath);
        const dirHandle = await this._resolveDir(dirPath);

        try {
            await dirHandle.removeEntry(name);
        } catch (error) {
            if (error.name === "NotFoundError") {
                throw makeError("ENOENT", `ENOENT: no such file, '${path}'`);
            }
            throw error;
        }

        this._invalidate(normalizedPath);
    }

    async readdir(path) {
        const dirHandle = await this._resolveDir(path);
        const names = [];

        for await (const [name] of dirHandle.entries()) {
            names.push(name);
        }

        return names;
    }

    async mkdir(path) {
        await this._resolveDir(path, { create: true });
    }

    async rmdir(path) {
        const normalizedPath = normalize(path);
        const { dirPath, name } = splitParent(normalizedPath);
        const dirHandle = await this._resolveDir(dirPath);

        try {
            await dirHandle.removeEntry(name, { recursive: true });
        } catch (error) {
            if (error.name === "NotFoundError") {
                throw makeError("ENOENT", `ENOENT: no such directory, '${path}'`);
            }
            throw error;
        }

        this._invalidate(normalizedPath);
    }

    async rename(oldPath, newPath) {
        let isFile = true;
        try {
            await this._resolveFile(oldPath);
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            isFile = false;
        }

        if (isFile) {
            const data = await this.readFile(oldPath);
            await this.writeFile(newPath, data);
            await this.unlink(oldPath);
            return;
        }

        for (const name of await this.readdir(oldPath)) {
            await this.rename(`${oldPath}/${name}`, `${newPath}/${name}`);
        }
        await this.rmdir(oldPath);
    }

    async stat(path) {
        try {
            const fileHandle = await this._resolveFile(path);
            const file = await fileHandle.getFile();

            return {
                type: "file",
                mode: 0o100644,
                size: file.size,
                mtimeMs: file.lastModified,
                ctimeMs: file.lastModified,
                uid: 1,
                gid: 1,
                dev: 1,
                ino: 1,
                isFile: () => true,
                isDirectory: () => false,
                isSymbolicLink: () => false,
            };
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }

        // Not a file - confirm it's a directory (throws ENOENT if it's neither).
        await this._resolveDir(path);

        return {
            type: "dir",
            mode: 0o40755,
            size: 0,
            mtimeMs: 0,
            ctimeMs: 0,
            uid: 1,
            gid: 1,
            dev: 1,
            ino: 1,
            isFile: () => false,
            isDirectory: () => true,
            isSymbolicLink: () => false,
        };
    }

    async lstat(path) {
        return this.stat(path);
    }

    async readlink(path) {
        throw makeError("ENOSYS", `Symlinks are not supported by the File System Access API: '${path}'`);
    }

    async symlink(target, path) {
        throw makeError("ENOSYS", `Symlinks are not supported by the File System Access API: '${path}'`);
    }
}
