import Twilio, { validateRequest } from "twilio";
import type { SmsProvider } from "./types";

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

class TwilioSmsProvider implements SmsProvider {
	private client: ReturnType<typeof Twilio>;
	private phoneNumber: string;
	private authToken: string;
	private webhookUrl?: string;

	constructor(accountSid: string, authToken: string, phoneNumber: string, webhookUrl?: string) {
		this.client = Twilio(accountSid, authToken);
		this.phoneNumber = phoneNumber;
		this.authToken = authToken;
		this.webhookUrl = webhookUrl;
	}

	async sendSms(to: string, body: string, mediaUrl?: string): Promise<void> {
		const params: { from: string; to: string; body: string; mediaUrl?: string[] } = {
			from: this.phoneNumber,
			to,
			body,
		};
		if (mediaUrl) {
			params.mediaUrl = [mediaUrl];
		}
		await this.client.messages.create(params);
	}

	async parseIncomingMessage(request: Request): Promise<{ from: string; body: string }> {
		const formData = await request.formData();
		const from = formData.get("From");
		const body = formData.get("Body");

		return {
			from: typeof from === "string" ? from : "",
			body: typeof body === "string" ? body : "",
		};
	}

	async validateWebhookSignature(request: Request): Promise<boolean> {
		const signature = request.headers.get("X-Twilio-Signature");
		if (!signature) {
			return false;
		}

		const url = this.webhookUrl ?? request.url;
		const formData = await request.clone().formData();
		const params: Record<string, string> = {};

		for (const [key, value] of formData.entries()) {
			if (typeof value === "string") {
				params[key] = value;
			}
		}

		return validateRequest(this.authToken, signature, url, params);
	}

	createWebhookResponse(message?: string): string {
		if (!message) {
			return "<Response/>";
		}
		return `<Response><Message>${escapeXml(message)}</Message></Response>`;
	}
}

export { TwilioSmsProvider };
