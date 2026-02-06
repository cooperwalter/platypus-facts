interface Config {
	port: number;
	baseUrl: string;
	databasePath: string;
	twilioAccountSid: string;
	twilioAuthToken: string;
	twilioPhoneNumber: string;
	dailySendTimeUtc: string;
	maxSubscribers: number;
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
	const rawBaseUrl = requireEnv("BASE_URL");
	try {
		new URL(rawBaseUrl);
	} catch {
		throw new Error(`BASE_URL must be a valid URL (e.g., https://example.com), got: ${rawBaseUrl}`);
	}
	const baseUrl = rawBaseUrl.replace(/\/+$/, "");

	const twilioAccountSid = requireEnv("TWILIO_ACCOUNT_SID");
	const twilioAuthToken = requireEnv("TWILIO_AUTH_TOKEN");
	const twilioPhoneNumber = requireEnv("TWILIO_PHONE_NUMBER");

	if (!validateE164(twilioPhoneNumber)) {
		throw new Error(
			`TWILIO_PHONE_NUMBER must be in E.164 format (e.g., +15551234567), got: ${twilioPhoneNumber}`,
		);
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

	return {
		port,
		baseUrl,
		databasePath,
		twilioAccountSid,
		twilioAuthToken,
		twilioPhoneNumber,
		dailySendTimeUtc,
		maxSubscribers,
	};
}

export type { Config };
export { loadConfig };
