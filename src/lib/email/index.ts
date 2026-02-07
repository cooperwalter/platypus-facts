import type { Config } from "../config";
import { DevEmailProvider } from "./dev";
import { PostmarkEmailProvider } from "./postmark";
import type { EmailProvider } from "./types";

function createEmailProvider(config: Config): EmailProvider {
	if (config.postmarkApiToken && config.emailFrom) {
		return new PostmarkEmailProvider(config.postmarkApiToken, config.emailFrom);
	}
	return new DevEmailProvider();
}

export { createEmailProvider };
