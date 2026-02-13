import type { DrizzleDatabase } from "../lib/db";
import { getDatabaseSizeBytes } from "../lib/db";
import { getFactStats, getLastSend } from "../lib/facts";
import { getSubscriberCounts } from "../lib/subscribers";

function formatUptime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	return `${days}d ${hours}h ${minutes}m`;
}

function handleHealthCheck(
	request: Request,
	db: DrizzleDatabase,
	databasePath: string,
	startTime: number,
): Response {
	const url = new URL(request.url);
	const detail = url.searchParams.get("detail") === "true";

	if (!detail) {
		return new Response(JSON.stringify({ status: "ok" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	const subscriberCounts = getSubscriberCounts(db);
	const factStats = getFactStats(db);
	const lastSend = getLastSend(db);
	const sizeBytes = getDatabaseSizeBytes(databasePath);
	const uptimeMs = Date.now() - startTime;

	const body = {
		status: "ok",
		subscribers: subscriberCounts,
		facts: {
			total: factStats.total,
			withImages: factStats.withImages,
			currentCycle: factStats.currentCycle,
		},
		lastSend: lastSend ? { date: lastSend.date, factId: lastSend.factId } : null,
		database: {
			sizeBytes,
			sizeMB: Math.round((sizeBytes / 1048576) * 100) / 100,
		},
		uptime: {
			seconds: Math.floor(uptimeMs / 1000),
			formatted: formatUptime(uptimeMs),
		},
	};

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

export { handleHealthCheck, formatUptime };
