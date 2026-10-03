#!/usr/bin/env node
// Keeps apps/web/src/app/domain an exact copy of apps/api/src/domain (ADR 0003).
//   node scripts/domain-sync.mjs          -> check (exit 1 if the copies differ)
//   node scripts/domain-sync.mjs --write  -> copy api -> web
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'apps/api/src/domain');
const target = join(root, 'apps/web/src/app/domain');

function files(dir) {
  if (!existsSync(dir)) return new Map();
  const out = new Map();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    out.set(relative(dir, full), createHash('sha256').update(readFileSync(full)).digest('hex'));
  }
  return out;
}

if (process.argv.includes('--write')) {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  console.log(`domain: copied ${relative(root, source)} -> ${relative(root, target)}`);
  process.exit(0);
}

const a = files(source);
const b = files(target);
const problems = [];
for (const [name, hash] of a) {
  if (!b.has(name)) problems.push(`missing in web: ${name}`);
  else if (b.get(name) !== hash) problems.push(`differs: ${name}`);
}
for (const name of b.keys()) if (!a.has(name)) problems.push(`only in web: ${name}`);

if (problems.length > 0) {
  console.error('domain: apps/web/src/app/domain is out of sync with apps/api/src/domain');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Run `pnpm sync:domain` and commit the result.');
  process.exit(1);
}
console.log(`domain: ${a.size} files in sync`);
