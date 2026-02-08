import type { DrizzleDatabase } from "../db";
import type { Config } from "../config";
import { DevEmailProvider } from "./dev";
import { PostmarkEmailProvider } from "./postmark";
import type { EmailProvider } from "./types";

function createEmailProvider(config: Config, db?: DrizzleDatabase): EmailProvider {
	if (config.postmarkApiToken && config.emailFrom) {
		return new PostmarkEmailProvider(config.postmarkApiToken, config.emailFrom);
	}
	if (!db) {
		throw new Error("Database is required for DevEmailProvider");
	}
	return new DevEmailProvider(db);
}

export { createEmailProvider };
