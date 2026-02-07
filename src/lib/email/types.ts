interface EmailProvider {
	sendEmail(
		to: string,
		subject: string,
		htmlBody: string,
		plainBody?: string,
		headers?: Record<string, string>,
	): Promise<void>;
}

export type { EmailProvider };
