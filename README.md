# ARG Agent Skills

Production-tested agent skills from **[ARG Software](https://arg.software)**. They work with Claude Code, Cursor, Codex, OpenCode, GitHub Copilot, and every other agent that supports the open `SKILL.md` format.

Each skill packages how we actually build software (architecture, tests, git workflow, releases) so your coding agent follows the same standards on every task.

```bash
npx skills add ARG-Software/arg-agent-skills
```

## Skills

| Skill | What it does | Install |
| --- | --- | --- |
| [browser-extension-clean-architecture](skills/browser-extension-clean-architecture/SKILL.md) | Clean architecture for Manifest V3 browser extensions (Chrome/Firefox/Safari), including extensions that run AI on the device. It covers domain/application/infrastructure/presentation layers enforced by architecture tests, a dependency-free `src/lib`, feature/fix branches, reviewed PRs, CI before merge, `.env` handling, and SemVer releases with release-please. | `npx skills add ARG-Software/arg-agent-skills --skill browser-extension-clean-architecture` |

More skills are on the way. Watch the repo to hear about new ones.

## Install

The [`skills` CLI](https://github.com/vercel-labs/skills) finds the skills in this repo and installs them into the right folder for your agent.

```bash
# Pick skills interactively
npx skills add ARG-Software/arg-agent-skills

# See every skill in this repo
npx skills add ARG-Software/arg-agent-skills --list

# Install one skill
npx skills add ARG-Software/arg-agent-skills --skill browser-extension-clean-architecture

# Install all ARG skills
npx skills add ARG-Software/arg-agent-skills --skill '*'

# Target a specific agent, or install globally (user-wide) instead of per project
npx skills add ARG-Software/arg-agent-skills --skill browser-extension-clean-architecture -a cursor
npx skills add ARG-Software/arg-agent-skills --skill browser-extension-clean-architecture -g
```

### Manual install

Each skill is a folder with a `SKILL.md`. Copy `skills/<skill-name>/` into your agent's skills folder:

| Agent | Project | User-wide |
| --- | --- | --- |
| Claude Code | `.claude/skills/<skill-name>/` | `~/.claude/skills/<skill-name>/` |
| Codex | `.codex/skills/<skill-name>/` | `~/.codex/skills/<skill-name>/` |
| OpenCode | `.opencode/skills/<skill-name>/` | `~/.config/opencode/skills/<skill-name>/` |
| GitHub Copilot | `.github/skills/<skill-name>/` | - |
| Cursor | `.cursor/skills/<skill-name>/`, or paste the rules into `.cursor/rules/` / `AGENTS.md` | - |

Paths change as the agents evolve. The `npx skills` CLI always uses the current ones.

## Versions and changelogs

Each skill has its own version and changelog:

- Its version is in the `metadata.version` field of its `SKILL.md`.
- Its changelog is `skills/<skill-name>/CHANGELOG.md`.
- Its releases are tagged `<skill-name>-v<version>`.

Versions follow [Semantic Versioning](https://semver.org): fixes bump the patch, new guidance bumps the minor, and changes that alter what the agent does in an incompatible way bump the major.

To update an installed skill, run the same `npx skills add` command again.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it explains how to add a new skill and how releases work.

## About ARG Software

[ARG Software](https://arg.software) builds and reviews web products, browser extensions, and AI-powered software. These skills come from our own projects. For example, `browser-extension-clean-architecture` is distilled from **ARG Architect**, our browser extension for architecture, security, performance, and AI-readiness audits, which runs a multilingual AI model entirely on the device.

Need help building or reviewing your product? [Get in touch](https://arg.software).

## License

[MIT](LICENSE)
