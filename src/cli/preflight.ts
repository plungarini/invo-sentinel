import { loadConfig } from '../config/env.js';
import { InvoClient } from '../clients/invo-client.js';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';

interface Check {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

async function main() {
  const checks: Check[] = [];
  const push = (name: string, status: Check['status'], detail: string) => checks.push({ name, status, detail });

  let config;
  try {
    config = loadConfig();
    push('env_vars', 'ok', 'INVO_REFRESH_TOKEN, HL_AGENT_KEY, WALLET_ADDRESS all set');
  } catch (e: any) {
    push('env_vars', 'fail', e.message);
    console.log(JSON.stringify({ summary: { ok: checks.filter(c => c.status === 'ok').length, total: checks.length, ready: false }, checks }, null, 2));
    process.exit(1);
  }

  const invo = new InvoClient(config.invoRefreshToken);
  const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);

  try {
    const days = invo.refreshTokenDaysRemaining();
    push('invo_refresh_expiry', days > 1 ? 'ok' : 'warn', `Refresh token valid for ${days.toFixed(1)} days`);
  } catch (e: any) {
    push('invo_refresh_expiry', 'fail', `Cannot decode refresh token: ${e.message}`);
  }

  try {
    const portfolios = await invo.getFollowedPortfolios();
    push('invo_auth', 'ok', 'Access token acquired via auto-refresh');
    push('invo_followed_portfolios', portfolios.length > 0 ? 'ok' : 'warn', `Following ${portfolios.length} portfolio(s)`);
  } catch (e: any) {
    push('invo_auth', 'fail', `Auth or followed-portfolios lookup failed: ${e.message}`);
  }

  try {
    await hl.connect();
    push('hl_agent_key', 'ok', 'SDK connected with agent key');
  } catch (e: any) {
    push('hl_agent_key', 'fail', `SDK connect failed: ${e.message}`);
  }

  try {
    const meta = await hl.getMeta();
    push('hl_market_data', 'ok', `${meta.universe.length} assets indexed`);
  } catch (e: any) {
    push('hl_market_data', 'fail', `Market data fetch failed: ${e.message}`);
  }

  try {
    const equity = await hl.getAccountValueUsd();
    const positions = await hl.getPositions();
    push('hl_balance', equity > 5 ? 'ok' : 'warn', `Equity: $${equity.toFixed(2)} | Open positions: ${positions.length}`);
  } catch (e: any) {
    push('hl_balance', 'fail', `Balance/position fetch failed: ${e.message}`);
  }

  const ok = checks.filter(c => c.status === 'ok').length;
  const fail = checks.filter(c => c.status === 'fail').length;
  console.log(JSON.stringify({
    summary: { ok, warn: checks.filter(c => c.status === 'warn').length, fail, total: checks.length, ready: fail === 0 },
    checks,
  }, null, 2));

  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
