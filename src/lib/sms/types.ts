interface SmsProvider {
	sendSms(to: string, body: string): Promise<void>;
	parseIncomingMessage(request: Request): Promise<{ from: string; body: string }>;
	validateWebhookSignature(request: Request): Promise<boolean>;
	createWebhookResponse(message?: string): string;
}

export type { SmsProvider };
