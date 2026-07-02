# Google Play Upload Scripts

These scripts use the official Google Play Developer API through the Node `googleapis` client.

By default, the uploader reads `./playscript.json` if it exists.

## Available Commands

- `pnpm play:upload:internal -- --aab <path> --serviceAccount <path-to-service-account.json>`
- `pnpm play:upload:alpha -- --aab <path> --serviceAccount <path-to-service-account.json>`
- `pnpm play:upload:beta -- --aab <path> --serviceAccount <path-to-service-account.json>`
- `pnpm play:upload:production -- --aab <path> --serviceAccount <path-to-service-account.json>`
- `pnpm play:upload:track -- --track <custom-track> --aab <path> --serviceAccount <path-to-service-account.json>`

## Config File

Default config file: `playscript.json` in the repo root.

You can also pass a custom file:

- `pnpm play:upload:internal -- --config ./my-play-config.json`

Supported keys in JSON:

- `aabPath` or `PLAY_AAB_PATH`
- `serviceAccount` or `serviceAccountPath` or `PLAY_SERVICE_ACCOUNT_JSON`
- `packageName` or `PLAY_PACKAGE_NAME`
- `status` or `PLAY_RELEASE_STATUS`
- `rollout` or `PLAY_ROLLOUT`
- `releaseName` or `PLAY_RELEASE_NAME`
- `releaseNotes` or `PLAY_RELEASE_NOTES`
- `releaseNotesLang` or `PLAY_RELEASE_NOTES_LANG`
- `releaseNotesFile` or `PLAY_RELEASE_NOTES_FILE`
- `changesNotSentForReview` or `PLAY_CHANGES_NOT_SENT_FOR_REVIEW`

Example `playscript.json`:

```json
{
  "aabPath": "apps/Android/source/app-release.aab",
  "serviceAccount": "C:/keys/play-service-account.json",
  "packageName": "com.niquewrld.studenthub",
  "status": "completed",
  "releaseNotes": "Bug fixes and improvements",
  "releaseNotesLang": "en-US",
  "changesNotSentForReview": false
}
```

## Required

- `--aab`: path to `.aab` file.
- `--config`: path to config JSON file (default is `playscript.json` if present).
- service account JSON key file path, one of:
  - `--serviceAccount <path>`
  - `PLAY_SERVICE_ACCOUNT_JSON`
  - `GOOGLE_APPLICATION_CREDENTIALS`

## Optional

- `--packageName` (default: `com.niquewrld.studenthub`)
- `--status draft|completed|halted|inProgress` (default: `completed`)
- `--rollout 0.2` (required if status is `inProgress`)
- `--releaseName "My Release"`
- `--releaseNotes "Bug fixes and improvements"`
- `--releaseNotesLang en-US`
- `--releaseNotesFile ./release-notes.json`
- `--changesNotSentForReview true`

## Release Notes File Format

`--releaseNotesFile` should point to a JSON array:

```json
[
  {
    "language": "en-US",
    "text": "Bug fixes and performance improvements"
  }
]
```
