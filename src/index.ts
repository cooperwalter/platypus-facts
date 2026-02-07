import * as path from "node:path";
import { loadConfig } from "./lib/config";
import { createDatabase } from "./lib/db";
import { DevEmailProvider } from "./lib/email/dev";
import { createEmailProvider } from "./lib/email/index";
import { createRateLimiter } from "./lib/rate-limiter";
import { DevSmsProvider } from "./lib/sms/dev";
import { createSmsProvider } from "./lib/sms/index";
import { handleHealthCheck } from "./routes/health";
import {
	handleUnsubscribe,
	render404Page,
	renderConfirmationPage,
	renderDevMessage,
	renderDevMessageList,
	renderFactPage,
	renderSignupPage,
	renderUnsubscribePage,
} from "./routes/pages";
import { handleSubscribe } from "./routes/subscribe";
import { handleTwilioWebhook } from "./routes/webhook";
import { syncFacts } from "./scripts/sync-facts";

const config = loadConfig();
const db = createDatabase(config.databasePath);
const smsProvider = createSmsProvider(`${config.baseUrl}/api/webhooks/twilio/incoming`);
const emailProvider = createEmailProvider(config);
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
const devRoutesEnabled = devSmsProvider !== null || devEmailProvider !== null;

const FACTS_ROUTE_PATTERN = /^\/facts\/(\d+)$/;
const CONFIRM_ROUTE_PATTERN = /^\/confirm\/([a-f0-9-]{36})$/;
const UNSUBSCRIBE_ROUTE_PATTERN = /^\/unsubscribe\/([a-f0-9-]{36})$/;
const DEV_MESSAGE_DETAIL_PATTERN = /^\/dev\/messages\/((?:sms|email)-\d+)$/;

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
		return handleSubscribe(
			request,
			db,
			smsProvider,
			rateLimiter,
			config.maxSubscribers,
			config.baseUrl,
			emailProvider,
		);
	}

	if (method === "POST" && pathname === "/api/webhooks/twilio/incoming") {
		return handleTwilioWebhook(request, db, smsProvider, config.baseUrl, config.maxSubscribers);
	}

	if (devRoutesEnabled && method === "GET" && pathname === "/dev/messages") {
		const smsMessages = devSmsProvider?.getStoredMessages() ?? [];
		const emailMessages = devEmailProvider?.getStoredEmails() ?? [];
		return renderDevMessageList(smsMessages, emailMessages);
	}

	if (devRoutesEnabled && method === "GET") {
		const devDetailMatch = pathname.match(DEV_MESSAGE_DETAIL_PATTERN);
		if (devDetailMatch) {
			const smsMessages = devSmsProvider?.getStoredMessages() ?? [];
			const emailMessages = devEmailProvider?.getStoredEmails() ?? [];
			return renderDevMessage(devDetailMatch[1], smsMessages, emailMessages);
		}
	}

	const unsubMatch = pathname.match(UNSUBSCRIBE_ROUTE_PATTERN);
	if (unsubMatch) {
		if (method === "GET") {
			return renderUnsubscribePage(db, unsubMatch[1]);
		}
		if (method === "POST") {
			return handleUnsubscribe(db, unsubMatch[1]);
		}
	}

	if (method === "GET") {
		const confirmMatch = pathname.match(CONFIRM_ROUTE_PATTERN);
		if (confirmMatch) {
			return renderConfirmationPage(db, confirmMatch[1], config.maxSubscribers);
		}

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
