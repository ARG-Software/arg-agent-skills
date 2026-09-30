# ARG Agent Skills

Production-tested agent skills from **[ARG Software](https://arg.software)**. They work with Claude Code, Cursor, Codex, OpenCode, GitHub Copilot, and every other agent that supports the open `SKILL.md` format.

Each skill packages how we build scalable software, systems that endure as you scale (architecture, tests, git workflow, releases), so your coding agent follows the same standards on every task.

```bash
npx skills add ARG-Software/arg-agent-skills
```

## Skills

| Skill | What it does | Install |
| --- | --- | --- |
| [arg-browser-extension](skills/arg-browser-extension/SKILL.md) | Scalable Manifest V3 browser extensions (Chrome/Firefox/Safari), including extensions that run AI on the device. It covers domain/application/infrastructure/presentation layers enforced by architecture tests, a dependency-free `src/lib`, feature/fix branches, reviewed PRs, CI before merge, `.env` handling, and SemVer releases with release-please. | `npx skills add ARG-Software/arg-agent-skills --skill arg-browser-extension` |
| [arg-angular](skills/arg-angular/SKILL.md) | Scalable Angular apps with NgRx on standalone components and signals. It covers domain/application/infrastructure/feature layers enforced by lint, all HttpClient and browser storage kept in infrastructure, typed action groups, effects, selectors and SignalStores, pure DTO mappers, OnPush components, runtime configuration, Vitest/Jest and Playwright tests, and release-please. | `npx skills add ARG-Software/arg-agent-skills --skill arg-angular` |
| [arg-nx-monorepo](skills/arg-nx-monorepo/SKILL.md) | Scalable Nx + pnpm monorepos with NestJS microservices and a Next.js front end. It covers tagged domain/application/infrastructure libraries with enforced module boundaries, CQRS with Result types, one service per bounded context, Kafka/RabbitMQ messaging with versioned contracts, an outbox and idempotent consumers, `nx affected` CI, Docker images, and per-app releases. | `npx skills add ARG-Software/arg-agent-skills --skill arg-nx-monorepo` |
| [arg-dotnet](skills/arg-dotnet/SKILL.md) | Scalable .NET / ASP.NET Core back ends: DDD entities returning Result, vertical-slice CQRS, a transactional outbox, NetArchTest rules, Testcontainers tests, CI, Docker and release-please. | `npx skills add ARG-Software/arg-agent-skills --skill arg-dotnet` |
| [arg-react-native](skills/arg-react-native/SKILL.md) | Scalable React Native and Expo apps with measured performance: device, network and storage access only in infrastructure, TanStack Query and selector-based stores, lists, animations, startup and bundle work, Turbo Modules, tests, EAS and release-please. Performance guidance inspired by Callstack (MIT). | `npx skills add ARG-Software/arg-agent-skills --skill arg-react-native` |
| [arg-web-audit](skills/arg-web-audit/SKILL.md) | Audit a site or your own web app the way ARG Architect does: passive evidence, security headers, Core Web Vitals, payload, efficiency, architecture, DOM, accessibility and AI readiness, coverage-aware scoring, and reports that name every offender and its fix. | `npx skills add ARG-Software/arg-agent-skills --skill arg-web-audit` |
| [arg-code-review](skills/arg-code-review/SKILL.md) | Review a PR, branch or diff in any stack against the ARG base: layer boundaries, architecture tests, lib reuse, policy constants, unknown-versus-failure, tests at the owning boundary, secrets, docs, release impact and CI. Verified findings ranked by severity with file:line and a fix; never approves or merges. | `npx skills add ARG-Software/arg-agent-skills --skill arg-code-review` |
| [arg-mcp-server](skills/arg-mcp-server/SKILL.md) | Scalable MCP servers that expose your app's existing use cases to AI agents: map tasks to tools, keep tools as thin adapters, OAuth for remote servers, real MCP tests, and client setup for every agent. | `npx skills add ARG-Software/arg-agent-skills --skill arg-mcp-server` |

More skills are on the way. Watch the repo to hear about new ones.

### The ARG base, in every skill

Every skill includes the same base rules, so your agent works the same way whatever the stack:

- **Built to scale**: business rules never depend on frameworks, so the system endures as it grows, and architecture tests enforce every layer rule.
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
npx skills add ARG-Software/arg-agent-skills --skill arg-browser-extension

# Install all ARG skills
npx skills add ARG-Software/arg-agent-skills --skill '*'

# Target a specific agent, or install globally (user-wide) instead of per project
npx skills add ARG-Software/arg-agent-skills --skill arg-browser-extension -a cursor
npx skills add ARG-Software/arg-agent-skills --skill arg-browser-extension -g
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

## Versions and changelog

The repo has one version for all skills, in [`version.txt`](version.txt), with one [`CHANGELOG.md`](CHANGELOG.md) and releases tagged `v<version>`. Versions follow [Semantic Versioning](https://semver.org): fixes bump the patch, new guidance bumps the minor, and changes that alter what the agent does in an incompatible way (such as renaming a skill) bump the major.

`npx skills add` installs the skills from `main`. To update an installed skill, run the same command again.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; it explains how to add a new skill and how the version is set.

## About ARG Software

[ARG Software](https://arg.software) builds and reviews web products, browser extensions, and AI-powered software. These skills come from our own projects. For example, `arg-browser-extension` is distilled from **ARG Architect**, our browser extension for architecture, security, performance, and AI-readiness audits, which runs a multilingual AI model entirely on the device.

Need help building or reviewing your product? [Get in touch](https://arg.software).

## License

[MIT](LICENSE)
