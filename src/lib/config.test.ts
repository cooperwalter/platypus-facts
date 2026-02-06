import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const REQUIRED_ENV = {
	BASE_URL: "https://example.com",
	TWILIO_ACCOUNT_SID: "test-sid",
	TWILIO_AUTH_TOKEN: "test-token",
	TWILIO_PHONE_NUMBER: "+15551234567",
};

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
	const original: Record<string, string | undefined> = {};
	for (const key of Object.keys(overrides)) {
		original[key] = process.env[key];
	}
	try {
		for (const [key, value] of Object.entries(overrides)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
		fn();
	} finally {
		for (const [key, value] of Object.entries(original)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

describe("loadConfig", () => {
	test("returns null for openaiApiKey when OPENAI_API_KEY is not set", () => {
		withEnv({ ...REQUIRED_ENV, OPENAI_API_KEY: undefined }, () => {
			const config = loadConfig();
			expect(config.openaiApiKey).toBeNull();
		});
	});

	test("returns the value when OPENAI_API_KEY is set", () => {
		withEnv({ ...REQUIRED_ENV, OPENAI_API_KEY: "sk-test-key-123" }, () => {
			const config = loadConfig();
			expect(config.openaiApiKey).toBe("sk-test-key-123");
		});
	});

	test("loads successfully without OPENAI_API_KEY (server does not require it)", () => {
		withEnv({ ...REQUIRED_ENV, OPENAI_API_KEY: undefined }, () => {
			expect(() => loadConfig()).not.toThrow();
		});
	});
});
