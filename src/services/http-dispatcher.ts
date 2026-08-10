import { Agent, setGlobalDispatcher } from 'undici';

/**
 * undici's default connection pool can silently reuse a keep-alive socket
 * the remote (or an intermediary load balancer) already closed without a
 * TCP RST — the socket looks ESTABLISHED locally but is dead on the far
 * end, so a request written onto it just never gets a response. This is a
 * documented, long-standing undici bug class (nodejs/undici#3492, #3905,
 * #4215) spanning Node 18 through the current version; `AbortSignal` does
 * NOT reliably catch it, because the hang lives inside undici's own
 * pool/socket-reuse state machine, not the abort-signal wiring — undici's
 * own internal `headersTimeout` (default 600s) is what would eventually
 * recover it. A short `keepAliveTimeout` recycles idle sockets long before
 * a remote/intermediary can kill them out from under us.
 *
 * Side-effect import — safe to import from multiple modules, ESM caches it
 * so `setGlobalDispatcher` only actually runs once per process.
 */
setGlobalDispatcher(
	new Agent({
		keepAliveTimeout: 2_000,
		keepAliveMaxTimeout: 4_000,
		connectTimeout: 10_000,
		headersTimeout: 15_000,
		bodyTimeout: 15_000,
	}),
);
