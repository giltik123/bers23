#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertCanonicalReproductionBytes } from './kandinsky-conditioning-reproduction-contract.mjs';

const MAX_EVIDENCE_BYTES = 1024 * 1024;
const args = parseArgs(process.argv.slice(2));
const candidate = path.resolve(args.record);
const stat = fs.lstatSync(candidate);
if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('reproduction record must be a real regular file');
if (stat.size < 1 || stat.size > MAX_EVIDENCE_BYTES) throw new Error('reproduction record size is outside the accepted bound');
const bytes = fs.readFileSync(candidate);
const record = assertCanonicalReproductionBytes(bytes);
process.stdout.write(`${JSON.stringify({
  status: 'VERIFIED_RESEARCH_REPRODUCTION_EVIDENCE',
  candidateId: record.candidateId,
  sha256: createHash('sha256').update(bytes).digest('hex'),
})}\n`);

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--record' || !argv[1] || argv[1].startsWith('--')) {
    throw new Error('usage: kandinsky-conditioning-reproduction-verify.mjs --record <path>');
  }
  return Object.freeze({ record: argv[1] });
}
