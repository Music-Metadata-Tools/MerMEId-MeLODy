# Want to contribute?

That's awesome, thank you!

The following is a set of guidelines for contributing to MerMEId-MeLODy. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.


## Code of conduct

Please note that this project is released with a [Contributor Code of Conduct]. By participating in this project you agree to abide by its terms.


## Questions and discussions

The best way to initially get in touch is via [GitHub Discussions].


## Bug reports and feature requests

If you've noticed a bug or have a feature request, please open a [GitHub issue] (well, you might want to look through the open issues before to avoid creating duplicates)! It's generally best if you get confirmation of your bug or approval for your feature request this way before starting to code.

If you're looking for a good place to start, check out the issues labelled [good first issue], these are tasks that are well-scoped and don't require deep familiarity with the codebase.


## Run the tool locally

The tool is a static HTML/JS app that runs directly in the browser, no build step needed. To run it locally, serve the repository root with any local web server, for example:

```bash
python3 -m http.server 8080
```
Alternatively, use the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension in VS Code.
Then open `http://localhost:8080` in your browser. 


### Running the tests

If you are working on core functionality (filesystem management, git operations), you should also run the test suite locally. This requires [Node.js](https://nodejs.org) v22 or later.

```bash
npm install
npm test
```

For integration tests (clone, pull, push against a real repository) you need a test repository and a GitHub personal access token. Create a repository from the [MerMEId-MeLODy-Template] and then create a `.env` file in the MerMEId-MeLODy project root:

```
GIT_TOKEN=<your GitHub personal access token>
GIT_USERNAME=<your GitHub username>
TEST_REPO_URL=<URL of your test repository>
```

You start all tests with `npm install`. Integration tests are automatically skipped if these variables are not set.


## Create a branch and make your changes

**If you have write access to the repository**, create a branch directly on GitHub. A good branch name references the issue you're working on (e.g. `issue-33`).

**If you are an external contributor**, fork the repository first by clicking "Fork" in the top right on GitHub. Then create a branch in your fork. When you open a Pull Request, GitHub will automatically offer to open it against `main` of the original repository.

You can edit files directly in the GitHub web interface on your branch. Please keep in mind that there should be a ticket for the task you want to accomplish before you start.

Commit messages should be short and written in the imperative: *"Add person converter"*, not *"Added"* or *"Adding"*.


## Make a Pull Request

Once your changes are ready, open a [Pull Request] against `main` on GitHub.

Unit tests run automatically for all contributors when a PR is opened or updated.


## Merging a PR (maintainers only)

A PR can only be merged into `main` by a maintainer if:

* Unit tests pass (runs automatically for all PRs)
* It has been approved by at least one maintainer.
* It has no requested changes.
* It has no conflicts with current `main`.

If the PR touches core functionality (filesystem management, git operations), a maintainer must also run the integration tests manually before merging:

Go to **Actions → Integration Tests → Run workflow**, enter `refs/pull/42/head` as the ref (replace `42` with the PR number), and run.

Any maintainer is allowed to merge a PR if all of these conditions are met. We use **squash and merge** to keep the commit history on `main` clean.


[MerMEId-MeLODy-Template]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy-Template
[Contributor Code of Conduct]: CODE_OF_CONDUCT.md
[good first issue]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/issues?q=state%3Aopen%20label%3A%22good%20first%20issue%22
[GitHub Discussions]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/discussions
[GitHub issue]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/issues/new
[Pull Request]: https://help.github.com/articles/creating-a-pull-request
