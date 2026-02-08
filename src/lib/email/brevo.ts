import type { EmailProvider } from "./types";

class BrevoEmailProvider implements EmailProvider {
	private apiKey: string;
	private fromAddress: string;

	constructor(apiKey: string, fromAddress: string) {
		this.apiKey = apiKey;
		this.fromAddress = fromAddress;
	}

	async sendEmail(
		to: string,
		subject: string,
		htmlBody: string,
		plainBody?: string,
		headers?: Record<string, string>,
	): Promise<void> {
		const body: Record<string, unknown> = {
			sender: { name: "Daily Platypus Facts", email: this.fromAddress },
			to: [{ email: to }],
			subject,
			htmlContent: htmlBody,
		};

		if (plainBody) {
			body.textContent = plainBody;
		}

		if (headers && Object.keys(headers).length > 0) {
			body.headers = headers;
		}

		const response = await fetch("https://api.brevo.com/v3/smtp/email", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"api-key": this.apiKey,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Brevo API error (${response.status}): ${text}`);
		}
	}
}

export { BrevoEmailProvider };
