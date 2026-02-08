import type { Config } from "../config";
import type { DrizzleDatabase } from "../db";
import { BrevoEmailProvider } from "./brevo";
import { DevEmailProvider } from "./dev";
import type { EmailProvider } from "./types";

function createEmailProvider(config: Config, db?: DrizzleDatabase): EmailProvider {
	if (config.brevoApiKey && config.emailFrom) {
		return new BrevoEmailProvider(config.brevoApiKey, config.emailFrom);
	}
	if (!db) {
		throw new Error("Database is required for DevEmailProvider");
	}
	return new DevEmailProvider(db);
}

export { createEmailProvider };
