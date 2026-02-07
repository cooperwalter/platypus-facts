import type { Database } from "bun:sqlite";
import { DevSmsProvider } from "./dev";
import { TwilioSmsProvider } from "./twilio";
import type { SmsProvider } from "./types";

function createSmsProvider(webhookUrl?: string, db?: Database): SmsProvider {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

	if (!accountSid || !authToken || !phoneNumber) {
		if (!db) {
			throw new Error("Database is required for DevSmsProvider");
		}
		return new DevSmsProvider(db);
	}

	return new TwilioSmsProvider(accountSid, authToken, phoneNumber, webhookUrl);
}

export { createSmsProvider };
