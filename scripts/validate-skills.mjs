#!/usr/bin/env node
// Checks every skills/<name>/SKILL.md so a new skill cannot be merged half-registered.
// Dependency-free on purpose: CI runs it with plain `node`, no install step.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { syncBase } from "./sync-base.mjs";

const SKILLS_DIR = "skills";
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_LINES = 500;
const VERSION_LINE = /^\s+version:\s*\d+\.\d+\.\d+\s*#\s*x-release-please-version\s*$/m;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const config = readJson("release-please-config.json");
const manifest = readJson(".release-please-manifest.json");
const readme = readFileSync("README.md", "utf8");

/** Markdown files under `dir`, recursively. */
function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/** Relative links in `file` (outside fenced code) whose target does not exist. */
function brokenLinks(file) {
  const text = readFileSync(file, "utf8").replace(/^```[\s\S]*?^```/gm, "");
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^([a-z]+:|#)/i.test(target))
    .filter((target) => !existsSync(normalize(join(dirname(file), decodeURI(target.split("#")[0])))))
    .map((target) => `${file}: broken link '${target}'`);
}

/** Top-level `key: value` pairs of the YAML frontmatter; nested keys are ignored. */
function frontmatter(content) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  if (!block) return null;
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const pair = /^([a-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return { raw: block[1], fields };
}

function problemsFor(folder) {
  const packagePath = `${SKILLS_DIR}/${folder}`;
  const skillFile = `${packagePath}/SKILL.md`;
  if (!existsSync(skillFile)) return [`${packagePath}: missing SKILL.md`];

  const content = readFileSync(skillFile, "utf8");
  const parsed = frontmatter(content);
  if (!parsed) return [`${skillFile}: missing '---' frontmatter at the top of the file`];

  const { name, description } = parsed.fields;
  const problems = [];
  if (!name) problems.push("frontmatter has no 'name'");
  else {
    if (name !== folder) problems.push(`name '${name}' must equal the folder name '${folder}'`);
    if (!NAME_PATTERN.test(name) || name.length > MAX_NAME_LENGTH) {
      problems.push(`name '${name}' must be lowercase letters, digits and single hyphens, at most ${MAX_NAME_LENGTH} characters`);
    }
  }
  if (!description) problems.push("frontmatter has no 'description'");
  else if (description.length > MAX_DESCRIPTION_LENGTH) {
    problems.push(`description is ${description.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}`);
  }
  for (const [field, value] of [["name", name], ["description", description]]) {
    // An unquoted YAML value cannot contain ": " or " #"; strict parsers (the skills CLI) reject or truncate it.
    if (value && !/^["']/.test(value) && /: | #/.test(value)) {
      problems.push(`${field} contains ": " or " #", which breaks YAML; rephrase it or quote the value`);
    }
  }
  if (!VERSION_LINE.test(parsed.raw)) {
    problems.push("metadata needs 'version: X.Y.Z # x-release-please-version'");
  }

  const lineCount = content.split(/\r?\n/).length;
  if (lineCount > MAX_SKILL_LINES) {
    problems.push(`SKILL.md has ${lineCount} lines; keep it at most ${MAX_SKILL_LINES} and move detail into references/`);
  }
  if (!/^## Stack profile\s*$/m.test(content)) problems.push("SKILL.md needs a '## Stack profile' section (verify, lib folder, arch-test tool, config module, release type)");

  const releasePackage = config.packages?.[packagePath];
  if (!releasePackage) problems.push(`release-please-config.json has no packages["${packagePath}"] entry`);
  else {
    if (releasePackage.component !== folder) problems.push(`release-please-config.json component must be '${folder}'`);
    if (!releasePackage["extra-files"]?.includes("SKILL.md")) {
      problems.push(`release-please-config.json packages["${packagePath}"] must list "SKILL.md" in extra-files`);
    }
  }
  if (!(packagePath in manifest)) problems.push(`.release-please-manifest.json has no "${packagePath}" entry`);
  if (!readme.includes(`(${packagePath}/SKILL.md)`)) problems.push(`README.md Skills table has no row linking ${packagePath}/SKILL.md`);

  return [...problems.map((problem) => `${skillFile}: ${problem}`), ...markdownFiles(packagePath).flatMap(brokenLinks)];
}

const folders = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const problems = folders.flatMap(problemsFor);
for (const path of Object.keys(config.packages ?? {})) {
  if (!folders.includes(path.replace(`${SKILLS_DIR}/`, ""))) problems.push(`release-please-config.json lists '${path}', which does not exist`);
}

problems.push(...syncBase({ check: true }).problems);
problems.push(...["README.md", "CONTRIBUTING.md"].flatMap(brokenLinks));

if (folders.length === 0) problems.push(`no skills found under ${SKILLS_DIR}/`);

if (problems.length > 0) {
  console.error(`Skill validation failed (${problems.length}):\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log(`All ${folders.length} skill(s) valid: ${folders.join(", ")}`);
