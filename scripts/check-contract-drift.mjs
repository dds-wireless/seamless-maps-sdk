#!/usr/bin/env node
/**
 * Fail if the committed contract has drifted from the one production serves.
 *
 * ADR-053 decision 2: the SDK lives in a different repository from the gateway, so
 * co-location cannot keep the two honest. Diffing against the deployed document
 * instead is stronger - it tests the contract customers actually receive.
 *
 * `GET /openapi.json` is unauthenticated by design (ADR-052 decision 4), so this
 * needs no API key and is safe to run on a fork's pull request.
 *
 *   node scripts/check-contract-drift.mjs [--url https://gateway.example] [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://seamlessmaps-api.ddswireless.net';
const LOCAL = fileURLToPath(new URL('../openapi.json', import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const baseUrl = (flag('url') ?? process.env['SEAMLESS_GATEWAY_URL'] ?? DEFAULT_URL).replace(/\/+$/, '');
const write = args.includes('--write');
const target = `${baseUrl}/openapi.json`;

/** Stable key order, so a re-serialised document compares as text. */
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  }
  return value;
};

/** Every path at which the two documents disagree, capped so output stays readable. */
const diffPaths = (a, b, path = '$', found = []) => {
  if (found.length >= 40) return found;
  const bothObjects =
    a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b);
  if (!bothObjects) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      found.push(
        `${path}\n      committed: ${JSON.stringify(a) ?? '(absent)'}\n      live:      ${JSON.stringify(b) ?? '(absent)'}`,
      );
    }
    return found;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    diffPaths(a[key], b[key], `${path}.${key}`, found);
  }
  return found;
};

const fail = (message) => {
  console.error(`\n  contract drift check FAILED\n\n  ${message}\n`);
  process.exit(1);
};

let live;
try {
  const response = await fetch(target, { headers: { accept: 'application/json' } });
  if (!response.ok) fail(`${target} returned ${response.status} ${response.statusText}.`);
  live = await response.json();
} catch (cause) {
  fail(`could not fetch ${target}: ${cause instanceof Error ? cause.message : String(cause)}`);
}

const committed = JSON.parse(readFileSync(LOCAL, 'utf8'));
const differences = diffPaths(canonical(committed), canonical(live));

if (differences.length === 0) {
  console.log(
    `  contract matches ${target} (${Object.keys(committed.paths ?? {}).length} paths, version ${committed.info?.version})`,
  );
  process.exit(0);
}

if (write) {
  writeFileSync(LOCAL, `${JSON.stringify(live, null, 2)}\n`);
  console.log(
    `  updated openapi.json from ${target} (${differences.length} change${differences.length === 1 ? '' : 's'}).`,
  );
  console.log('  Now run `pnpm generate:types` and review the diff before committing.');
  process.exit(0);
}

fail(
  `${target} no longer matches the committed openapi.json.\n\n  ` +
    differences.map((d) => `- ${d}`).join('\n  ') +
    '\n\n  Refresh with `pnpm contract:drift --write`, then `pnpm generate:types`.',
);
