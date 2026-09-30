## Summary

<!-- What changes, in one or two sentences. -->

## Why

<!-- The problem or request behind it. -->

## Skill(s) affected

<!-- e.g. arg-browser-extension. Keep one skill per PR so each changelog stays accurate. -->

## How it was tested

- [ ] `node scripts/sync-base.mjs` (when `shared/` changed)
- [ ] `node scripts/validate-skills.mjs`
- [ ] `npx skills add ./ --list`
- [ ] Installed into a scratch project and tried a realistic request in: <!-- Claude Code / Cursor / Codex / OpenCode / Copilot -->

## Checklist

- [ ] PR title is a Conventional Commit scoped to the skill, e.g. `feat(<skill-name>): ...` or `fix(<skill-name>): ...`
- [ ] Breaking changes are marked with `!` or a `BREAKING CHANGE:` footer
- [ ] New skills are registered in `release-please-config.json`, `.release-please-manifest.json`, and the README Skills table
