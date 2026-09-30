#!/usr/bin/env node
// Copies the shared ARG base into every skill, so each installed skill carries it:
//   shared/base-core.md -> between the arg-base markers in skills/<name>/SKILL.md
//   shared/arg-base.md  -> skills/<name>/references/arg-base.md
// `--check` changes nothing and exits 1 when any copy drifted (validate-skills.mjs runs it in CI).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SKILLS_DIR = "skills";
const START = "<!-- arg-base:start -->";
const END = "<!-- arg-base:end -->";
const GENERATED_NOTE = "<!-- Generated from shared/arg-base.md by scripts/sync-base.mjs. Edit the shared file, not this copy. -->";

const normalize = (text) => text.replace(/\r\n/g, "\n");
const read = (path) => normalize(readFileSync(path, "utf8"));

function expectedCopies(folder, core, reference) {
  const skillFile = `${SKILLS_DIR}/${folder}/SKILL.md`;
  const content = read(skillFile);
  const start = content.indexOf(START);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    return { problems: [`${skillFile}: missing the ${START} / ${END} markers`], copies: [] };
  }
  const skill = `${content.slice(0, start + START.length)}\n${core.trimEnd()}\n${content.slice(end)}`;
  return {
    problems: [],
    copies: [
      { path: skillFile, current: content, expected: skill },
      {
        path: `${SKILLS_DIR}/${folder}/references/arg-base.md`,
        current: existsSync(`${SKILLS_DIR}/${folder}/references/arg-base.md`) ? read(`${SKILLS_DIR}/${folder}/references/arg-base.md`) : null,
        expected: `${GENERATED_NOTE}\n\n${reference.trimEnd()}\n`,
      },
    ],
  };
}

/** Problems when `check` is true; otherwise writes every stale copy and returns the paths it wrote. */
export function syncBase({ check }) {
  const core = read("shared/base-core.md");
  const reference = read("shared/arg-base.md");
  const folders = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`${SKILLS_DIR}/${entry.name}/SKILL.md`))
    .map((entry) => entry.name);

  const problems = [];
  const written = [];
  for (const folder of folders) {
    const result = expectedCopies(folder, core, reference);
    problems.push(...result.problems);
    for (const copy of result.copies.filter((item) => item.current !== item.expected)) {
      if (check) problems.push(`${copy.path}: out of sync with shared/ (run: node scripts/sync-base.mjs)`);
      else {
        mkdirSync(copy.path.slice(0, copy.path.lastIndexOf("/")), { recursive: true });
        writeFileSync(copy.path, copy.expected);
        written.push(copy.path);
      }
    }
  }
  return { problems, written };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const { problems, written } = syncBase({ check });
  if (problems.length > 0) {
    console.error(`ARG base sync ${check ? "check " : ""}failed (${problems.length}):\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log(check ? "ARG base is in sync in every skill." : written.length > 0 ? `Updated:\n${written.map((path) => `  - ${path}`).join("\n")}` : "Nothing to update.");
}
