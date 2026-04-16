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

const normalize = (p) => p.replace(/\\/g, '/');

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

function onlyClient(p) {
  if (p.startsWith('out/')) return true;
  if (p.includes('.next/static/')) return true;
  if (p.includes('.next/server/app/') && /\.(html|rsc)$/.test(p)) return true;
  return false;
}

async function main() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const files = await walk(root);
    for (const f of files) {
      const fp = normalize(f);
      if (!onlyClient(fp)) continue;
      if (!/\.(js|mjs|cjs|html|json|rsc)$/.test(fp)) continue;
      const body = await readFile(f, 'utf8').catch(() => '');
      for (const key of FORBIDDEN) {
        if (body.includes(key)) hits.push({ file: fp, key });
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
