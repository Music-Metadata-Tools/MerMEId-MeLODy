export default class GitDataSourceInterface {
    constructor() {
        this._filesystem_name = "mermeid";
    }

    get filesystem_name() {
        return this._filesystem_name;
    }

    // Check if the repository is public
    is_public_repository() {}

    // Clones the repository in the browser,
    // or the data to be stored in browser for remote repos
    create_repository() { }

    delete_repository() { }

    // List the branches of a repository.
    list_branches() { }

    // Loads the remote repository
    load_repository() { }

    list_files(parent_dir) { }

    save_file() { }

    commit_file() { }
}
