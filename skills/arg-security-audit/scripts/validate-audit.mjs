#!/usr/bin/env node
// Validates the structured output of an arg-security-audit run. No dependencies; Node 18+.
//
//   node validate-audit.mjs <output-dir>
//   node validate-audit.mjs --findings <findings.json> [--ledger <coverage-ledger.json>]
//
// Checks findings.json against the verdict shapes in references/validation-and-reporting.md,
// checks coverage-ledger.json against the status rules in references/reconnaissance.md,
// and cross-checks fingerprints and coverage ids between the two. Exits 1 on any problem.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 1000;
const MAX_UNITS = 10000;
const MAX_DEPTH = 64;
const MAX_REPORTED = 100;

const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
const LOCATION = /^[^\s:][^:]*:\d+(-\d+)?$/;
const LEVELS = ["informational", "low", "medium", "high", "critical"];
const CONFIDENCE = ["low", "medium", "high"];
const TRACE_KINDS = ["entrypoint", "propagation", "sink"];
const CONDITION_KINDS = [
  "authentication_level", "authorization_role", "user_interaction", "system_configuration",
  "network_position", "environment", "data_state", "timing", "third_party",
];
const PRIOR_STATUSES = [
  "none", "prior_confirmed_same_source", "prior_confirmed_changed_source",
  "prior_needs_validation", "prior_rejected", "prior_gap",
];

const VERDICTS = {
  confirmed: {
    required: ["verdict", "fingerprint", "title", "boundary", "coverage_ids", "root_cause", "intended_behavior",
      "trace", "evidence", "conditions", "reproduction", "remediation", "severity", "confidence"],
    optional: [],
  },
  needs_validation: {
    required: ["verdict", "fingerprint", "title", "boundary", "coverage_ids", "claimed_root_cause",
      "trace", "evidence", "blockers", "validation_plan"],
    optional: ["conditions"],
  },
  rejected: {
    required: ["verdict", "fingerprint", "title", "claimed_root_cause", "trace", "evidence", "reason"],
    optional: ["coverage_ids"],
  },
};

const UNIT_FIELDS = ["coverage_id", "surface", "boundary", "attack_class", "companions", "starting_paths", "priority",
  "prior_status", "status", "owner", "reviewed_paths", "checks", "fingerprints", "unresolved", "reason", "attempts"];
const STATUS_RULES = {
  planned: (u) => nonEmptyArray(u.starting_paths) || "needs non-empty starting_paths",
  in_progress: (u) => nonEmptyString(u.owner) || "needs an owner",
  covered: (u) =>
    (nonEmptyString(u.owner) && nonEmptyArray(u.reviewed_paths) && nonEmptyArray(u.checks) && !nonEmptyArray(u.unresolved)) ||
    "needs an owner, non-empty reviewed_paths and checks, and empty unresolved",
  candidate: (u) =>
    (nonEmptyString(u.owner) && nonEmptyArray(u.reviewed_paths) && nonEmptyArray(u.fingerprints)) ||
    "needs an owner, non-empty reviewed_paths and fingerprints",
  blocked: (u) => nonEmptyString(u.reason) || "needs a reason",
  deferred: (u) => nonEmptyString(u.reason) || "needs a reason",
  not_applicable: (u) => nonEmptyString(u.reason) || "needs a reason",
  out_of_scope: (u) => nonEmptyString(u.reason) || "needs a reason",
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const nonEmptyArray = (v) => Array.isArray(v) && v.length > 0;
const stringArray = (v) => Array.isArray(v) && v.every(nonEmptyString);

function depth(value, level = 0) {
  if (level > MAX_DEPTH) return level;
  if (Array.isArray(value)) return Math.max(level, ...value.map((v) => depth(v, level + 1)));
  if (isObject(value)) return Math.max(level, ...Object.values(value).map((v) => depth(v, level + 1)));
  return level;
}

function loadJson(path, problems) {
  if (!existsSync(path)) {
    problems.push(`${path}: file not found`);
    return undefined;
  }
  if (statSync(path).size > MAX_BYTES) {
    problems.push(`${path}: larger than ${MAX_BYTES} bytes`);
    return undefined;
  }
  try {
    const value = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
    if (depth(value) > MAX_DEPTH) {
      problems.push(`${path}: nested deeper than ${MAX_DEPTH} levels`);
      return undefined;
    }
    return value;
  } catch (error) {
    problems.push(`${path}: invalid JSON (${error.message})`);
    return undefined;
  }
}

function checkFields(where, obj, required, optional, problems) {
  for (const key of required) if (!(key in obj)) problems.push(`${where}: missing '${key}'`);
  for (const key of Object.keys(obj)) {
    if (!required.includes(key) && !optional.includes(key)) problems.push(`${where}: field '${key}' is not allowed here`);
  }
}

function checkTrace(where, trace, problems, { needEnds }) {
  if (!nonEmptyArray(trace)) return problems.push(`${where}.trace: must be a non-empty array`);
  trace.forEach((step, i) => {
    const at = `${where}.trace[${i}]`;
    if (!isObject(step)) return problems.push(`${at}: must be an object`);
    checkFields(at, step, ["kind", "location", "description"], [], problems);
    if (!TRACE_KINDS.includes(step.kind)) problems.push(`${at}.kind: must be one of ${TRACE_KINDS.join(", ")}`);
    if (typeof step.location !== "string" || !LOCATION.test(step.location)) problems.push(`${at}.location: must be 'path:line'`);
    if (!nonEmptyString(step.description)) problems.push(`${at}.description: must be a non-empty string`);
  });
  if (needEnds) {
    const kinds = trace.map((s) => s?.kind);
    if (!kinds.includes("entrypoint") || !kinds.includes("sink")) problems.push(`${where}.trace: needs at least one entrypoint and one sink`);
  }
}

function checkEvidence(where, evidence, problems) {
  if (!nonEmptyArray(evidence)) return problems.push(`${where}.evidence: must be a non-empty array`);
  evidence.forEach((item, i) => {
    const at = `${where}.evidence[${i}]`;
    if (!isObject(item)) return problems.push(`${at}: must be an object`);
    checkFields(at, item, ["location", "description"], ["snippet"], problems);
    if (typeof item.location !== "string" || !LOCATION.test(item.location)) problems.push(`${at}.location: must be 'path:line'`);
    if (!nonEmptyString(item.description)) problems.push(`${at}.description: must be a non-empty string`);
    if ("snippet" in item && typeof item.snippet !== "string") problems.push(`${at}.snippet: must be a string`);
  });
}

function checkConditions(where, conditions, problems) {
  if (!Array.isArray(conditions)) return problems.push(`${where}.conditions: must be an array`);
  conditions.forEach((c, i) => {
    const at = `${where}.conditions[${i}]`;
    if (!isObject(c)) return problems.push(`${at}: must be an object`);
    checkFields(at, c, ["kind", "description"], [], problems);
    if (!CONDITION_KINDS.includes(c.kind)) problems.push(`${at}.kind: must be one of ${CONDITION_KINDS.join(", ")}`);
    if (!nonEmptyString(c.description)) problems.push(`${at}.description: must be a non-empty string`);
  });
}

function checkConfirmed(where, r, problems) {
  for (const key of ["root_cause", "intended_behavior"]) if (!nonEmptyString(r[key])) problems.push(`${where}.${key}: must be a non-empty string`);
  checkTrace(where, r.trace, problems, { needEnds: true });
  checkEvidence(where, r.evidence, problems);
  checkConditions(where, r.conditions, problems);

  const rep = r.reproduction;
  if (!isObject(rep)) problems.push(`${where}.reproduction: must be an object`);
  else {
    checkFields(`${where}.reproduction`, rep, ["attacker", "steps", "observed_result"], ["payloads"], problems);
    if (!nonEmptyString(rep.attacker)) problems.push(`${where}.reproduction.attacker: must be a non-empty string`);
    if (!nonEmptyArray(rep.steps) || !stringArray(rep.steps)) problems.push(`${where}.reproduction.steps: must be a non-empty array of strings`);
    if ("payloads" in rep && !stringArray(rep.payloads)) problems.push(`${where}.reproduction.payloads: must be an array of strings`);
    if (!nonEmptyString(rep.observed_result)) problems.push(`${where}.reproduction.observed_result: must be a non-empty string`);
  }

  const fix = r.remediation;
  if (!isObject(fix)) problems.push(`${where}.remediation: must be an object`);
  else {
    checkFields(`${where}.remediation`, fix, ["strategy"], ["code_changes"], problems);
    if (!nonEmptyString(fix.strategy)) problems.push(`${where}.remediation.strategy: must be a non-empty string`);
    if ("code_changes" in fix) {
      if (!Array.isArray(fix.code_changes)) problems.push(`${where}.remediation.code_changes: must be an array`);
      else fix.code_changes.forEach((c, i) => {
        const at = `${where}.remediation.code_changes[${i}]`;
        if (!isObject(c)) return problems.push(`${at}: must be an object`);
        checkFields(at, c, ["location", "change"], [], problems);
        if (typeof c.location !== "string" || !LOCATION.test(c.location)) problems.push(`${at}.location: must be 'path:line'`);
        if (!nonEmptyString(c.change)) problems.push(`${at}.change: must be a non-empty string`);
      });
    }
  }

  const sev = r.severity;
  if (!isObject(sev)) problems.push(`${where}.severity: must be an object`);
  else {
    checkFields(`${where}.severity`, sev, ["likelihood", "impact", "overall"], [], problems);
    for (const key of ["likelihood", "impact", "overall"]) {
      if (!LEVELS.includes(sev[key])) problems.push(`${where}.severity.${key}: must be one of ${LEVELS.join(", ")}`);
    }
  }

  const conf = r.confidence;
  if (!isObject(conf)) problems.push(`${where}.confidence: must be an object`);
  else {
    checkFields(`${where}.confidence`, conf, ["score", "rationale"], [], problems);
    if (!CONFIDENCE.includes(conf.score)) problems.push(`${where}.confidence.score: must be one of ${CONFIDENCE.join(", ")}`);
    if (!nonEmptyString(conf.rationale)) problems.push(`${where}.confidence.rationale: must be a non-empty string`);
  }
}

function checkNeedsValidation(where, r, problems) {
  if (!nonEmptyString(r.claimed_root_cause)) problems.push(`${where}.claimed_root_cause: must be a non-empty string`);
  checkTrace(where, r.trace, problems, { needEnds: false });
  checkEvidence(where, r.evidence, problems);
  if ("conditions" in r) checkConditions(where, r.conditions, problems);
  if (!nonEmptyArray(r.blockers) || !stringArray(r.blockers)) problems.push(`${where}.blockers: must be a non-empty array of strings`);
  const plan = r.validation_plan;
  if (!isObject(plan)) problems.push(`${where}.validation_plan: must be an object`);
  else {
    checkFields(`${where}.validation_plan`, plan, [], ["local", "deployment"], problems);
    for (const key of ["local", "deployment"]) {
      if (key in plan && !stringArray(plan[key])) problems.push(`${where}.validation_plan.${key}: must be an array of strings`);
    }
    if (!nonEmptyArray(plan.local) && !nonEmptyArray(plan.deployment)) {
      problems.push(`${where}.validation_plan: needs at least one non-empty 'local' or 'deployment' list`);
    }
  }
}

function checkRejected(where, r, problems) {
  if (!nonEmptyString(r.claimed_root_cause)) problems.push(`${where}.claimed_root_cause: must be a non-empty string`);
  checkTrace(where, r.trace, problems, { needEnds: false });
  checkEvidence(where, r.evidence, problems);
  if (!nonEmptyString(r.reason)) problems.push(`${where}.reason: must be a non-empty string`);
}

/** Returns a list of problems in a parsed findings.json value. */
export function validateFindings(findings, label = "findings.json") {
  const problems = [];
  if (!Array.isArray(findings)) return [`${label}: must be a top-level JSON array`];
  if (findings.length > MAX_RECORDS) return [`${label}: more than ${MAX_RECORDS} records`];

  const seen = new Set();
  let previous = null;
  findings.forEach((r, i) => {
    const where = `${label}[${i}]`;
    if (!isObject(r)) return problems.push(`${where}: must be an object`);
    const shape = VERDICTS[r.verdict];
    if (!shape) return problems.push(`${where}.verdict: must be one of ${Object.keys(VERDICTS).join(", ")}`);
    checkFields(where, r, shape.required, shape.optional, problems);

    if (typeof r.fingerprint !== "string" || !FINGERPRINT.test(r.fingerprint)) {
      problems.push(`${where}.fingerprint: must match ${FINGERPRINT}`);
    } else {
      if (seen.has(r.fingerprint)) problems.push(`${where}.fingerprint: duplicate '${r.fingerprint}'`);
      if (previous !== null && r.fingerprint < previous) problems.push(`${where}.fingerprint: records must be sorted by fingerprint`);
      seen.add(r.fingerprint);
      previous = r.fingerprint;
    }
    if (!nonEmptyString(r.title)) problems.push(`${where}.title: must be a non-empty string`);
    if ("boundary" in r && !nonEmptyString(r.boundary)) problems.push(`${where}.boundary: must be a non-empty string`);
    if ("coverage_ids" in r) {
      const needsOne = r.verdict !== "rejected";
      if (!stringArray(r.coverage_ids) || (needsOne && r.coverage_ids.length === 0)) {
        problems.push(`${where}.coverage_ids: must be ${needsOne ? "a non-empty" : "an"} array of strings`);
      }
    }

    if (r.verdict === "confirmed") checkConfirmed(where, r, problems);
    else if (r.verdict === "needs_validation") checkNeedsValidation(where, r, problems);
    else checkRejected(where, r, problems);
  });
  return problems;
}

/** Returns a list of problems in a parsed coverage-ledger.json value. */
export function validateLedger(ledger, label = "coverage-ledger.json") {
  const problems = [];
  if (!Array.isArray(ledger)) return [`${label}: must be a top-level JSON array`];
  if (ledger.length > MAX_UNITS) return [`${label}: more than ${MAX_UNITS} units`];

  const seen = new Set();
  ledger.forEach((u, i) => {
    const where = `${label}[${i}]`;
    if (!isObject(u)) return problems.push(`${where}: must be an object`);
    checkFields(where, u, ["coverage_id", "surface", "boundary", "attack_class", "status"], UNIT_FIELDS, problems);
    for (const key of ["surface", "boundary", "attack_class"]) {
      if (!nonEmptyString(u[key])) problems.push(`${where}.${key}: must be a non-empty string`);
    }
    const escape = (v) => String(v).replaceAll("::", "%3A%3A");
    const expected = `${escape(u.surface)}::${escape(u.boundary)}::${escape(u.attack_class)}`;
    if (u.coverage_id !== expected) problems.push(`${where}.coverage_id: must be '${expected}'`);
    if (seen.has(u.coverage_id)) problems.push(`${where}.coverage_id: duplicate '${u.coverage_id}'`);
    seen.add(u.coverage_id);

    for (const key of ["companions", "starting_paths", "reviewed_paths", "checks", "fingerprints", "unresolved"]) {
      if (key in u && !stringArray(u[key])) problems.push(`${where}.${key}: must be an array of strings`);
    }
    if ("fingerprints" in u && Array.isArray(u.fingerprints)) {
      u.fingerprints.forEach((f) => { if (!FINGERPRINT.test(f)) problems.push(`${where}.fingerprints: '${f}' must match ${FINGERPRINT}`); });
    }
    if ("priority" in u && !(Number.isInteger(u.priority) && u.priority >= 1 && u.priority <= 5)) {
      problems.push(`${where}.priority: must be an integer from 1 to 5`);
    }
    if ("prior_status" in u && !PRIOR_STATUSES.includes(u.prior_status)) {
      problems.push(`${where}.prior_status: must be one of ${PRIOR_STATUSES.join(", ")}`);
    }
    if ("owner" in u && u.owner !== null && typeof u.owner !== "string") problems.push(`${where}.owner: must be a string or null`);
    if ("reason" in u && u.reason !== null && typeof u.reason !== "string") problems.push(`${where}.reason: must be a string or null`);
    if ("attempts" in u && !(Array.isArray(u.attempts) && u.attempts.every(isObject))) problems.push(`${where}.attempts: must be an array of objects`);

    const rule = STATUS_RULES[u.status];
    if (!rule) problems.push(`${where}.status: must be one of ${Object.keys(STATUS_RULES).join(", ")}`);
    else {
      const result = rule(u);
      if (result !== true) problems.push(`${where}: status '${u.status}' ${result}`);
    }
  });
  return problems;
}

/** Cross-checks fingerprints and coverage ids between the two files. */
export function crossCheck(findings, ledger) {
  if (!Array.isArray(findings) || !Array.isArray(ledger)) return [];
  const problems = [];
  const fingerprints = new Set(findings.filter(isObject).map((r) => r.fingerprint));
  const coverageIds = new Set(ledger.filter(isObject).map((u) => u.coverage_id));
  findings.forEach((r, i) => {
    if (!isObject(r) || !Array.isArray(r.coverage_ids)) return;
    for (const id of r.coverage_ids) {
      if (!coverageIds.has(id)) problems.push(`findings.json[${i}].coverage_ids: '${id}' is not a unit in coverage-ledger.json`);
    }
  });
  ledger.forEach((u, i) => {
    if (!isObject(u) || !Array.isArray(u.fingerprints)) return;
    for (const f of u.fingerprints) {
      if (!fingerprints.has(f)) problems.push(`coverage-ledger.json[${i}].fingerprints: '${f}' is not a record in findings.json`);
    }
  });
  return problems;
}

function parseArgs(argv) {
  const args = { findings: null, ledger: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--findings") args.findings = argv[++i];
    else if (argv[i] === "--ledger") args.ledger = argv[++i];
    else if (!argv[i].startsWith("--")) {
      args.findings = join(argv[i], "findings.json");
      args.ledger = join(argv[i], "coverage-ledger.json");
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.findings) {
    console.error("Usage: node validate-audit.mjs <output-dir>\n       node validate-audit.mjs --findings <file> [--ledger <file>]");
    process.exit(2);
  }
  const problems = [];
  const findings = loadJson(args.findings, problems);
  if (findings !== undefined) problems.push(...validateFindings(findings));
  let ledger;
  if (args.ledger) {
    ledger = loadJson(args.ledger, problems);
    if (ledger !== undefined) problems.push(...validateLedger(ledger));
  }
  if (findings !== undefined && ledger !== undefined) problems.push(...crossCheck(findings, ledger));

  if (problems.length > 0) {
    const shown = problems.slice(0, MAX_REPORTED);
    const more = problems.length > shown.length ? `\n  ... and ${problems.length - shown.length} more` : "";
    console.error(`Audit output invalid (${problems.length}):\n${shown.map((p) => `  - ${p}`).join("\n")}${more}`);
    process.exit(1);
  }
  const counts = Object.keys(VERDICTS).map((v) => `${findings.filter((r) => r.verdict === v).length} ${v}`).join(", ");
  console.log(`Audit output valid: ${counts}${ledger ? `; ${ledger.length} ledger unit(s)` : ""}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
