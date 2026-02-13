import { loadConfig } from "../lib/config";
import { createDatabase } from "../lib/db";
import type { DrizzleDatabase } from "../lib/db";
import {
	dailyFactEmailHtml,
	dailyFactEmailPlain,
	unsubscribeHeaders,
} from "../lib/email-templates";
import type { EmailProvider } from "../lib/email/types";
import { selectAndRecordFact } from "../lib/fact-cycling";
import { getFactWithSources } from "../lib/facts";
import { getSentFactByDate } from "../lib/facts";
import { getActiveSubscribers } from "../lib/subscribers";
import { syncFacts } from "../scripts/sync-facts";

interface DailySendResult {
	alreadySent: boolean;
	factId: number | null;
	subscriberCount: number;
	emailSuccess: number;
	emailFail: number;
}

function getUtcToday(): string {
	return new Date().toISOString().split("T")[0];
}

async function runDailySend(
	db: DrizzleDatabase,
	emailProvider: EmailProvider,
	baseUrl: string,
	todayOverride?: string,
	force?: boolean,
): Promise<DailySendResult> {
	const emptyResult: DailySendResult = {
		alreadySent: false,
		factId: null,
		subscriberCount: 0,
		emailSuccess: 0,
		emailFail: 0,
	};

	const today = todayOverride ?? getUtcToday();

	const existingSend = getSentFactByDate(db, today);
	if (existingSend && !force) {
		console.log(`Fact already sent for ${today} (fact_id=${existingSend.fact_id}), skipping.`);
		return { ...emptyResult, alreadySent: true, factId: existingSend.fact_id };
	}

	let selected: { factId: number; cycle: number } | null;
	if (existingSend && force) {
		selected = { factId: existingSend.fact_id, cycle: 0 };
		console.log(`Force mode: re-sending fact_id=${existingSend.fact_id} for ${today}.`);
	} else {
		try {
			selected = selectAndRecordFact(db, today);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg.includes("UNIQUE constraint failed")) {
				const existingAfterRace = getSentFactByDate(db, today);
				if (existingAfterRace) {
					if (force) {
						selected = { factId: existingAfterRace.fact_id, cycle: 0 };
						console.log(
							`Force mode (race): re-sending fact_id=${existingAfterRace.fact_id} for ${today}.`,
						);
					} else {
						console.log(
							`Fact already sent for ${today} (race detected, fact_id=${existingAfterRace.fact_id}), skipping.`,
						);
						return {
							...emptyResult,
							alreadySent: true,
							factId: existingAfterRace.fact_id,
						};
					}
				} else {
					throw error;
				}
			} else {
				throw error;
			}
		}
	}
	if (!selected) {
		console.warn("No facts in database. Skipping daily send.");
		return emptyResult;
	}

	const factData = getFactWithSources(db, selected.factId);
	if (!factData) {
		console.error(`Selected fact ${selected.factId} not found in database.`);
		return { ...emptyResult, factId: selected.factId };
	}

	const imageUrl = factData.fact.image_path ? `${baseUrl}/${factData.fact.image_path}` : undefined;

	const subscribers = getActiveSubscribers(db);
	let emailSuccess = 0;
	let emailFail = 0;

	const factPageUrl = `${baseUrl}/facts/${selected.factId}`;

	for (const subscriber of subscribers) {
		const unsubUrl = `${baseUrl}/unsubscribe/${subscriber.token}`;
		try {
			await emailProvider.sendEmail(
				subscriber.email,
				"🦆 Daily Platypus Fact",
				dailyFactEmailHtml({
					factText: factData.fact.text,
					sources: factData.sources,
					imageUrl: imageUrl ?? null,
					factPageUrl,
					unsubscribeUrl: unsubUrl,
					baseUrl,
				}),
				dailyFactEmailPlain({
					factText: factData.fact.text,
					sources: factData.sources,
					imageUrl: null,
					factPageUrl,
					unsubscribeUrl: unsubUrl,
					baseUrl,
				}),
				unsubscribeHeaders(unsubUrl),
			);
			emailSuccess++;
		} catch (error) {
			emailFail++;
			const masked = `***${subscriber.email.split("@")[0].slice(-3)}@${subscriber.email.split("@")[1]}`;
			console.error(
				`Failed to send email to ${masked}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	console.log(
		`Daily send complete for ${today}: fact_id=${selected.factId}, cycle=${selected.cycle}, ` +
			`subscribers=${subscribers.length}, email=${emailSuccess}/${emailSuccess + emailFail}`,
	);

	return {
		alreadySent: false,
		factId: selected.factId,
		subscriberCount: subscribers.length,
		emailSuccess,
		emailFail,
	};
}

export type { DailySendResult };
export { runDailySend };

if (import.meta.main) {
	const { createEmailProvider } = await import("../lib/email/index");

	const force = process.argv.includes("--force");
	const config = loadConfig();

	if (force && config.nodeEnv === "production") {
		console.error("The --force flag is not allowed in production.");
		process.exit(1);
	}

	const { db, sqlite } = createDatabase(config.databasePath);
	const ep = createEmailProvider(config, db);

	try {
		const syncResult = await syncFacts(db, undefined, config.openaiApiKey);
		console.log(
			`Fact sync: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.unchanged} unchanged`,
		);
	} catch (error) {
		console.error("Fact sync failed:", error);
		sqlite.close();
		process.exit(1);
	}

	try {
		await runDailySend(db, ep, config.baseUrl, undefined, force);
	} catch (error) {
		console.error("Daily send failed:", error);
		sqlite.close();
		process.exit(1);
	}

	sqlite.close();
}
