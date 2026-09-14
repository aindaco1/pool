#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditDependencies as runAudit } from '../shared/dust-wave-platform/packages/release-core/src/dependency-audit.js';
import { runCommand } from './lib/command-runner.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const targets = { root: repoRoot, worker: fileURLToPath(new URL('../worker/', import.meta.url)) };
const scopes = ['production', 'full'];

export function parseAuditArgs(args) {
  const options = { target: 'all', scope: 'both' };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(target|scope)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error('Use --target=root|worker|all and --scope=production|full|both.');
    const [, key, value] = match;
    const allowed = key === 'target' ? [...Object.keys(targets), 'all'] : [...scopes, 'both'];
    if (!allowed.includes(value)) throw new Error(`Invalid audit ${key}.`);
    options[key] = value;
    seen.add(key);
  }
  return options;
}

export { classifyAuditResult } from '../shared/dust-wave-platform/packages/release-core/src/dependency-audit.js';

export async function auditDependencies({ target, scope, runCommandFn = runCommand, sleepFn, log = console.log }) {
  if (!Object.hasOwn(targets, target) || !scopes.includes(scope)) throw new Error('Invalid audit target or scope.');
  return runAudit({ cwd: targets[target], scope, label: `${target}/${scope}`,
    minimumSeverity: 'moderate', runCommandFn, sleepFn, log });
}

export async function main(args = process.argv.slice(2), auditFn = auditDependencies) {
  const options = parseAuditArgs(args);
  const selectedTargets = options.target === 'all' ? Object.keys(targets) : [options.target];
  const selectedScopes = options.scope === 'both' ? scopes : [options.scope];
  let exitCode = 0;
  // Run every requested scope even if another fails, retaining separate evidence.
  for (const target of selectedTargets) {
    for (const scope of selectedScopes) {
      const result = await auditFn({ target, scope });
      exitCode = Math.max(exitCode, { passed: 0, findings: 1, incomplete: 2 }[result.state]);
    }
  }
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Dependency audit failed: ${error.message}`);
    process.exitCode = 2;
  });
}
