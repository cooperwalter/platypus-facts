import type { Database } from "bun:sqlite";
import { loadConfig } from "../lib/config";
import { createDatabase } from "../lib/db";
import {
	dailyFactEmailHtml,
	dailyFactEmailPlain,
	unsubscribeHeaders,
} from "../lib/email-templates";
import type { EmailProvider } from "../lib/email/types";
import { selectAndRecordFact } from "../lib/fact-cycling";
import { getFactWithSources } from "../lib/facts";
import { getSentFactByDate } from "../lib/facts";
import { dailyFactMessage } from "../lib/sms-templates";
import { createSmsProvider } from "../lib/sms/index";
import type { SmsProvider } from "../lib/sms/types";
import { getActiveSubscribers } from "../lib/subscribers";
import { syncFacts } from "../scripts/sync-facts";

interface DailySendResult {
	alreadySent: boolean;
	factId: number | null;
	subscriberCount: number;
	successCount: number;
	failureCount: number;
	smsSuccess: number;
	smsFail: number;
	emailSuccess: number;
	emailFail: number;
}

function getUtcToday(): string {
	return new Date().toISOString().split("T")[0];
}

async function runDailySend(
	db: Database,
	smsProvider: SmsProvider,
	baseUrl: string,
	todayOverride?: string,
	emailProvider?: EmailProvider | null,
	force?: boolean,
): Promise<DailySendResult> {
	const emptyResult: DailySendResult = {
		alreadySent: false,
		factId: null,
		subscriberCount: 0,
		successCount: 0,
		failureCount: 0,
		smsSuccess: 0,
		smsFail: 0,
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

	const factUrl = `${baseUrl}/facts/${selected.factId}`;
	const smsMessage = dailyFactMessage(factData.fact.text, factUrl);
	const imageUrl = factData.fact.image_path ? `${baseUrl}/${factData.fact.image_path}` : undefined;

	const subscribers = getActiveSubscribers(db);
	let smsSuccess = 0;
	let smsFail = 0;
	let emailSuccess = 0;
	let emailFail = 0;

	for (const subscriber of subscribers) {
		if (subscriber.phone_number) {
			try {
				await smsProvider.sendSms(subscriber.phone_number, smsMessage, imageUrl);
				smsSuccess++;
			} catch (error) {
				smsFail++;
				const masked = `***${subscriber.phone_number.slice(-4)}`;
				console.error(
					`Failed to send SMS to ${masked}:`,
					error instanceof Error ? error.message : error,
				);
			}
		}

		if (subscriber.email && emailProvider) {
			const unsubUrl = `${baseUrl}/unsubscribe/${subscriber.token}`;
			try {
				await emailProvider.sendEmail(
					subscriber.email,
					"🦆 Daily Platypus Fact",
					dailyFactEmailHtml({
						factText: factData.fact.text,
						sources: factData.sources,
						imageUrl: imageUrl ?? null,
						unsubscribeUrl: unsubUrl,
					}),
					dailyFactEmailPlain({
						factText: factData.fact.text,
						sources: factData.sources,
						imageUrl: null,
						unsubscribeUrl: unsubUrl,
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
	}

	const successCount = smsSuccess + emailSuccess;
	const failureCount = smsFail + emailFail;

	console.log(
		`Daily send complete for ${today}: fact_id=${selected.factId}, cycle=${selected.cycle}, ` +
			`subscribers=${subscribers.length}, success=${successCount}, failures=${failureCount}` +
			` (sms=${smsSuccess}/${smsSuccess + smsFail}, email=${emailSuccess}/${emailSuccess + emailFail})`,
	);

	return {
		alreadySent: false,
		factId: selected.factId,
		subscriberCount: subscribers.length,
		successCount,
		failureCount,
		smsSuccess,
		smsFail,
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

	const db = createDatabase(config.databasePath);
	const smsProvider = createSmsProvider(undefined, db);
	const ep = createEmailProvider(config, db);

	try {
		const syncResult = await syncFacts(db, undefined, config.openaiApiKey);
		console.log(
			`Fact sync: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.unchanged} unchanged`,
		);
	} catch (error) {
		console.error("Fact sync failed:", error);
		db.close();
		process.exit(1);
	}

	try {
		await runDailySend(db, smsProvider, config.baseUrl, undefined, ep, force);
	} catch (error) {
		console.error("Daily send failed:", error);
		db.close();
		process.exit(1);
	}

	db.close();
}
