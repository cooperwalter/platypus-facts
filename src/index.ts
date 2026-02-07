import { loadConfig } from "./lib/config";
import { createDatabase } from "./lib/db";
import { DevEmailProvider } from "./lib/email/dev";
import { createEmailProvider } from "./lib/email/index";
import { createRateLimiter } from "./lib/rate-limiter";
import { DevSmsProvider } from "./lib/sms/dev";
import { createSmsProvider } from "./lib/sms/index";
import { syncFacts } from "./scripts/sync-facts";
import { createRequestHandler } from "./server";

const config = loadConfig();
const db = createDatabase(config.databasePath);
const smsProvider = createSmsProvider(`${config.baseUrl}/api/webhooks/twilio/incoming`, db);
const emailProvider = createEmailProvider(config, db);
const rateLimiter = createRateLimiter(5, 60 * 60 * 1000);

const cleanupInterval = setInterval(
	() => {
		rateLimiter.cleanup();
	},
	10 * 60 * 1000,
);

try {
	const syncResult = await syncFacts(db, undefined, config.openaiApiKey);
	console.log(
		`Fact sync complete: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.unchanged} unchanged`,
	);
} catch (error) {
	console.error("Fact sync failed on startup:", error);
}

const devSmsProvider = smsProvider instanceof DevSmsProvider ? smsProvider : null;
const devEmailProvider = emailProvider instanceof DevEmailProvider ? emailProvider : null;

const handleRequest = createRequestHandler({
	db,
	smsProvider,
	emailProvider,
	rateLimiter,
	maxSubscribers: config.maxSubscribers,
	baseUrl: config.baseUrl,
	devSmsProvider,
	devEmailProvider,
});

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
