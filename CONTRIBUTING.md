# Want to contribute?

That's awesome, thank you!

The following is a set of guidelines for contributing to MerMEId-MeLODy. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.


## Code of conduct

Please note that this project is released with a [Contributor Code of Conduct]. By participating in this project you agree to abide by its terms.


## Questions and discussions

The best way to initially get in touch is via [GitHub Discussions].


## Bug reports and feature requests

If you've noticed a bug or have a feature request, please open a [GitHub issue] (well, you might want to look through the open issues before to avoid creating duplicates)! It's generally best if you get confirmation of your bug or approval for your feature request this way before starting to code.

If you're looking for a good place to start, check out the issues labelled [good first issue] — these are tasks that are well-scoped and don't require deep familiarity with the codebase.


## Create a branch and make your changes

If this is something you think you can fix, create a branch directly on GitHub. A good branch name references the issue you're working on (e.g. `issue-33`).

You can edit files directly in the GitHub web interface on your branch. Please keep in mind that there should be a ticket for the task you want to accomplish before you start.

Commit messages should be short and written in the imperative: *"Add person converter"*, not *"Added"* or *"Adding"*.


## Make a Pull Request

Once your changes are ready, open a [Pull Request] against `main` on GitHub.

The CI pipeline runs automatically when you open or update a PR. Unit tests run for all contributors; integration tests run for contributors with repository access. All tests must pass before a PR can be merged.


## Merging a PR (maintainers only)

A PR can only be merged into `main` by a maintainer if:

* All CI checks pass (unit tests on every PR, integration tests for contributors with repository access).
* It has been approved by at least one maintainer. If a maintainer opened the PR, one extra approval is needed.
* It has no requested changes.
* It has no conflicts with current `main`.

Any maintainer is allowed to merge a PR if all of these conditions are met. We use **squash and merge** to keep the commit history on `main` clean.


[Contributor Code of Conduct]: CODE_OF_CONDUCT.md
[good first issue]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/issues?q=state%3Aopen%20label%3A%22good%20first%20issue%22
[GitHub Discussions]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/discussions
[GitHub issue]: https://github.com/Music-Metadata-Tools/MerMEId-MeLODy/issues/new
[Pull Request]: https://help.github.com/articles/creating-a-pull-request
