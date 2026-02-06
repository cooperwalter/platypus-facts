import * as path from "node:path";
import { loadConfig } from "./lib/config";
import { createDatabase } from "./lib/db";
import { createRateLimiter } from "./lib/rate-limiter";
import { createSmsProvider } from "./lib/sms/index";
import { handleHealthCheck } from "./routes/health";
import { render404Page, renderFactPage, renderSignupPage } from "./routes/pages";
import { handleSubscribe } from "./routes/subscribe";
import { handleTwilioWebhook } from "./routes/webhook";
import { syncFacts } from "./scripts/sync-facts";

const config = loadConfig();
const db = createDatabase(config.databasePath);
const smsProvider = createSmsProvider();
const rateLimiter = createRateLimiter(5, 60 * 60 * 1000);

const cleanupInterval = setInterval(
	() => {
		rateLimiter.cleanup();
	},
	10 * 60 * 1000,
);

try {
	const syncResult = await syncFacts(db);
	console.log(
		`Fact sync complete: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.unchanged} unchanged`,
	);
} catch (error) {
	console.error("Fact sync failed on startup:", error);
}

const FACTS_ROUTE_PATTERN = /^\/facts\/(\d+)$/;

async function handleRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const method = request.method;
	const pathname = url.pathname;

	if (method === "GET" && pathname === "/health") {
		return handleHealthCheck();
	}

	if (method === "GET" && pathname === "/") {
		return renderSignupPage(db, config.maxSubscribers);
	}

	if (method === "POST" && pathname === "/api/subscribe") {
		return handleSubscribe(request, db, smsProvider, rateLimiter, config.maxSubscribers);
	}

	if (method === "POST" && pathname === "/api/webhooks/twilio/incoming") {
		return handleTwilioWebhook(request, db, smsProvider, config.baseUrl, config.maxSubscribers);
	}

	if (method === "GET") {
		const factsMatch = pathname.match(FACTS_ROUTE_PATTERN);
		if (factsMatch) {
			const factId = Number.parseInt(factsMatch[1], 10);
			return renderFactPage(db, factId);
		}

		if (pathname.startsWith("/facts/")) {
			return render404Page();
		}

		const publicDir = path.resolve(process.cwd(), "public");
		const publicPath = path.resolve(publicDir, pathname.slice(1));
		if (publicPath.startsWith(publicDir + path.sep) && !pathname.includes("..")) {
			const file = Bun.file(publicPath);
			if (await file.exists()) {
				return new Response(file);
			}
		}
	}

	return new Response("Not Found", { status: 404 });
}

const server = Bun.serve({
	port: config.port,
	fetch(request: Request): Promise<Response> {
		return handleRequest(request).catch((error: unknown) => {
			console.error("Unhandled error:", error);
			return Response.json({ error: "Internal Server Error" }, { status: 500 });
		});
	},
});

console.log(`Daily Platypus Facts server running on port ${server.port}`);

async function shutdown(): Promise<void> {
	console.log("Shutting down...");
	clearInterval(cleanupInterval);
	await server.stop();
	db.close();
	process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { handleRequest };
