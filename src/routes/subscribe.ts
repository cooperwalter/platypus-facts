import type { Database } from "bun:sqlite";
import type { EmailProvider } from "../lib/email/types";
import type { RateLimiter } from "../lib/rate-limiter";
import type { SmsProvider } from "../lib/sms/types";
import { signup } from "../lib/subscription-flow";

function getClientIp(request: Request): string {
	const forwarded = request.headers.get("X-Forwarded-For");
	if (forwarded) {
		return forwarded.split(",")[0].trim();
	}
	return "unknown";
}

async function handleSubscribe(
	request: Request,
	db: Database,
	smsProvider: SmsProvider,
	rateLimiter: RateLimiter,
	maxSubscribers: number,
	baseUrl: string,
	emailProvider?: EmailProvider | null,
): Promise<Response> {
	const ip = getClientIp(request);

	if (!rateLimiter.isAllowed(ip)) {
		return Response.json(
			{ success: false, error: "Too many requests. Please try again later." },
			{ status: 429 },
		);
	}

	const contentLength = request.headers.get("Content-Length");
	if (contentLength && Number.parseInt(contentLength, 10) > 4096) {
		return Response.json({ success: false, error: "Request body too large" }, { status: 413 });
	}

	let body: unknown;
	try {
		const rawText = await request.text();
		if (rawText.length > 4096) {
			return Response.json({ success: false, error: "Request body too large" }, { status: 413 });
		}
		body = JSON.parse(rawText);
	} catch {
		return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
	}

	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
	}

	const parsed = body as Record<string, unknown>;
	const phoneNumber =
		typeof parsed.phoneNumber === "string" && parsed.phoneNumber.trim()
			? parsed.phoneNumber
			: undefined;
	const email = typeof parsed.email === "string" && parsed.email.trim() ? parsed.email : undefined;

	if (!phoneNumber && !email) {
		return Response.json(
			{ success: false, error: "Please provide a phone number or email address." },
			{ status: 400 },
		);
	}

	const result = await signup(
		db,
		smsProvider,
		{ phone: phoneNumber, email },
		maxSubscribers,
		baseUrl,
		emailProvider,
	);

	if (result.success) {
		return Response.json({ success: true, message: result.message });
	}

	return Response.json({ success: false, error: result.message });
}

export { handleSubscribe, getClientIp };
