import http from "https://unpkg.com/isomorphic-git@beta/http/web/index.js"

// Initialize isomorphic-git with a file system
window.fs = new LightningFS("mermeid");
window.pfs = window.fs.promises;

window.dir = "/mermeid_sample_data";

// check if dir exists
try {
    await pfs.stat(dir);
} catch (error) {
    console.log("clone the repo");
    await pfs.mkdir(dir);
    await git.clone({
        fs,
        http,
        dir,
        corsProxy: 'https://cors.isomorphic-git.org',
        url: 'https://gitlab.rlp.net/adwmainz/nfdi4culture/cdmd/mermeid-sample-data.git',
        ref: 'main',
        singleBranch: true,
        depth: 1
    });
}
let files = await pfs.readdir(dir + "/data");

// display the files
const lazyItem = document.querySelector("sl-tree-item");

for (const file of files) {
    const treeItem = document.createElement("sl-tree-item");
    treeItem.innerText = file;
    lazyItem.append(treeItem);
}
