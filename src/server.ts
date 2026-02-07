import type { Database } from "bun:sqlite";
import * as path from "node:path";
import type { DevEmailProvider } from "./lib/email/dev";
import type { EmailProvider } from "./lib/email/types";
import type { RateLimiter } from "./lib/rate-limiter";
import type { DevSmsProvider } from "./lib/sms/dev";
import type { SmsProvider } from "./lib/sms/types";
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

interface RequestHandlerDeps {
	db: Database;
	smsProvider: SmsProvider;
	emailProvider: EmailProvider;
	rateLimiter: RateLimiter;
	maxSubscribers: number;
	baseUrl: string;
	devSmsProvider: DevSmsProvider | null;
	devEmailProvider: DevEmailProvider | null;
}

const FACTS_ROUTE_PATTERN = /^\/facts\/(\d+)$/;
const CONFIRM_ROUTE_PATTERN = /^\/confirm\/([a-f0-9-]{36})$/;
const UNSUBSCRIBE_ROUTE_PATTERN = /^\/unsubscribe\/([a-f0-9-]{36})$/;
const DEV_MESSAGE_DETAIL_PATTERN = /^\/dev\/messages\/((?:sms|email)-\d+)$/;

function createRequestHandler(deps: RequestHandlerDeps): (request: Request) => Promise<Response> {
	const {
		db,
		smsProvider,
		emailProvider,
		rateLimiter,
		maxSubscribers,
		baseUrl,
		devSmsProvider,
		devEmailProvider,
	} = deps;
	const devRoutesEnabled = devSmsProvider !== null || devEmailProvider !== null;

	return async function handleRequest(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;
		const pathname = url.pathname;

		if (method === "GET" && pathname === "/health") {
			return handleHealthCheck();
		}

		if (method === "GET" && pathname === "/") {
			return renderSignupPage(db, maxSubscribers);
		}

		if (method === "POST" && pathname === "/api/subscribe") {
			return handleSubscribe(
				request,
				db,
				smsProvider,
				rateLimiter,
				maxSubscribers,
				baseUrl,
				emailProvider,
			);
		}

		if (method === "POST" && pathname === "/api/webhooks/twilio/incoming") {
			return handleTwilioWebhook(request, db, smsProvider, baseUrl, maxSubscribers);
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
				return renderConfirmationPage(db, confirmMatch[1], maxSubscribers);
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
	};
}

export type { RequestHandlerDeps };
export { createRequestHandler };
