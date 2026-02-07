import { TwilioSmsProvider } from "./twilio";
import type { SmsProvider } from "./types";

function createSmsProvider(webhookUrl?: string): SmsProvider {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

	if (!accountSid || !authToken || !phoneNumber) {
		throw new Error(
			"Missing required Twilio configuration: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set",
		);
	}

	return new TwilioSmsProvider(accountSid, authToken, phoneNumber, webhookUrl);
}

export { createSmsProvider };
