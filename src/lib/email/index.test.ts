import { describe, expect, test } from "bun:test";
import type { Config } from "../config";
import { DevEmailProvider } from "./dev";
import { createEmailProvider } from "./index";
import { PostmarkEmailProvider } from "./postmark";

function makeConfig(overrides: Partial<Config> = {}): Config {
	return {
		nodeEnv: "development",
		port: 3000,
		baseUrl: "https://example.com",
		databasePath: "./data/test.db",
		twilioAccountSid: null,
		twilioAuthToken: null,
		twilioPhoneNumber: null,
		postmarkApiToken: null,
		emailFrom: null,
		dailySendTimeUtc: "14:00",
		maxSubscribers: 1000,
		openaiApiKey: null,
		...overrides,
	};
}

describe("createEmailProvider", () => {
	test("returns PostmarkEmailProvider when postmarkApiToken and emailFrom are set", () => {
		const config = makeConfig({
			postmarkApiToken: "test-token",
			emailFrom: "from@example.com",
		});
		const provider = createEmailProvider(config);
		expect(provider).toBeInstanceOf(PostmarkEmailProvider);
	});

	test("returns DevEmailProvider when postmarkApiToken is null", () => {
		const config = makeConfig({ postmarkApiToken: null, emailFrom: "from@example.com" });
		const provider = createEmailProvider(config);
		expect(provider).toBeInstanceOf(DevEmailProvider);
	});

	test("returns DevEmailProvider when emailFrom is null", () => {
		const config = makeConfig({ postmarkApiToken: "test-token", emailFrom: null });
		const provider = createEmailProvider(config);
		expect(provider).toBeInstanceOf(DevEmailProvider);
	});

	test("returns DevEmailProvider when both are null", () => {
		const config = makeConfig();
		const provider = createEmailProvider(config);
		expect(provider).toBeInstanceOf(DevEmailProvider);
	});
});
