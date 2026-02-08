import { describe, expect, test } from "bun:test";
import type { Config } from "../config";
import { makeTestDatabase } from "../test-utils";
import { BrevoEmailProvider } from "./brevo";
import { DevEmailProvider } from "./dev";
import { createEmailProvider } from "./index";

function makeConfig(overrides: Partial<Config> = {}): Config {
	return {
		nodeEnv: "development",
		port: 3000,
		baseUrl: "https://example.com",
		databasePath: "./data/test.db",
		brevoApiKey: null,
		emailFrom: null,
		dailySendTimeUtc: "14:00",
		maxSubscribers: 1000,
		openaiApiKey: null,
		...overrides,
	};
}

describe("createEmailProvider", () => {
	test("returns BrevoEmailProvider when brevoApiKey and emailFrom are set", () => {
		const config = makeConfig({
			brevoApiKey: "xkeysib-test-key",
			emailFrom: "from@example.com",
		});
		const provider = createEmailProvider(config);
		expect(provider).toBeInstanceOf(BrevoEmailProvider);
	});

	test("returns DevEmailProvider when brevoApiKey is null", () => {
		const config = makeConfig({ brevoApiKey: null, emailFrom: "from@example.com" });
		const db = makeTestDatabase();
		const provider = createEmailProvider(config, db);
		expect(provider).toBeInstanceOf(DevEmailProvider);
	});

	test("returns DevEmailProvider when emailFrom is null", () => {
		const config = makeConfig({ brevoApiKey: "xkeysib-test-key", emailFrom: null });
		const db = makeTestDatabase();
		const provider = createEmailProvider(config, db);
		expect(provider).toBeInstanceOf(DevEmailProvider);
	});

	test("returns DevEmailProvider when both are null", () => {
		const config = makeConfig();
		const db = makeTestDatabase();
		const provider = createEmailProvider(config, db);
		expect(provider).toBeInstanceOf(DevEmailProvider);
	});

	test("throws when Brevo not configured and no database provided", () => {
		const config = makeConfig();
		expect(() => createEmailProvider(config)).toThrow("Database is required for DevEmailProvider");
	});
});
