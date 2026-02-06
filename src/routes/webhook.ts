import type { Database } from "bun:sqlite";
import type { SmsProvider } from "../lib/sms/types";
import { handleIncomingMessage } from "../lib/subscription-flow";

async function handleTwilioWebhook(
	request: Request,
	db: Database,
	smsProvider: SmsProvider,
	baseUrl: string,
	maxSubscribers: number,
): Promise<Response> {
	const isValid = await smsProvider.validateWebhookSignature(request.clone() as Request);
	if (!isValid) {
		return new Response("Forbidden", { status: 403 });
	}

	let from: string;
	let body: string;
	try {
		const parsed = await smsProvider.parseIncomingMessage(request);
		from = parsed.from;
		body = parsed.body;
	} catch (error) {
		console.error("Failed to parse incoming webhook message:", error);
		const twiml = smsProvider.createWebhookResponse();
		return new Response(twiml, {
			status: 200,
			headers: { "Content-Type": "text/xml" },
		});
	}

	let replyMessage: string | undefined;
	try {
		replyMessage = await handleIncomingMessage(db, from, body, baseUrl, maxSubscribers);
	} catch (error) {
		console.error("Failed to handle incoming message:", error);
		const twiml = smsProvider.createWebhookResponse();
		return new Response(twiml, {
			status: 200,
			headers: { "Content-Type": "text/xml" },
		});
	}

	const twiml = smsProvider.createWebhookResponse(replyMessage);

	return new Response(twiml, {
		status: 200,
		headers: { "Content-Type": "text/xml" },
	});
}

export { handleTwilioWebhook };
