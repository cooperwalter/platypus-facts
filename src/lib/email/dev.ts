import type { EmailProvider } from "./types";

interface StoredEmail {
	id: number;
	recipient: string;
	subject: string;
	htmlBody: string;
	plainBody: string | undefined;
	headers: Record<string, string> | undefined;
	timestamp: string;
}

class DevEmailProvider implements EmailProvider {
	private emails: StoredEmail[] = [];
	private nextId = 1;

	async sendEmail(
		to: string,
		subject: string,
		htmlBody: string,
		plainBody?: string,
		headers?: Record<string, string>,
	): Promise<void> {
		const email: StoredEmail = {
			id: this.nextId++,
			recipient: to,
			subject,
			htmlBody,
			plainBody,
			headers,
			timestamp: new Date().toISOString(),
		};
		this.emails.push(email);
		console.log(`[DEV EMAIL] To: ${to} | Subject: ${subject}`);
	}

	getStoredEmails(): StoredEmail[] {
		return [...this.emails].reverse();
	}

	getStoredEmailById(id: number): StoredEmail | undefined {
		return this.emails.find((e) => e.id === id);
	}
}

export type { StoredEmail };
export { DevEmailProvider };
