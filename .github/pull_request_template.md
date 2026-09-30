## Summary

<!-- What changes, in one or two sentences. -->

## Why

<!-- The problem or request behind it. -->

## Skill(s) affected

<!-- e.g. arg-browser-extension, or "base" for a change in shared/. -->

## How it was tested

- [ ] `node scripts/sync-base.mjs` (when `shared/` changed)
- [ ] `node scripts/validate-skills.mjs`
- [ ] `npx skills add ./ --list`
- [ ] Installed into a scratch project and tried a realistic request in: <!-- Claude Code / Cursor / Codex / OpenCode / Copilot -->

## Checklist

- [ ] PR title is a Conventional Commit, scoped to the skill when it touches one, e.g. `feat(<skill-name>): ...` or `fix(<skill-name>): ...`
- [ ] Breaking changes (such as renaming a skill) are marked with `!` or a `BREAKING CHANGE:` footer
- [ ] New skills have a row in the README Skills table
