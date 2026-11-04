// Regenerates skills/nomba-integration/references/{node,python,php}.md from the
// SDK READMEs on GitHub, so the skills track the SDKs instead of a hand copy.
//
// Usage: node scripts/sync-sdk-references.mjs          (rewrite the files)
//        node scripts/sync-sdk-references.mjs --check  (exit 1 if they're stale)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

const SDKS = [
  { key: "node", repo: "nomba-node", lang: "Node.js / TypeScript", pkg: "@nombaoss/nomba-node", install: "npm install @nombaoss/nomba-node",
    version: async () => (await json("https://registry.npmjs.org/@nombaoss%2Fnomba-node/latest")).version },
  { key: "python", repo: "nomba-python", lang: "Python", pkg: "nomba", install: "pip install nomba",
    version: async () => (await json("https://pypi.org/pypi/nomba/json")).info.version },
  { key: "php", repo: "nomba-php", lang: "PHP", pkg: "nombaoss/nomba-php", install: "composer require nombaoss/nomba-php",
    version: async () => {
      const versions = (await json("https://repo.packagist.org/p2/nombaoss/nomba-php.json")).packages["nombaoss/nomba-php"];
      return versions[0].version.replace(/^v/, "");
    } },
];

async function text(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
const json = async (url) => JSON.parse(await text(url));

function slug(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");
}

function render(sdk, version, readme) {
  // From the quickstart up to the sections that only matter inside the SDK repo.
  const start = readme.search(/^## Quickstart.*$/m);
  const stop = readme.search(/^## (Development|Links|License)\b.*$/m);
  if (start < 0 || stop < 0) throw new Error(`${sdk.repo}: README layout changed; update this script`);
  let body = readme.slice(start, stop).trimEnd();
  // Relative links point into the SDK repo.
  body = body.replace(/\]\((?!https?:\/\/|#)([^)]+)\)/g, `](https://github.com/NombaOSS/${sdk.repo}/blob/main/$1)`);
  const toc = [...body.matchAll(/^## (.+)$/gm)].map(([, h]) => `[${h}](#${slug(h)})`).join(" · ");
  return (
    `# ${sdk.lang} SDK reference (${sdk.pkg})\n\n` +
    `Written against ${sdk.pkg} ${version}. Install with \`${sdk.install}\`. ` +
    `Source and full README: https://github.com/NombaOSS/${sdk.repo}\n\n` +
    `Contents: ${toc}\n\n` +
    "Read the section you need; the money-safety rules in SKILL.md apply on top of this, " +
    "and the nomba-webhooks skill's guidance on timestamp tolerance takes precedence over the examples here.\n\n" +
    `${body}\n`
  );
}

let stale = 0;
for (const sdk of SDKS) {
  const [version, readme] = await Promise.all([
    sdk.version(),
    text(`https://raw.githubusercontent.com/NombaOSS/${sdk.repo}/main/README.md`),
  ]);
  const file = join(root, "skills/nomba-integration/references", `${sdk.key}.md`);
  const next = render(sdk, version, readme);
  const current = readFileSync(file, "utf8");
  if (current === next) {
    console.log(`✓ ${sdk.key}.md is current (${sdk.pkg} ${version})`);
  } else if (check) {
    console.error(`✗ ${sdk.key}.md is stale; run node scripts/sync-sdk-references.mjs`);
    stale++;
  } else {
    writeFileSync(file, next);
    console.log(`updated ${sdk.key}.md (${sdk.pkg} ${version})`);
  }
}
process.exit(stale ? 1 : 0);
