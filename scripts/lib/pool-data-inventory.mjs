import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const POOL_DATA_INVENTORY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/pool-data-inventory.json'
);

export function loadPoolDataInventory(inventoryPath = POOL_DATA_INVENTORY_PATH) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  if (Number(inventory.schemaVersion || 0) !== 1 || !Array.isArray(inventory.families)) {
    throw new Error('Pool data inventory uses an unsupported schema.');
  }
  const ids = new Set();
  for (const family of inventory.families) {
    for (const field of ['id', 'binding', 'type', 'prefix', 'sensitivity', 'restorePhase', 'validation', 'classification', 'restoreDefault']) {
      if (family[field] === undefined || family[field] === null || String(family[field]).trim() === '') {
        throw new Error(`Pool data inventory family ${family.id || '<unknown>'} is missing ${field}.`);
      }
    }
    if (ids.has(family.id)) throw new Error(`Duplicate Pool data inventory family: ${family.id}`);
    ids.add(family.id);
  }
  return inventory;
}

export function poolDataFamilies(options = {}) {
  const inventory = options.inventory || loadPoolDataInventory();
  return inventory.families.filter((family) => (
    (!options.binding || family.binding === options.binding) &&
    (!options.type || family.type === options.type) &&
    (!options.classification || family.classification === options.classification)
  ));
}

export function poolKvBackupFamilies(options = {}) {
  return poolDataFamilies({ ...options, type: 'kv' })
    .filter((family) => family.classification !== 'ephemeral-quarantined');
}

export function poolKvValueBackupFamilies(options = {}) {
  return poolKvBackupFamilies(options).filter((family) => family.backupValues === true);
}

export function poolQuarantinedKvFamilies(options = {}) {
  return poolDataFamilies({ ...options, type: 'kv' })
    .filter((family) => family.classification === 'ephemeral-quarantined');
}

export function findPoolDataFamily(prefix, options = {}) {
  return poolDataFamilies(options).find((family) => family.prefix === prefix) || null;
}

export function classifyPoolKvKey(binding, key, options = {}) {
  const matches = poolDataFamilies({ ...options, binding, type: 'kv' })
    .filter((family) => key.startsWith(family.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0] || null;
}
