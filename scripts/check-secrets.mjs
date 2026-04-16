#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [
  'DATACRAZY_API_TOKEN',
  'YAYFORMS_WEBHOOK_SECRET',
  'WEBHOOK_AUTH_MODE',
  'YAYFORMS_FIELD_MAP',
];

const SCAN_ROOTS = ['.next/static', '.next/server/app', 'out'];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const p = join(dir, e);
    const s = await stat(p);
    if (s.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

function onlyClient(path) {
  return path.includes(`${'.next'}/static`) || path.startsWith('out');
}

async function main() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const files = await walk(root);
    for (const f of files) {
      if (!onlyClient(f)) continue;
      if (!/\.(js|mjs|cjs|html|json)$/.test(f)) continue;
      const body = await readFile(f, 'utf8').catch(() => '');
      for (const key of FORBIDDEN) {
        if (body.includes(key)) hits.push({ file: f, key });
      }
    }
  }
  if (hits.length > 0) {
    console.error('SECRET LEAK DETECTED in client bundle:');
    for (const h of hits) console.error(`  ${h.file} -> ${h.key}`);
    process.exit(1);
  }
  console.log('check:secrets OK — no forbidden env keys found in client bundle.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
