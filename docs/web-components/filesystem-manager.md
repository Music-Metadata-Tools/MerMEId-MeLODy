# adwlm-filesystem-manager

## Description

Allows creating of a connection to a Git repository, in order to edit the data.

## API

* `entries` - the entries to be displayed.

## Events

## State

The state is composed of the following metadata: `(repo)folder-path - page - entry` .

## Problems to be solved

* sorting of the entries, lexicographically or according to an algorithm

## Ideas

* types of filesystems:

    - `virtual`, which implies the cloning of the Git repository in memory and in `IndexedDB`, as it is provided by `isomorphic-git` and other similar libraries;


    - `local`, which implies cloning of the Git repository in the local machine's filesystem, as it is provided by `File System Access API` (for an implementation that works only for Chromium, until a wider adoption, see [Reading and writing files and directories with the browser-fs-access library](https://developer.chrome.com/docs/capabilities/browser-fs-access)), or simply store there only the edited files, until commiting them to the remote Git repository (tests are to be done, to see which alternative works);

    - `remote`, which implies using the remote Git repository as a file system, as it is provided by the Git clients for `GitLab` or `GitHub`.
