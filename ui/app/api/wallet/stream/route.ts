import { subscribeWallet } from "@/server/hyperliquid/walletBroadcaster";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function GET(request: Request) {
	const encoder = new TextEncoder();
	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const unsubscribe = subscribeWallet((data) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// controller already closed by an aborted request racing this push
				}
			});

			const heartbeat = setInterval(() => {
				if (!closed) controller.enqueue(encoder.encode(`: heartbeat\n\n`));
			}, HEARTBEAT_MS);

			request.signal.addEventListener("abort", () => {
				closed = true;
				unsubscribe();
				clearInterval(heartbeat);
				try {
					controller.close();
				} catch {
					// already closed
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
