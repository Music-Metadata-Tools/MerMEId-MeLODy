import VirtualFilesystem from "../filesystem-manager/virtual-filesystem/index.js";

class FilesystemService {
    constructor() {
        if (FilesystemService.instance) {
            return FilesystemService.instance;
        }
        this.filesystem = new VirtualFilesystem();
        FilesystemService.instance = this;
    }

    getInstance() {
        return this.filesystem;
    }
}

export const filesystemService = new FilesystemService();