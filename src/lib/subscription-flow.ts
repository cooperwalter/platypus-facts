import type { Database } from "bun:sqlite";
import { validateAndNormalizePhone } from "./phone";
import {
	alreadySubscribedMessage,
	atCapacityMessage,
	confirmationSuccessMessage,
	helpMessage,
	unsubscribedUserMessage,
	welcomeMessage,
} from "./sms-templates";
import type { SmsProvider } from "./sms/types";
import { createSubscriber, findByPhoneNumber, getActiveCount, updateStatus } from "./subscribers";

interface SignupResult {
	success: boolean;
	message: string;
}

const STOP_WORDS = new Set([
	"stop",
	"stopall",
	"unsubscribe",
	"cancel",
	"end",
	"quit",
	"revoke",
	"optout",
]);

async function signup(
	db: Database,
	smsProvider: SmsProvider,
	phoneInput: string,
	maxSubscribers: number,
): Promise<SignupResult> {
	const validation = validateAndNormalizePhone(phoneInput);
	if (!validation.valid) {
		return { success: false, message: validation.error };
	}
	const phone = validation.normalized;

	const existing = findByPhoneNumber(db, phone);

	if (existing) {
		if (existing.status === "pending") {
			await smsProvider.sendSms(phone, welcomeMessage());
			return {
				success: true,
				message:
					"We've resent your confirmation message. Please check your phone and reply to confirm.",
			};
		}

		if (existing.status === "active") {
			await smsProvider.sendSms(phone, alreadySubscribedMessage());
			return {
				success: true,
				message: "You're already subscribed! Check your phone for details.",
			};
		}

		if (existing.status === "unsubscribed") {
			updateStatus(db, existing.id, "pending", {
				unsubscribed_at: null,
			});
			await smsProvider.sendSms(phone, welcomeMessage());
			return {
				success: true,
				message: "Welcome back! Please check your phone and reply to confirm your subscription.",
			};
		}
	}

	const activeCount = getActiveCount(db);
	if (activeCount >= maxSubscribers) {
		return {
			success: false,
			message: "We're currently at capacity! Please try again later.",
		};
	}

	try {
		createSubscriber(db, phone);
	} catch (error: unknown) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		if (errorMsg.includes("UNIQUE constraint failed")) {
			const retryExisting = findByPhoneNumber(db, phone);
			if (retryExisting && retryExisting.status === "pending") {
				await smsProvider.sendSms(phone, welcomeMessage());
				return {
					success: true,
					message:
						"We've resent your confirmation message. Please check your phone and reply to confirm.",
				};
			}
		}
		throw error;
	}

	await smsProvider.sendSms(phone, welcomeMessage());
	return {
		success: true,
		message: "Please check your phone and reply to confirm your subscription.",
	};
}

async function handleIncomingMessage(
	db: Database,
	from: string,
	body: string,
	baseUrl: string,
	maxSubscribers: number,
): Promise<string | undefined> {
	const trimmedBody = body.trim().toLowerCase();
	const validation = validateAndNormalizePhone(from);
	const normalizedFrom = validation.valid ? validation.normalized : from;

	const isStop = STOP_WORDS.has(trimmedBody);

	const subscriber = findByPhoneNumber(db, normalizedFrom);

	if (isStop && subscriber) {
		updateStatus(db, subscriber.id, "unsubscribed", {
			unsubscribed_at: new Date().toISOString(),
		});
		return undefined;
	}

	if (!subscriber) {
		return helpMessage();
	}

	if (subscriber.status === "unsubscribed") {
		return unsubscribedUserMessage(baseUrl);
	}

	if (subscriber.status === "pending") {
		const isConfirmation = trimmedBody === "1" || trimmedBody === "perry";
		if (isConfirmation) {
			const activeCount = getActiveCount(db);
			if (activeCount >= maxSubscribers) {
				return atCapacityMessage();
			}
			updateStatus(db, subscriber.id, "active", {
				confirmed_at: new Date().toISOString(),
			});
			return confirmationSuccessMessage();
		}
		return helpMessage();
	}

	return helpMessage();
}

export type { SignupResult };
export { signup, handleIncomingMessage };
