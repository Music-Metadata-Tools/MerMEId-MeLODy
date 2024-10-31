class GitDataSourceInterface {
    // Clones the repository in the browser,
    // or the data to be stored in browser for remote repos
    create_repository() { }

    delete_repository() { }

    // Loads the remote repository
    load_repository() { }

    list_files(parent_dir) { }

    save_file() { }

    commit_file() { }
}
