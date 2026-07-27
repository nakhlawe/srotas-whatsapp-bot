---
name: ajm-release-workflow
description: Standard operating procedure for merging changes and creating a new release of AJM WhatsApp Bot
---

# AJM WhatsApp Bot - Release Workflow

This skill outlines the exact procedure an agent should follow when the user asks to "merge to main", "make a release", or "publish a new version" of the AJM WhatsApp Bot.

## When to use

Use this skill whenever the user requests to:
- Merge current feature branch into `main`
- Create a new production release
- Compile the `.exe` (Windows) and `.dmg` (Mac) installer files via GitHub Actions

## Instructions

Whenever you need to create a release, execute the following steps in order using the terminal:

### 1. Merge into Main
Switch to the `main` branch, ensure it's up to date, and merge the current feature branch into it.
```bash
git checkout main
git pull origin main
git merge <current-feature-branch>
```

### 2. Bump the Version Number
Update the version number in `package.json`. Determine if the changes warrant a `patch` (bug fixes), `minor` (new features), or `major` (breaking changes) version bump. This command will automatically update the file and create a Git tag.
```bash
npm version minor -m "chore: bump version to %s"
```
*(Replace `minor` with `patch` or `major` depending on the scope of the updates).*

### 3. Push to GitHub
Push the merged code and the newly created tag to the remote repository.
```bash
git push origin main
git push --tags
```

### 4. Monitor the Release Pipeline
Inform the user that pushing the `vX.X.X` tag has automatically triggered the `.github/workflows/release.yml` GitHub Actions pipeline.

The pipeline will:
1. Spin up macOS and Windows runner environments.
2. Build the Next.js frontend (`npm run build:ui`).
3. Compile the Electron application using `electron-builder`.
4. Automatically draft and publish a GitHub Release containing `AJMBot.exe` and `AJMBot.dmg`.

Because the dashboard checks the GitHub API, the new download buttons will automatically appear in the user's Settings page once the workflow completes!