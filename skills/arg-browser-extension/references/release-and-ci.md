# CI, releases and store packages for an extension

This file extends sections 2.1 and 2.5 of [arg-base.md](arg-base.md) with the extension-specific parts.

## CI: the `verify` job

```yaml
  verify:
    name: verify
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test:architecture
      - run: npm test
      - run: npm run build
      - run: npm run build:firefox
      - run: npx web-ext lint --source-dir dist-firefox
```

Remove the two Firefox steps when Firefox is not a target. `package.json` needs these scripts: `lint`, `test`, `test:architecture`, `build`, and optionally `build:firefox`, `package` and `package:firefox`.

## release-please: every manifest carries the version

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "bump-minor-pre-major": true,
      "include-component-in-tag": false,
      "extra-files": [
        { "type": "json", "path": "manifest.json", "jsonpath": "$.version" },
        { "type": "json", "path": "manifest.firefox.json", "jsonpath": "$.version" }
      ]
    }
  }
}
```

`.release-please-manifest.json`: `{ ".": "0.0.0" }`.

## Release workflow with the zips attached

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - id: release
        uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

      - if: ${{ steps.release.outputs.release_created }}
        uses: actions/checkout@v4
      - if: ${{ steps.release.outputs.release_created }}
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - if: ${{ steps.release.outputs.release_created }}
        run: npm ci && npm run package && npm run package:firefox
      - if: ${{ steps.release.outputs.release_created }}
        run: gh release upload ${{ steps.release.outputs.tag_name }} release/*.zip
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`package` is `npm run build && web-ext build --source-dir dist --artifacts-dir release`, and `package:firefox` is the same for `dist-firefox`.

## Extension-specific rules

- **Store-compatible versions only.** Chrome and Firefox manifests accept 1 to 4 dot-separated integers, so never use `-beta` or `-rc` suffixes. For a beta channel, publish a separate beta listing.
- **Version parity test.** `package.json`, `manifest.json` and `manifest.firefox.json` must carry the same version, so a missing `extra-files` entry fails before release:
  ```js
  import { readFileSync } from "node:fs";

  const versionOf = (path) => JSON.parse(readFileSync(path, "utf8")).version;

  test("package.json and every manifest carry the same version", () => {
    const expected = versionOf("package.json");
    expect(["manifest.json", "manifest.firefox.json"].map(versionOf)).toEqual([expected, expected]);
  });
  ```
- **Store upload is a human step**, or a separate, reviewed workflow. Upload the zip from the GitHub release after checking it. The store listing's "what's new" text comes from the changelog.
- **Permission changes are breaking for users.** A new required permission makes the browser disable the extension until the user accepts it. Mark it `feat!` (or ask the user), and prefer optional permissions.
- **Build-time values in CI** come from repository secrets written into `.env` in the build step. Remember that every bundled value is public.
