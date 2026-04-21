import { readFileSync } from 'node:fs';

import { buildFulfillmentReport, buildPledgeLedgerReport } from './reports.js';

function parseArgs(argv) {
  const parsed = {
    type: 'pledge',
    platformFulfiller: ''
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--type') {
      parsed.type = String(argv[index + 1] || 'pledge').trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg === '--platform-fulfiller') {
      parsed.platformFulfiller = String(argv[index + 1] || '').trim();
      index += 1;
    }
  }

  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const input = readFileSync(0, 'utf8').trim();
const payload = input ? JSON.parse(input) : {};
const pledges = Array.isArray(payload?.pledges) ? payload.pledges : [];

const report = args.type === 'fulfillment'
  ? buildFulfillmentReport(pledges, {
    platformFulfiller: args.platformFulfiller || payload?.platformFulfiller || 'Platform'
  })
  : buildPledgeLedgerReport(pledges);

process.stdout.write(report.csv);
