import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const DEV_REQUIRED_ENV = {
	BASE_URL: "https://example.com",
	NODE_ENV: undefined as string | undefined,
	TWILIO_ACCOUNT_SID: undefined as string | undefined,
	TWILIO_AUTH_TOKEN: undefined as string | undefined,
	TWILIO_PHONE_NUMBER: undefined as string | undefined,
	POSTMARK_API_TOKEN: undefined as string | undefined,
	EMAIL_FROM: undefined as string | undefined,
};

const PROD_REQUIRED_ENV = {
	BASE_URL: "https://example.com",
	NODE_ENV: "production",
	TWILIO_ACCOUNT_SID: "test-sid",
	TWILIO_AUTH_TOKEN: "test-token",
	TWILIO_PHONE_NUMBER: "+15551234567",
	POSTMARK_API_TOKEN: "test-postmark-token",
	EMAIL_FROM: "facts@example.com",
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

describe("loadConfig - NODE_ENV", () => {
	test("defaults to development when NODE_ENV is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV }, () => {
			const config = loadConfig();
			expect(config.nodeEnv).toBe("development");
		});
	});

	test("returns development for any NODE_ENV value other than production", () => {
		withEnv({ ...DEV_REQUIRED_ENV, NODE_ENV: "test" }, () => {
			const config = loadConfig();
			expect(config.nodeEnv).toBe("development");
		});
	});

	test("returns production when NODE_ENV is production", () => {
		withEnv({ ...PROD_REQUIRED_ENV }, () => {
			const config = loadConfig();
			expect(config.nodeEnv).toBe("production");
		});
	});
});

describe("loadConfig - development mode (Twilio/Postmark optional)", () => {
	test("loads successfully without Twilio env vars in development", () => {
		withEnv({ ...DEV_REQUIRED_ENV }, () => {
			expect(() => loadConfig()).not.toThrow();
		});
	});

	test("returns null for Twilio vars when not set in development", () => {
		withEnv({ ...DEV_REQUIRED_ENV }, () => {
			const config = loadConfig();
			expect(config.twilioAccountSid).toBeNull();
			expect(config.twilioAuthToken).toBeNull();
			expect(config.twilioPhoneNumber).toBeNull();
		});
	});

	test("returns Twilio vars when set in development", () => {
		withEnv(
			{
				...DEV_REQUIRED_ENV,
				TWILIO_ACCOUNT_SID: "dev-sid",
				TWILIO_AUTH_TOKEN: "dev-token",
				TWILIO_PHONE_NUMBER: "+15559876543",
			},
			() => {
				const config = loadConfig();
				expect(config.twilioAccountSid).toBe("dev-sid");
				expect(config.twilioAuthToken).toBe("dev-token");
				expect(config.twilioPhoneNumber).toBe("+15559876543");
			},
		);
	});

	test("returns null for Postmark vars when not set in development", () => {
		withEnv({ ...DEV_REQUIRED_ENV }, () => {
			const config = loadConfig();
			expect(config.postmarkApiToken).toBeNull();
			expect(config.emailFrom).toBeNull();
		});
	});

	test("returns Postmark vars when set in development", () => {
		withEnv(
			{
				...DEV_REQUIRED_ENV,
				POSTMARK_API_TOKEN: "dev-postmark-token",
				EMAIL_FROM: "dev@example.com",
			},
			() => {
				const config = loadConfig();
				expect(config.postmarkApiToken).toBe("dev-postmark-token");
				expect(config.emailFrom).toBe("dev@example.com");
			},
		);
	});
});

describe("loadConfig - production mode (Twilio/Postmark required)", () => {
	test("throws when TWILIO_ACCOUNT_SID is missing in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV, TWILIO_ACCOUNT_SID: undefined }, () => {
			expect(() => loadConfig()).toThrow(
				"Missing required environment variable: TWILIO_ACCOUNT_SID",
			);
		});
	});

	test("throws when TWILIO_AUTH_TOKEN is missing in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV, TWILIO_AUTH_TOKEN: undefined }, () => {
			expect(() => loadConfig()).toThrow(
				"Missing required environment variable: TWILIO_AUTH_TOKEN",
			);
		});
	});

	test("throws when TWILIO_PHONE_NUMBER is missing in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV, TWILIO_PHONE_NUMBER: undefined }, () => {
			expect(() => loadConfig()).toThrow(
				"Missing required environment variable: TWILIO_PHONE_NUMBER",
			);
		});
	});

	test("throws when POSTMARK_API_TOKEN is missing in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV, POSTMARK_API_TOKEN: undefined }, () => {
			expect(() => loadConfig()).toThrow(
				"Missing required environment variable: POSTMARK_API_TOKEN",
			);
		});
	});

	test("throws when EMAIL_FROM is missing in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV, EMAIL_FROM: undefined }, () => {
			expect(() => loadConfig()).toThrow("Missing required environment variable: EMAIL_FROM");
		});
	});

	test("returns all provider vars when set in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV }, () => {
			const config = loadConfig();
			expect(config.twilioAccountSid).toBe("test-sid");
			expect(config.twilioAuthToken).toBe("test-token");
			expect(config.twilioPhoneNumber).toBe("+15551234567");
			expect(config.postmarkApiToken).toBe("test-postmark-token");
			expect(config.emailFrom).toBe("facts@example.com");
		});
	});
});

describe("loadConfig - BASE_URL validation", () => {
	test("throws when BASE_URL is missing", () => {
		withEnv({ ...DEV_REQUIRED_ENV, BASE_URL: undefined }, () => {
			expect(() => loadConfig()).toThrow("Missing required environment variable: BASE_URL");
		});
	});

	test("throws when BASE_URL is not a valid URL", () => {
		withEnv({ ...DEV_REQUIRED_ENV, BASE_URL: "not-a-url" }, () => {
			expect(() => loadConfig()).toThrow("BASE_URL must be a valid URL");
		});
	});

	test("strips trailing slashes from BASE_URL", () => {
		withEnv({ ...DEV_REQUIRED_ENV, BASE_URL: "https://example.com///" }, () => {
			const config = loadConfig();
			expect(config.baseUrl).toBe("https://example.com");
		});
	});

	test("accepts valid URL without trailing slash", () => {
		withEnv({ ...DEV_REQUIRED_ENV, BASE_URL: "https://platypus.example.com" }, () => {
			const config = loadConfig();
			expect(config.baseUrl).toBe("https://platypus.example.com");
		});
	});
});

describe("loadConfig - TWILIO_PHONE_NUMBER E.164 validation", () => {
	test("throws when TWILIO_PHONE_NUMBER is not in E.164 format", () => {
		withEnv({ ...DEV_REQUIRED_ENV, TWILIO_PHONE_NUMBER: "5551234567" }, () => {
			expect(() => loadConfig()).toThrow("TWILIO_PHONE_NUMBER must be in E.164 format");
		});
	});

	test("throws when TWILIO_PHONE_NUMBER has no plus prefix", () => {
		withEnv({ ...DEV_REQUIRED_ENV, TWILIO_PHONE_NUMBER: "15551234567" }, () => {
			expect(() => loadConfig()).toThrow("TWILIO_PHONE_NUMBER must be in E.164 format");
		});
	});

	test("accepts valid E.164 phone number", () => {
		withEnv({ ...DEV_REQUIRED_ENV, TWILIO_PHONE_NUMBER: "+15559876543" }, () => {
			const config = loadConfig();
			expect(config.twilioPhoneNumber).toBe("+15559876543");
		});
	});

	test("skips E.164 validation when TWILIO_PHONE_NUMBER is not set in development", () => {
		withEnv({ ...DEV_REQUIRED_ENV, TWILIO_PHONE_NUMBER: undefined }, () => {
			expect(() => loadConfig()).not.toThrow();
			const config = loadConfig();
			expect(config.twilioPhoneNumber).toBeNull();
		});
	});
});

describe("loadConfig - DAILY_SEND_TIME_UTC validation", () => {
	test("defaults to 14:00 when DAILY_SEND_TIME_UTC is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: undefined }, () => {
			const config = loadConfig();
			expect(config.dailySendTimeUtc).toBe("14:00");
		});
	});

	test("accepts valid HH:MM time format", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: "09:30" }, () => {
			const config = loadConfig();
			expect(config.dailySendTimeUtc).toBe("09:30");
		});
	});

	test("throws when DAILY_SEND_TIME_UTC has invalid format", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: "9:30" }, () => {
			expect(() => loadConfig()).toThrow("DAILY_SEND_TIME_UTC must be in HH:MM 24-hour format");
		});
	});

	test("throws when DAILY_SEND_TIME_UTC has hours > 23", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: "24:00" }, () => {
			expect(() => loadConfig()).toThrow("DAILY_SEND_TIME_UTC must be in HH:MM 24-hour format");
		});
	});

	test("throws when DAILY_SEND_TIME_UTC has minutes > 59", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: "12:60" }, () => {
			expect(() => loadConfig()).toThrow("DAILY_SEND_TIME_UTC must be in HH:MM 24-hour format");
		});
	});

	test("accepts midnight as 00:00", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: "00:00" }, () => {
			const config = loadConfig();
			expect(config.dailySendTimeUtc).toBe("00:00");
		});
	});

	test("accepts last valid time 23:59", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: "23:59" }, () => {
			const config = loadConfig();
			expect(config.dailySendTimeUtc).toBe("23:59");
		});
	});
});

describe("loadConfig - PORT validation", () => {
	test("defaults to 3000 when PORT is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: undefined }, () => {
			const config = loadConfig();
			expect(config.port).toBe(3000);
		});
	});

	test("accepts valid port number", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: "8080" }, () => {
			const config = loadConfig();
			expect(config.port).toBe(8080);
		});
	});

	test("throws when PORT is not a number", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: "abc" }, () => {
			expect(() => loadConfig()).toThrow("PORT must be a valid port number");
		});
	});

	test("throws when PORT is 0", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: "0" }, () => {
			expect(() => loadConfig()).toThrow("PORT must be a valid port number");
		});
	});

	test("throws when PORT exceeds 65535", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: "70000" }, () => {
			expect(() => loadConfig()).toThrow("PORT must be a valid port number");
		});
	});

	test("accepts port 1 (minimum valid)", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: "1" }, () => {
			const config = loadConfig();
			expect(config.port).toBe(1);
		});
	});

	test("accepts port 65535 (maximum valid)", () => {
		withEnv({ ...DEV_REQUIRED_ENV, PORT: "65535" }, () => {
			const config = loadConfig();
			expect(config.port).toBe(65535);
		});
	});
});

describe("loadConfig - MAX_SUBSCRIBERS validation", () => {
	test("defaults to 1000 when MAX_SUBSCRIBERS is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, MAX_SUBSCRIBERS: undefined }, () => {
			const config = loadConfig();
			expect(config.maxSubscribers).toBe(1000);
		});
	});

	test("accepts valid positive integer", () => {
		withEnv({ ...DEV_REQUIRED_ENV, MAX_SUBSCRIBERS: "500" }, () => {
			const config = loadConfig();
			expect(config.maxSubscribers).toBe(500);
		});
	});

	test("throws when MAX_SUBSCRIBERS is 0", () => {
		withEnv({ ...DEV_REQUIRED_ENV, MAX_SUBSCRIBERS: "0" }, () => {
			expect(() => loadConfig()).toThrow("MAX_SUBSCRIBERS must be a positive integer");
		});
	});

	test("throws when MAX_SUBSCRIBERS is negative", () => {
		withEnv({ ...DEV_REQUIRED_ENV, MAX_SUBSCRIBERS: "-5" }, () => {
			expect(() => loadConfig()).toThrow("MAX_SUBSCRIBERS must be a positive integer");
		});
	});

	test("throws when MAX_SUBSCRIBERS is not a number", () => {
		withEnv({ ...DEV_REQUIRED_ENV, MAX_SUBSCRIBERS: "many" }, () => {
			expect(() => loadConfig()).toThrow("MAX_SUBSCRIBERS must be a positive integer");
		});
	});
});

describe("loadConfig - DATABASE_PATH default", () => {
	test("defaults to ./data/platypus-facts.db when DATABASE_PATH is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DATABASE_PATH: undefined }, () => {
			const config = loadConfig();
			expect(config.databasePath).toBe("./data/platypus-facts.db");
		});
	});

	test("uses custom DATABASE_PATH when set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DATABASE_PATH: "/tmp/test.db" }, () => {
			const config = loadConfig();
			expect(config.databasePath).toBe("/tmp/test.db");
		});
	});
});

describe("loadConfig - OPENAI_API_KEY", () => {
	test("returns null for openaiApiKey when OPENAI_API_KEY is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, OPENAI_API_KEY: undefined }, () => {
			const config = loadConfig();
			expect(config.openaiApiKey).toBeNull();
		});
	});

	test("returns the value when OPENAI_API_KEY is set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, OPENAI_API_KEY: "sk-test-key-123" }, () => {
			const config = loadConfig();
			expect(config.openaiApiKey).toBe("sk-test-key-123");
		});
	});
});

describe("loadConfig - development defaults applied correctly", () => {
	test("returns complete config with all development defaults", () => {
		withEnv(
			{
				...DEV_REQUIRED_ENV,
				PORT: undefined,
				DAILY_SEND_TIME_UTC: undefined,
				MAX_SUBSCRIBERS: undefined,
				DATABASE_PATH: undefined,
				OPENAI_API_KEY: undefined,
			},
			() => {
				const config = loadConfig();
				expect(config.nodeEnv).toBe("development");
				expect(config.baseUrl).toBe("https://example.com");
				expect(config.twilioAccountSid).toBeNull();
				expect(config.twilioAuthToken).toBeNull();
				expect(config.twilioPhoneNumber).toBeNull();
				expect(config.postmarkApiToken).toBeNull();
				expect(config.emailFrom).toBeNull();
				expect(config.port).toBe(3000);
				expect(config.dailySendTimeUtc).toBe("14:00");
				expect(config.maxSubscribers).toBe(1000);
				expect(config.databasePath).toBe("./data/platypus-facts.db");
				expect(config.openaiApiKey).toBeNull();
			},
		);
	});
});

describe("loadConfig - production defaults applied correctly", () => {
	test("returns complete config with all production values", () => {
		withEnv(
			{
				...PROD_REQUIRED_ENV,
				PORT: undefined,
				DAILY_SEND_TIME_UTC: undefined,
				MAX_SUBSCRIBERS: undefined,
				DATABASE_PATH: undefined,
				OPENAI_API_KEY: undefined,
			},
			() => {
				const config = loadConfig();
				expect(config.nodeEnv).toBe("production");
				expect(config.baseUrl).toBe("https://example.com");
				expect(config.twilioAccountSid).toBe("test-sid");
				expect(config.twilioAuthToken).toBe("test-token");
				expect(config.twilioPhoneNumber).toBe("+15551234567");
				expect(config.postmarkApiToken).toBe("test-postmark-token");
				expect(config.emailFrom).toBe("facts@example.com");
				expect(config.port).toBe(3000);
				expect(config.dailySendTimeUtc).toBe("14:00");
				expect(config.maxSubscribers).toBe(1000);
				expect(config.databasePath).toBe("./data/platypus-facts.db");
				expect(config.openaiApiKey).toBeNull();
			},
		);
	});
});
