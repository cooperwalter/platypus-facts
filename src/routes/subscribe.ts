import type { Database } from "bun:sqlite";
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
): Promise<Response> {
	const ip = getClientIp(request);

	if (!rateLimiter.isAllowed(ip)) {
		return Response.json(
			{ success: false, error: "Too many requests. Please try again later." },
			{ status: 429 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
	}

	if (typeof body !== "object" || body === null || !("phoneNumber" in body)) {
		return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
	}

	const { phoneNumber } = body as { phoneNumber: unknown };
	if (typeof phoneNumber !== "string") {
		return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
	}

	const result = await signup(db, smsProvider, phoneNumber, maxSubscribers);

	if (result.success) {
		return Response.json({ success: true, message: result.message });
	}

	return Response.json({ success: false, error: result.message });
}

export { handleSubscribe, getClientIp };
