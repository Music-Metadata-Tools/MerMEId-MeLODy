# MerMEId


## About

This is the new version of [MerMEId](https://github.com/Edirom/MerMEId).

## Setup

To use the tool, you can either click the link provided [here](https://music-metadata-tools.github.io/MerMEId-MeLODy/) in the repository or download the entire repository and use it locally. To work with data, you’ll need a repository where the data can be stored and edited. You can create such a repository using the following [template](https://github.com/Music-Metadata-Tools/MerMEId-MeLODy-Template). Import scripts for various data formats will be added later. The template itself contains some sample data, which you can delete. Once a repository has been created for the data, you can open the editor and get started.


## Getting Started

### Adding a Repository
1. Click the "Add repository" button (folder-plus icon). It will open a window with a 'Add repository' dialog.
2. Enter a repository folder name. This can be any name you want and it is only used to display your repository in the file tree of the editor. 
3. Enter the repository URL. You'll find it on the main page of your personal git repository. Click on the Code Button and Copy the Link under Clone with HTTPS (must end with '.git' and start with 'http').
4. Enter your username and personal access token. This can be either a project access token or a personal access token.
5. Click on 'Next', when everything is filled out.
6. Select the branch you want to clone and click on 'Clone' to finish.
7. Click "Clone" to finish. When you are successful, you can see your cloned repository on the left side in the 'Repositories' bar.

## Working with Files

### Creating New Entities
1. To make sure, that you save your files in the right repository, click on the name of your cloned repository. It shall be highlighted after clicking (see on the screenshot).
1. Click the "New" button
2. Select the type of entity you want to create (Person, Place, Work, etc.)
3. A new empty form will open based on the selected entity type.

### Navigation
- To make sure, that you save your files in the right repository, click on the name of your cloned repository. It shall be highlighted after clicking (see on the screenshot).
- Use the file tree on the left to browse through different entity folders (persons, places, works, etc.). You can click on the arrow to unfold the repository or the underlying folders.
- Click on any file that ends with .ttl to open it in the editor.

### Editing Files
- Fill in the form fields according to the entity type
- After you entered changes in a form, the Save button will appear blue and an unsaved changes indicator (dot) appears.
- Click "Save" to store your changes. This will add your changes or new created files to the 'Share files' section. It won't upload your changes, but will save your changes in your local system. Be sure to share your changes soon with the git repository.
- Use "Undo" (arrow-counterclockwise icon) next to the Save button to revert unsaved changes.

### Sharing Changes
1. Modified and saved () files appear in the "Share files" section
2. To upload your changes to the git repository you need to select the files you want to share
3. Click the "Share files" button (cloud-upload icon) to push changes to the remote repository
4. Use the "Unstage files" button (arrow-counter-clockwise) to remove files from the sharing queue. This will undo all your saved changes to the selected file(s)

### Repository Operations
- Delete files using the "Remove entity" button (file-minus icon). First, you have to click on the entity that needs to be deleted. After clicking on "Remove entity", the file will disappear from the Repository and appear in the "Share files" bar with '-deleted' in the file name. To share this deletion with the Git repository, you need to check the box next to the deleted file and click on 'Share files' (cloud-upload icon)
- Rename repositories using the "Rename repository" button (folder icon). You can use this action to rename your repository in your browser. This change is only for the name, that is displayed in your browser.
- Remove repositories using the "Remove repository" button (folder-minus icon). First, click on the repository you want to remove from your browser. After this you can click on the Remove repository button. This action won't delete your repository, it only disappears from your local system.


### Repository Synchronization
- Click the "Synchronize repository" button (arrow-clockwise icon) to pull latest changes
- The editor will warn you if you have unsaved or unshared changes. If this is the case, you need to either share your changes with the remote repository first, or undo your changes before synchronizing with the remote repository.


## Funding

This tool is being developed as part of the DFG funded project ["MerMEIding to the future"](https://gepris.dfg.de/gepris/projekt/528785591).


![DFG-Logo](https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/blob/main/images/dfg_logo_schriftzug_weiss.png)

