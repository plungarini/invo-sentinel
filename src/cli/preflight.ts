import { join } from 'path';
import { loadConfig } from '../config/env.js';
import { ConfigStore } from '../services/config-store.js';
import { runPreflightChecks, type PreflightCheck } from '../services/preflight-checks.js';
import { resolveRootDir } from '../services/root-dir.js';

const ROOT_DIR = resolveRootDir(import.meta.url);

function report(checks: PreflightCheck[]): void {
  const ok = checks.filter(c => c.status === 'ok').length;
  const fail = checks.filter(c => c.status === 'fail').length;
  console.log(JSON.stringify({
    summary: { ok, warn: checks.filter(c => c.status === 'warn').length, fail, total: checks.length, ready: fail === 0 },
    checks,
  }, null, 2));
}

async function main() {
  const checks: PreflightCheck[] = [];

  let config;
  try {
    const configStore = new ConfigStore(join(ROOT_DIR, 'data/sentinel.db'));
    config = await loadConfig(configStore);
    if (!config.configured) {
      checks.push({ name: 'env_vars', status: 'fail', detail: `Missing required config: ${config.missing.join(', ')} - set via the dashboard's setup wizard or .env (see .env.example)` });
      report(checks);
      process.exit(1);
    }
    checks.push({ name: 'env_vars', status: 'ok', detail: 'INVO_REFRESH_TOKEN, HL_AGENT_KEY, WALLET_ADDRESS all set' });
  } catch (e: any) {
    checks.push({ name: 'env_vars', status: 'fail', detail: e.message });
    report(checks);
    process.exit(1);
  }

  checks.push(...await runPreflightChecks(config));

  report(checks);
  if (checks.some(c => c.status === 'fail')) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
