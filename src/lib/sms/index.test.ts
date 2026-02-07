import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSmsProvider } from "./index";

describe("createSmsProvider", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env.TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
		process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
		process.env.TWILIO_PHONE_NUMBER = "+15551234567";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	test("should create a TwilioSmsProvider when all environment variables are set", () => {
		const provider = createSmsProvider();

		expect(provider).toBeDefined();
		expect(typeof provider.sendSms).toBe("function");
		expect(typeof provider.parseIncomingMessage).toBe("function");
		expect(typeof provider.validateWebhookSignature).toBe("function");
		expect(typeof provider.createWebhookResponse).toBe("function");
	});

	test("should accept an optional webhook URL for signature validation behind a reverse proxy", () => {
		const provider = createSmsProvider(
			"https://platypusfacts.example.com/api/webhooks/twilio/incoming",
		);

		expect(provider).toBeDefined();
		expect(typeof provider.validateWebhookSignature).toBe("function");
	});

	test("should throw an error when TWILIO_ACCOUNT_SID is missing", () => {
		process.env.TWILIO_ACCOUNT_SID = undefined;

		expect(() => createSmsProvider()).toThrow(
			"Missing required Twilio configuration: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set",
		);
	});

	test("should throw an error when TWILIO_AUTH_TOKEN is missing", () => {
		process.env.TWILIO_AUTH_TOKEN = undefined;

		expect(() => createSmsProvider()).toThrow(
			"Missing required Twilio configuration: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set",
		);
	});

	test("should throw an error when TWILIO_PHONE_NUMBER is missing", () => {
		process.env.TWILIO_PHONE_NUMBER = undefined;

		expect(() => createSmsProvider()).toThrow(
			"Missing required Twilio configuration: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER must be set",
		);
	});
});
