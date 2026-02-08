interface Config {
	nodeEnv: "development" | "production";
	port: number;
	baseUrl: string;
	databasePath: string;
	brevoApiKey: string | null;
	emailFrom: string | null;
	dailySendTimeUtc: string;
	maxSubscribers: number;
	openaiApiKey: string | null;
}

function validateTimeFormat(time: string): boolean {
	const match = time.match(/^(\d{2}):(\d{2})$/);
	if (!match) return false;
	const hours = Number.parseInt(match[1], 10);
	const minutes = Number.parseInt(match[2], 10);
	return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

function loadConfig(): Config {
	const nodeEnv = process.env.NODE_ENV === "production" ? "production" : "development";
	const isProduction = nodeEnv === "production";

	const rawBaseUrl = requireEnv("BASE_URL");
	try {
		new URL(rawBaseUrl);
	} catch {
		throw new Error(`BASE_URL must be a valid URL (e.g., https://example.com), got: ${rawBaseUrl}`);
	}
	const baseUrl = rawBaseUrl.replace(/\/+$/, "");

	let brevoApiKey: string | null = null;
	let emailFrom: string | null = null;

	if (isProduction) {
		brevoApiKey = requireEnv("BREVO_API_KEY");
		emailFrom = requireEnv("EMAIL_FROM");
	} else {
		brevoApiKey = process.env.BREVO_API_KEY ?? null;
		emailFrom = process.env.EMAIL_FROM ?? null;
	}

	const dailySendTimeUtc = process.env.DAILY_SEND_TIME_UTC ?? "14:00";
	if (!validateTimeFormat(dailySendTimeUtc)) {
		throw new Error(
			`DAILY_SEND_TIME_UTC must be in HH:MM 24-hour format, got: ${dailySendTimeUtc}`,
		);
	}

	const port = Number.parseInt(process.env.PORT ?? "3000", 10);
	if (Number.isNaN(port) || port < 1 || port > 65535) {
		throw new Error(`PORT must be a valid port number, got: ${process.env.PORT}`);
	}

	const maxSubscribers = Number.parseInt(process.env.MAX_SUBSCRIBERS ?? "1000", 10);
	if (Number.isNaN(maxSubscribers) || maxSubscribers < 1) {
		throw new Error(
			`MAX_SUBSCRIBERS must be a positive integer, got: ${process.env.MAX_SUBSCRIBERS}`,
		);
	}

	const databasePath = process.env.DATABASE_PATH ?? "./data/platypus-facts.db";

	const openaiApiKey = process.env.OPENAI_API_KEY ?? null;

	return {
		nodeEnv,
		port,
		baseUrl,
		databasePath,
		brevoApiKey,
		emailFrom,
		dailySendTimeUtc,
		maxSubscribers,
		openaiApiKey,
	};
}

export type { Config };
export { loadConfig };
