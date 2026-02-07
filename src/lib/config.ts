interface Config {
	nodeEnv: "development" | "production";
	port: number;
	baseUrl: string;
	databasePath: string;
	twilioAccountSid: string | null;
	twilioAuthToken: string | null;
	twilioPhoneNumber: string | null;
	postmarkApiToken: string | null;
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

function validateE164(phone: string): boolean {
	return /^\+\d{10,15}$/.test(phone);
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

	let twilioAccountSid: string | null = null;
	let twilioAuthToken: string | null = null;
	let twilioPhoneNumber: string | null = null;

	if (isProduction) {
		twilioAccountSid = requireEnv("TWILIO_ACCOUNT_SID");
		twilioAuthToken = requireEnv("TWILIO_AUTH_TOKEN");
		twilioPhoneNumber = requireEnv("TWILIO_PHONE_NUMBER");
	} else {
		twilioAccountSid = process.env.TWILIO_ACCOUNT_SID ?? null;
		twilioAuthToken = process.env.TWILIO_AUTH_TOKEN ?? null;
		twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER ?? null;
	}

	if (twilioPhoneNumber && !validateE164(twilioPhoneNumber)) {
		throw new Error(
			`TWILIO_PHONE_NUMBER must be in E.164 format (e.g., +15551234567), got: ${twilioPhoneNumber}`,
		);
	}

	let postmarkApiToken: string | null = null;
	let emailFrom: string | null = null;

	if (isProduction) {
		postmarkApiToken = requireEnv("POSTMARK_API_TOKEN");
		emailFrom = requireEnv("EMAIL_FROM");
	} else {
		postmarkApiToken = process.env.POSTMARK_API_TOKEN ?? null;
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
		twilioAccountSid,
		twilioAuthToken,
		twilioPhoneNumber,
		postmarkApiToken,
		emailFrom,
		dailySendTimeUtc,
		maxSubscribers,
		openaiApiKey,
	};
}

export type { Config };
export { loadConfig };
