import type { SmsProvider } from "./types";

interface StoredSms {
	id: number;
	to: string;
	body: string;
	mediaUrl: string | undefined;
	timestamp: string;
}

class DevSmsProvider implements SmsProvider {
	private messages: StoredSms[] = [];
	private nextId = 1;

	async sendSms(to: string, body: string, mediaUrl?: string): Promise<void> {
		const msg: StoredSms = {
			id: this.nextId++,
			to,
			body,
			mediaUrl,
			timestamp: new Date().toISOString(),
		};
		this.messages.push(msg);
		console.log(`[DEV SMS] To: ${to} | ${body.slice(0, 80)}${body.length > 80 ? "..." : ""}`);
	}

	async parseIncomingMessage(request: Request): Promise<{ from: string; body: string }> {
		const formData = await request.formData();
		return {
			from: (formData.get("From") as string) ?? "",
			body: (formData.get("Body") as string) ?? "",
		};
	}

	async validateWebhookSignature(_request: Request): Promise<boolean> {
		return true;
	}

	createWebhookResponse(message?: string): string {
		if (!message) {
			return "<Response/>";
		}
		const escaped = message
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&apos;");
		return `<Response><Message>${escaped}</Message></Response>`;
	}

	getStoredMessages(): StoredSms[] {
		return [...this.messages].reverse();
	}

	getStoredMessageById(id: number): StoredSms | undefined {
		return this.messages.find((m) => m.id === id);
	}
}

export type { StoredSms };
export { DevSmsProvider };
