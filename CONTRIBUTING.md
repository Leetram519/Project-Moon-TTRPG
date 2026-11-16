# Contributing

Thank you for your interest in contributing to the Project Moon TTRPG system.

Contributions of all sizes are welcome, whether they're bug reports, documentation improvements, bug fixes, or new features.

## Before You Start

If you're planning a larger feature or significant change, please open an issue first so we can discuss the design before development begins.

If you'd like to work on an existing issue, leave a comment and ask to be assigned to it. This helps avoid duplicated work.

## Development Setup

This repository is divided into two directories:

* `src/` contains the development source files (SCSS, YAML configuration, templates, etc.).
* `dist/` contains the compiled files used by FoundryVTT.

### Requirements

* Node.js 12 or later
* npm

### Build

Install dependencies:

```bash
npm install
```

Compile the system:

```bash
npm run build
```

For active development, start the watch task:

```bash
npm run gulp
```

Any changes made in `src/` will automatically be rebuilt into `dist/`.

## Installing the Development Build

After building, symlink or copy the `dist/` directory into your Foundry User Data directory.

Example:

```bash
ln -s ./projectmoonttrpg/dist $FoundryUserDataPath/systems/projectmoonttrpg
```

Replace `$FoundryUserDataPath` with the path to your Foundry User Data directory.

## Pull Requests

Please:

* Create a feature fork & branch instead of committing directly to `main`.
* Keep pull requests focused on a single feature or fix.
* Reference any related issue in the PR description (for example, `Closes #42`).
* Test your changes before submitting.
* Update documentation if your changes modify the system's behavior noticeably.

Pull requests may receive review feedback before being merged.

## Coding Style

There are no strict formatting requirements beyond keeping the existing style consistent.

When possible:

* Prefer clear, readable and maintainable code over clever solutions.
* Keep commits focused and logically grouped.
* Avoid unrelated formatting changes in the same pull request.

### Dialogs

New dialogs use the dark and gold `pm-window` theme in `src/styles/src/global/application/_pm-window.scss`. The end of that file holds the shared content classes the themed dialog templates are built on, so most themed dialogs need no styles of their own.

* For a fixed set of choices, render a template from `src/templates/dialog/` and open it with `waitForWindowChoice` from `src/module/apps/dialog-wait.js`, using `cancelButton()` and `confirmButton()`. `waitForWindowChoice` puts the default button last, and Enter presses it.
* Do not start a dialog template with a `<form>`. DialogV2 already wraps its content in one, and the browser drops a form nested inside another.

## Reporting Bugs

When reporting a bug, please include:

* FoundryVTT version
* System version
* Browser (if applicable)
* Steps to reproduce
* Expected behavior
* Actual behavior
* Any console errors or screenshots

The more information provided, the easier it is to reproduce and fix the issue.

## Code of Conduct

Please be respectful and constructive when interacting with other contributors. The goal is to build a welcoming project for everyone.
