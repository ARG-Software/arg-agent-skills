# Module boundaries: tags, lint rules and checks

## Project tags

Every `project.json` has exactly one `type:*` tag and one `scope:*` tag:

```json
{
  "name": "application",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "packages/application/src",
  "projectType": "library",
  "tags": ["type:application", "scope:shared"],
  "targets": {}
}
```

| Project | Tags |
| --- | --- |
| `apps/client-api` | `type:app`, `scope:client` |
| `apps/billing-service` | `type:app`, `scope:billing` |
| `apps/frontend` | `type:app`, `scope:frontend` |
| `packages/domain` (context folders inside) | `type:domain`, `scope:shared` |
| `packages/application` | `type:application`, `scope:shared` |
| `packages/infrastructure/persistence` | `type:infrastructure`, `scope:shared` |
| `packages/contracts/billing` | `type:contracts`, `scope:billing` |
| `packages/shared/utils` | `type:shared`, `scope:shared` |

When the team grows, or a context gets its own lifecycle, split the layer libraries per context (`packages/billing/domain`, `packages/billing/application`, ...) and tag them `scope:billing`. Then the scope rules below stop one context's code from reaching into another's.

## Root ESLint config

```js
// eslint.config.mjs
import nx from "@nx/eslint-plugin";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  { ignores: ["**/dist", "**/node_modules", "**/.next"] },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs"],
    plugins: { "unused-imports": unusedImports },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          banTransitiveDependencies: true,
          allow: [],
          depConstraints: [
            // layers
            {
              sourceTag: "type:domain",
              onlyDependOnLibsWithTags: ["type:shared"],
              bannedExternalImports: ["@nestjs/*", "typeorm", "kafkajs", "amqplib", "ioredis", "bull*"],
            },
            {
              sourceTag: "type:application",
              onlyDependOnLibsWithTags: ["type:domain", "type:shared", "type:contracts"],
              bannedExternalImports: ["typeorm", "kafkajs", "amqplib", "ioredis", "bull*", "winston", "pino"],
            },
            {
              sourceTag: "type:infrastructure",
              onlyDependOnLibsWithTags: ["type:application", "type:domain", "type:shared", "type:contracts"],
            },
            { sourceTag: "type:contracts", onlyDependOnLibsWithTags: ["type:shared"] },
            { sourceTag: "type:shared", onlyDependOnLibsWithTags: ["type:shared"] },
            {
              sourceTag: "type:app",
              onlyDependOnLibsWithTags: ["type:domain", "type:application", "type:infrastructure", "type:contracts", "type:shared"],
            },
            // bounded contexts: add one entry per context
            { sourceTag: "scope:billing", onlyDependOnLibsWithTags: ["scope:billing", "scope:shared"] },
            { sourceTag: "scope:client", onlyDependOnLibsWithTags: ["scope:client", "scope:shared", "scope:billing"] },
          ],
        },
      ],
    },
  },
];
```

Notes:
- **`scope:client` may depend on `scope:billing`** in the example only because `client-api` consumes billing's contracts. Keep it that narrow. If a context needs another context's application code, the boundary is wrong.
- **Never add `{ sourceTag: "*", onlyDependOnLibsWithTags: ["*"] }`.** Nx generators create it, and it disables every rule above.
- **Deep imports** (`@org/application/src/internal/...`) are rejected by the plugin. Export what other projects need from the library's `index.ts`.
- Each project's own `eslint.config.mjs` spreads the root config and adds only project-specific rules (for example, Next.js rules in `apps/frontend`).

## Tag-coverage check

Module-boundary lint silently ignores projects without tags, so CI also checks that no project is untagged. Add it as a workspace target (`nx run workspace:check-tags`) or a plain script:

```js
// tools/check-tags.mjs
import { execFileSync } from "node:child_process";

const projects = JSON.parse(execFileSync("pnpm", ["nx", "show", "projects", "--json"], { encoding: "utf8" }));
const problems = projects.flatMap((name) => {
  const project = JSON.parse(execFileSync("pnpm", ["nx", "show", "project", name, "--json"], { encoding: "utf8" }));
  const tags = project.tags ?? [];
  const missing = ["type:", "scope:"].filter((prefix) => tags.filter((tag) => tag.startsWith(prefix)).length !== 1);
  return missing.map((prefix) => `${name}: needs exactly one '${prefix}*' tag (has ${JSON.stringify(tags)})`);
});

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`All ${projects.length} projects are tagged.`);
```

On Windows, call it with `shell: true` or run it through `pnpm exec`.

## Visualising and reviewing

- `pnpm nx graph` shows the dependency graph. Review it when adding a context: arrows must follow the layer table.
- `pnpm nx show project <name>` prints a project's targets and tags.
- In review, a new `depConstraints` entry or a new `allow` pattern needs a reason in the PR body.
