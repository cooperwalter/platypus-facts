import { DevSmsProvider } from "./dev";
import { TwilioSmsProvider } from "./twilio";
import type { SmsProvider } from "./types";

function createSmsProvider(webhookUrl?: string): SmsProvider {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

	if (!accountSid || !authToken || !phoneNumber) {
		return new DevSmsProvider();
	}

	return new TwilioSmsProvider(accountSid, authToken, phoneNumber, webhookUrl);
}

export { createSmsProvider };
