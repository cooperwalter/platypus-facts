import type { Database } from "bun:sqlite";
import { loadConfig } from "../lib/config";
import { createDatabase } from "../lib/db";
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
}

function getUtcToday(): string {
	return new Date().toISOString().split("T")[0];
}

async function runDailySend(
	db: Database,
	smsProvider: SmsProvider,
	baseUrl: string,
	todayOverride?: string,
): Promise<DailySendResult> {
	const today = todayOverride ?? getUtcToday();

	const existingSend = getSentFactByDate(db, today);
	if (existingSend) {
		console.log(`Fact already sent for ${today} (fact_id=${existingSend.fact_id}), skipping.`);
		return {
			alreadySent: true,
			factId: existingSend.fact_id,
			subscriberCount: 0,
			successCount: 0,
			failureCount: 0,
		};
	}

	const selected = selectAndRecordFact(db, today);
	if (!selected) {
		console.warn("No facts in database. Skipping daily send.");
		return {
			alreadySent: false,
			factId: null,
			subscriberCount: 0,
			successCount: 0,
			failureCount: 0,
		};
	}

	const factData = getFactWithSources(db, selected.factId);
	if (!factData) {
		console.error(`Selected fact ${selected.factId} not found in database.`);
		return {
			alreadySent: false,
			factId: selected.factId,
			subscriberCount: 0,
			successCount: 0,
			failureCount: 0,
		};
	}

	const factUrl = `${baseUrl}/facts/${selected.factId}`;
	const message = dailyFactMessage(factData.fact.text, factUrl);

	const subscribers = getActiveSubscribers(db);
	let successCount = 0;
	let failureCount = 0;

	for (const subscriber of subscribers) {
		try {
			await smsProvider.sendSms(subscriber.phone_number, message);
			successCount++;
		} catch (error) {
			failureCount++;
			const masked = `***${subscriber.phone_number.slice(-4)}`;
			console.error(
				`Failed to send SMS to ${masked}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	console.log(
		`Daily send complete for ${today}: fact_id=${selected.factId}, cycle=${selected.cycle}, ` +
			`subscribers=${subscribers.length}, success=${successCount}, failures=${failureCount}`,
	);

	return {
		alreadySent: false,
		factId: selected.factId,
		subscriberCount: subscribers.length,
		successCount,
		failureCount,
	};
}

export type { DailySendResult };
export { runDailySend };

if (import.meta.main) {
	const config = loadConfig();
	const db = createDatabase(config.databasePath);
	const smsProvider = createSmsProvider();

	try {
		const syncResult = await syncFacts(db);
		console.log(
			`Fact sync: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.unchanged} unchanged`,
		);
	} catch (error) {
		console.error("Fact sync failed:", error);
		db.close();
		process.exit(1);
	}

	try {
		await runDailySend(db, smsProvider, config.baseUrl);
	} catch (error) {
		console.error("Daily send failed:", error);
		db.close();
		process.exit(1);
	}

	db.close();
}
