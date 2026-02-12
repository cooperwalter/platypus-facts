import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const DEV_REQUIRED_ENV = {
	BASE_URL: "https://example.com",
	NODE_ENV: undefined as string | undefined,
	BREVO_API_KEY: undefined as string | undefined,
	EMAIL_FROM: undefined as string | undefined,
};

const PROD_REQUIRED_ENV = {
	BASE_URL: "https://example.com",
	NODE_ENV: "production",
	BREVO_API_KEY: "xkeysib-test-brevo-key",
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

describe("loadConfig - development mode (Brevo optional)", () => {
	test("loads successfully without Brevo env vars in development", () => {
		withEnv({ ...DEV_REQUIRED_ENV }, () => {
			expect(() => loadConfig()).not.toThrow();
		});
	});

	test("returns null for Brevo vars when not set in development", () => {
		withEnv({ ...DEV_REQUIRED_ENV }, () => {
			const config = loadConfig();
			expect(config.brevoApiKey).toBeNull();
			expect(config.emailFrom).toBeNull();
		});
	});

	test("returns Brevo vars when set in development", () => {
		withEnv(
			{
				...DEV_REQUIRED_ENV,
				BREVO_API_KEY: "xkeysib-dev-brevo-key",
				EMAIL_FROM: "dev@example.com",
			},
			() => {
				const config = loadConfig();
				expect(config.brevoApiKey).toBe("xkeysib-dev-brevo-key");
				expect(config.emailFrom).toBe("dev@example.com");
			},
		);
	});
});

describe("loadConfig - production mode (Brevo required)", () => {
	test("throws when BREVO_API_KEY is missing in production", () => {
		withEnv({ ...PROD_REQUIRED_ENV, BREVO_API_KEY: undefined }, () => {
			expect(() => loadConfig()).toThrow("Missing required environment variable: BREVO_API_KEY");
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
			expect(config.brevoApiKey).toBe("xkeysib-test-brevo-key");
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

describe("loadConfig - DAILY_SEND_TIME_UTC validation", () => {
	test("defaults to 13:00 when DAILY_SEND_TIME_UTC is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, DAILY_SEND_TIME_UTC: undefined }, () => {
			const config = loadConfig();
			expect(config.dailySendTimeUtc).toBe("13:00");
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
	test("defaults to 200 when MAX_SUBSCRIBERS is not set", () => {
		withEnv({ ...DEV_REQUIRED_ENV, MAX_SUBSCRIBERS: undefined }, () => {
			const config = loadConfig();
			expect(config.maxSubscribers).toBe(200);
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
				expect(config.brevoApiKey).toBeNull();
				expect(config.emailFrom).toBeNull();
				expect(config.port).toBe(3000);
				expect(config.dailySendTimeUtc).toBe("13:00");
				expect(config.maxSubscribers).toBe(200);
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
				expect(config.brevoApiKey).toBe("xkeysib-test-brevo-key");
				expect(config.emailFrom).toBe("facts@example.com");
				expect(config.port).toBe(3000);
				expect(config.dailySendTimeUtc).toBe("13:00");
				expect(config.maxSubscribers).toBe(200);
				expect(config.databasePath).toBe("./data/platypus-facts.db");
				expect(config.openaiApiKey).toBeNull();
			},
		);
	});
});
