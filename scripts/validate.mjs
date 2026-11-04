// Structural checks for the skills repo. No dependencies.
//
// - Every skills/<name>/SKILL.md has YAML frontmatter with `name` (matching the
//   folder) and a non-empty `description`, and stays under 500 lines.
// - Every relative Markdown link in the skills resolves to a file.
// - Each skill that links references/sdk-setup.md has a copy identical to
//   shared/sdk-setup.md. `--fix` writes the copies.
// - Every eval case has prompt.md, case.yaml and at least one grader.
// - The SDK calls the skills mention (in code blocks, and as `resource.method(`
//   in prose and tables) are collected into build/api-calls.json, which
//   scripts/check-api-* verify against the published SDKs.
//
// Usage: node scripts/validate.mjs [--fix]

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fix = process.argv.includes("--fix");
const problems = [];
const fail = (msg) => problems.push(msg);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const skillsDir = join(root, "skills");
const skills = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory());
const shared = readFileSync(join(root, "shared/sdk-setup.md"), "utf8");
const calls = { node: new Set(), python: new Set(), php: new Set() };
const RESOURCES = [
  "auth", "accounts", "virtualAccounts", "virtual_accounts", "checkout", "transfers",
  "transactions", "terminals", "directDebits", "direct_debits", "bills",
  "globalPayout", "global_payout", "globalCollection", "global_collection",
].join("|");

for (const skill of skills) {
  const dir = join(skillsDir, skill);
  const skillMd = join(dir, "SKILL.md");
  if (!existsSync(skillMd)) {
    fail(`${skill}: missing SKILL.md`);
    continue;
  }
  const text = readFileSync(skillMd, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) fail(`${skill}: SKILL.md has no frontmatter`);
  else {
    const name = fm[1].match(/^name:\s*(.+)$/m)?.[1].trim();
    if (name !== skill) fail(`${skill}: frontmatter name "${name}" doesn't match the folder`);
    const desc = fm[1].match(/^description:\s*>-\n((?:  .*\n?)+)/m)?.[1] ?? fm[1].match(/^description:\s*(.+)$/m)?.[1];
    if (!desc || desc.trim().length < 50) fail(`${skill}: description missing or too short`);
    if (desc && desc.replace(/\s+/g, " ").length > 1024) fail(`${skill}: description over 1024 characters`);
  }
  if (text.split("\n").length > 500) fail(`${skill}: SKILL.md is over 500 lines`);

  const setup = join(dir, "references/sdk-setup.md");
  if (text.includes("references/sdk-setup.md")) {
    if (fix) writeFileSync(setup, shared);
    else if (!existsSync(setup) || readFileSync(setup, "utf8") !== shared) {
      fail(`${skill}: references/sdk-setup.md is missing or stale (run node scripts/validate.mjs --fix)`);
    }
  }

  for (const file of walk(dir).filter((f) => f.endsWith(".md") && !f.includes("/evals/"))) {
    const md = readFileSync(file, "utf8");
    for (const [, target] of md.matchAll(/\]\(((?!https?:|mailto:|#)[^)\s]+)\)/g)) {
      const path = target.split("#")[0];
      if (path && !existsSync(join(dirname(file), path))) {
        fail(`${relative(root, file)}: broken link ${target}`);
      }
    }
    // Prose and tables: camelCase names are Node and PHP, snake_case are Python.
    const prose = md.replace(/```[\s\S]*?```/g, "");
    for (const [, res, method] of prose.matchAll(new RegExp(`\\b(${RESOURCES})\\.(\\w+)\\(`, "g"))) {
      const call = `${res}.${method}`;
      if (/_/.test(call)) calls.python.add(call);
      else if (/[A-Z]/.test(call)) {
        calls.node.add(call);
        calls.php.add(call);
      } else for (const set of Object.values(calls)) set.add(call); // e.g. transfers.get
    }
    for (const [, lang, body] of md.matchAll(/```(\w+)[^\n]*\n([\s\S]*?)```/g)) {
      if (["ts", "js", "typescript", "javascript"].includes(lang)) {
        for (const [, res, method] of body.matchAll(/\bnomba\.(\w+)\.(\w+)\(/g)) calls.node.add(`${res}.${method}`);
      } else if (lang === "python") {
        for (const [, res, method] of body.matchAll(/\bnomba\.(\w+)\.(\w+)\(/g)) calls.python.add(`${res}.${method}`);
      } else if (lang === "php") {
        for (const [, res, method] of body.matchAll(/\$nomba->(\w+)->(\w+)\(/g)) calls.php.add(`${res}.${method}`);
      }
    }
  }

  const evals = join(dir, "evals");
  if (existsSync(evals)) {
    for (const c of readdirSync(evals)) {
      const cd = join(evals, c);
      if (!statSync(cd).isDirectory()) continue;
      for (const f of ["prompt.md", "case.yaml"]) {
        if (!existsSync(join(cd, f))) fail(`${skill}/evals/${c}: missing ${f}`);
      }
      const graders = existsSync(join(cd, "graders")) ? readdirSync(join(cd, "graders")) : [];
      if (!graders.some((g) => g.endsWith(".md"))) fail(`${skill}/evals/${c}: no graders`);
    }
  }
}

mkdirSync(join(root, "build"), { recursive: true });
const out = Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, [...v].sort()]));
writeFileSync(join(root, "build/api-calls.json"), JSON.stringify(out, null, 2));

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(
  `✓ ${skills.length} skills valid; SDK calls found: node ${out.node.length}, python ${out.python.length}, php ${out.php.length}`
);
