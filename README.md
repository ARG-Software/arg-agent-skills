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
| [angular-ngrx-clean-architecture](skills/angular-ngrx-clean-architecture/SKILL.md) | Clean architecture for Angular apps with NgRx on standalone components and signals. It covers domain/application/infrastructure/feature layers enforced by lint, all HttpClient and browser storage kept in infrastructure, typed action groups, effects, selectors and SignalStores, pure DTO mappers, OnPush components, runtime configuration, Vitest/Jest and Playwright tests, and release-please. | `npx skills add ARG-Software/arg-agent-skills --skill angular-ngrx-clean-architecture` |
| [nx-monorepo-clean-architecture](skills/nx-monorepo-clean-architecture/SKILL.md) | Clean architecture for Nx + pnpm monorepos with NestJS microservices and a Next.js front end. It covers tagged domain/application/infrastructure libraries with enforced module boundaries, CQRS with Result types, one service per bounded context, Kafka/RabbitMQ messaging with versioned contracts, an outbox and idempotent consumers, `nx affected` CI, Docker images, and per-app releases. | `npx skills add ARG-Software/arg-agent-skills --skill nx-monorepo-clean-architecture` |
| [dotnet-clean-architecture](skills/dotnet-clean-architecture/SKILL.md) | Clean architecture for .NET / ASP.NET Core: DDD entities returning Result, vertical-slice CQRS, a transactional outbox, NetArchTest rules, Testcontainers tests, CI, Docker and release-please. | `npx skills add ARG-Software/arg-agent-skills --skill dotnet-clean-architecture` |
| [react-native-clean-architecture](skills/react-native-clean-architecture/SKILL.md) | Clean architecture and measured performance for React Native and Expo: device, network and storage access only in infrastructure, TanStack Query and selector-based stores, lists, animations, startup and bundle work, Turbo Modules, tests, EAS and release-please. Performance guidance inspired by Callstack (MIT). | `npx skills add ARG-Software/arg-agent-skills --skill react-native-clean-architecture` |

More skills are on the way. Watch the repo to hear about new ones.

### The ARG base, in every skill

Every skill includes the same base rules, so your agent works the same way whatever the stack:

- **Clean architecture**: dependencies point inward, and every layer rule is an architecture test.
- **A dependency-free `lib` folder** for reusable helpers, never copied between files.
- **One branch per feature or fix**, and a PR with a Conventional Commit title reviewed by a human. The agent never merges.
- **CI before the default branch**, plus a ruleset that requires it.
- **SemVer releases with release-please**: fix → patch, feat → minor, breaking → major.
- **Secrets out of git**: a tracked `.env.example` and an untracked `.env`.
- **Tests at the owning boundary**, with docs and `AGENTS.md` updated in the same PR.

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
