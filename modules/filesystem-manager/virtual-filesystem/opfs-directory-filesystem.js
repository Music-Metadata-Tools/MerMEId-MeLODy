// A LightningFS drop-in backed by the Origin Private File System (OPFS)
// instead of IndexedDB. OPFS handles implement the same
// FileSystemDirectoryHandle/FileSystemFileHandle interface as the File
// System Access API, so the existing FSADirectoryFilesystem adapter can be
// reused as-is - only the root handle differs (navigator.storage.getDirectory()
// instead of a user-picked window.showDirectoryPicker() result).
//
// navigator.storage.getDirectory() is async, but isomorphic-git constructs
// its `fs` synchronously (`new LightningFS(name)`), so the root handle is
// resolved lazily here on first use instead of in the constructor, and every
// method awaits it before delegating to a FSADirectoryFilesystem instance.

import FSADirectoryFilesystem from "./fsa-directory-filesystem.js";

export default class OPFSDirectoryFilesystem {
    constructor() {
        this.promises = this;
        this._fsPromise = navigator.storage.getDirectory().then(root => new FSADirectoryFilesystem(root));
    }

    async readFile(...args) {
        return (await this._fsPromise).readFile(...args);
    }

    async writeFile(...args) {
        return (await this._fsPromise).writeFile(...args);
    }

    async unlink(...args) {
        return (await this._fsPromise).unlink(...args);
    }

    async readdir(...args) {
        return (await this._fsPromise).readdir(...args);
    }

    async mkdir(...args) {
        return (await this._fsPromise).mkdir(...args);
    }

    async rmdir(...args) {
        return (await this._fsPromise).rmdir(...args);
    }

    async rename(...args) {
        return (await this._fsPromise).rename(...args);
    }

    async stat(...args) {
        return (await this._fsPromise).stat(...args);
    }

    async lstat(...args) {
        return (await this._fsPromise).lstat(...args);
    }

    async readlink(...args) {
        return (await this._fsPromise).readlink(...args);
    }

    async symlink(...args) {
        return (await this._fsPromise).symlink(...args);
    }
}
