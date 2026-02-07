import type { EmailProvider } from "./types";

class PostmarkEmailProvider implements EmailProvider {
	private apiToken: string;
	private fromAddress: string;

	constructor(apiToken: string, fromAddress: string) {
		this.apiToken = apiToken;
		this.fromAddress = fromAddress;
	}

	async sendEmail(
		to: string,
		subject: string,
		htmlBody: string,
		plainBody?: string,
		headers?: Record<string, string>,
	): Promise<void> {
		const postmarkHeaders = headers
			? Object.entries(headers).map(([name, value]) => ({ Name: name, Value: value }))
			: undefined;

		const body: Record<string, unknown> = {
			From: this.fromAddress,
			To: to,
			Subject: subject,
			HtmlBody: htmlBody,
			MessageStream: "outbound",
		};

		if (plainBody) {
			body.TextBody = plainBody;
		}

		if (postmarkHeaders && postmarkHeaders.length > 0) {
			body.Headers = postmarkHeaders;
		}

		const response = await fetch("https://api.postmarkapp.com/email", {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Postmark-Server-Token": this.apiToken,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Postmark API error (${response.status}): ${text}`);
		}
	}
}

export { PostmarkEmailProvider };
