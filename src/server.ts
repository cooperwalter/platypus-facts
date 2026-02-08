import * as path from "node:path";
import type { DrizzleDatabase } from "./lib/db";
import type { DevEmailProvider } from "./lib/email/dev";
import type { EmailProvider } from "./lib/email/types";
import type { RateLimiter } from "./lib/rate-limiter";
import { handleHealthCheck } from "./routes/health";
import {
	handleUnsubscribe,
	render404Page,
	renderConfirmationPage,
	renderDevEmailDetail,
	renderDevMessageList,
	renderFactPage,
	renderSignupPage,
	renderUnsubscribePage,
} from "./routes/pages";
import { handleSubscribe } from "./routes/subscribe";

interface RequestHandlerDeps {
	db: DrizzleDatabase;
	emailProvider: EmailProvider;
	rateLimiter: RateLimiter;
	maxSubscribers: number;
	baseUrl: string;
	devEmailProvider: DevEmailProvider | null;
}

const FACTS_ROUTE_PATTERN = /^\/facts\/(\d+)$/;
const CONFIRM_ROUTE_PATTERN = /^\/confirm\/([a-f0-9-]{36})$/;
const UNSUBSCRIBE_ROUTE_PATTERN = /^\/unsubscribe\/([a-f0-9-]{36})$/;
const DEV_MESSAGE_DETAIL_PATTERN = /^\/dev\/messages\/email-(\d+)$/;

function createRequestHandler(deps: RequestHandlerDeps): (request: Request) => Promise<Response> {
	const { db, emailProvider, rateLimiter, maxSubscribers, baseUrl, devEmailProvider } = deps;
	const devRoutesEnabled = devEmailProvider !== null;

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
			return handleSubscribe(request, db, emailProvider, rateLimiter, maxSubscribers, baseUrl);
		}

		if (devRoutesEnabled && method === "GET" && pathname === "/dev/messages") {
			const emailMessages = devEmailProvider?.getStoredEmails() ?? [];
			return renderDevMessageList(emailMessages);
		}

		if (devRoutesEnabled && method === "GET") {
			const devDetailMatch = pathname.match(DEV_MESSAGE_DETAIL_PATTERN);
			if (devDetailMatch) {
				const emailMessages = devEmailProvider?.getStoredEmails() ?? [];
				const numId = Number.parseInt(devDetailMatch[1], 10);
				const email = emailMessages.find((e) => e.id === numId);
				if (!email) {
					return new Response("Not Found", { status: 404 });
				}
				return renderDevEmailDetail(email);
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
