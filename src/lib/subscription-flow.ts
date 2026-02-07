import type { Database } from "bun:sqlite";
import {
	alreadySubscribedEmailHtml,
	alreadySubscribedEmailPlain,
	confirmationEmailHtml,
	confirmationEmailPlain,
	unsubscribeHeaders,
} from "./email-templates";
import { validateEmail } from "./email-validation";
import type { EmailProvider } from "./email/types";
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
import type { Subscriber } from "./subscribers";
import {
	createSubscriber,
	findByEmail,
	findByPhoneNumber,
	getActiveCount,
	updateContactInfo,
	updateStatus,
} from "./subscribers";

interface SignupResult {
	success: boolean;
	message: string;
}

interface SignupInput {
	phone?: string;
	email?: string;
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

async function sendConfirmations(
	smsProvider: SmsProvider,
	emailProvider: EmailProvider | null,
	phone: string | null,
	email: string | null,
	token: string,
	baseUrl: string,
): Promise<void> {
	if (phone) {
		await smsProvider.sendSms(phone, welcomeMessage());
	}
	if (email && emailProvider) {
		const confirmUrl = `${baseUrl}/confirm/${token}`;
		const unsubUrl = `${baseUrl}/unsubscribe/${token}`;
		await emailProvider.sendEmail(
			email,
			"Confirm your Daily Platypus Facts subscription",
			confirmationEmailHtml({ confirmUrl }),
			confirmationEmailPlain({ confirmUrl }),
			unsubscribeHeaders(unsubUrl),
		);
	}
}

async function sendAlreadySubscribed(
	smsProvider: SmsProvider,
	emailProvider: EmailProvider | null,
	phone: string | null,
	email: string | null,
	token: string,
	baseUrl: string,
): Promise<void> {
	if (phone) {
		await smsProvider.sendSms(phone, alreadySubscribedMessage());
	}
	if (email && emailProvider) {
		const unsubUrl = `${baseUrl}/unsubscribe/${token}`;
		await emailProvider.sendEmail(
			email,
			"You're already a Platypus Fan!",
			alreadySubscribedEmailHtml(),
			alreadySubscribedEmailPlain(),
			unsubscribeHeaders(unsubUrl),
		);
	}
}

function buildChannelMessage(phone: string | null, email: string | null): string {
	if (phone && email) {
		return "Please check your phone and/or email to confirm your subscription.";
	}
	if (email) {
		return "Please check your email to confirm your subscription.";
	}
	return "Please check your phone and reply to confirm your subscription.";
}

async function signup(
	db: Database,
	smsProvider: SmsProvider,
	input: SignupInput,
	maxSubscribers: number,
	baseUrl: string,
	emailProvider?: EmailProvider | null,
): Promise<SignupResult> {
	let phone: string | null = null;
	let email: string | null = null;

	if (input.phone) {
		const validation = validateAndNormalizePhone(input.phone);
		if (!validation.valid) {
			return { success: false, message: validation.error };
		}
		phone = validation.normalized;
	}

	if (input.email) {
		const validation = validateEmail(input.email);
		if (!validation.valid) {
			return { success: false, message: validation.error };
		}
		email = validation.normalized;
	}

	if (!phone && !email) {
		return { success: false, message: "Please provide a phone number or email address." };
	}

	const ep = emailProvider ?? null;

	const phoneMatch = phone ? findByPhoneNumber(db, phone) : null;
	const emailMatch = email ? findByEmail(db, email) : null;

	if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
		return {
			success: false,
			message:
				"This contact info is associated with different accounts. Please use the same phone number and email you originally signed up with, or sign up with just one.",
		};
	}

	const existing = phoneMatch ?? emailMatch;

	if (existing) {
		updateContactInfo(db, existing.id, { phone, email });

		if (existing.status === "pending") {
			await sendConfirmations(smsProvider, ep, phone, email, existing.token, baseUrl);
			return {
				success: true,
				message: `We've resent your confirmation. ${buildChannelMessage(phone, email)}`,
			};
		}

		if (existing.status === "active") {
			await sendAlreadySubscribed(smsProvider, ep, phone, email, existing.token, baseUrl);
			return {
				success: true,
				message: "You're already subscribed!",
			};
		}

		if (existing.status === "unsubscribed") {
			updateStatus(db, existing.id, "pending", { unsubscribed_at: null });
			await sendConfirmations(smsProvider, ep, phone, email, existing.token, baseUrl);
			return {
				success: true,
				message: `Welcome back! ${buildChannelMessage(phone, email)}`,
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

	let subscriber: Subscriber;
	try {
		subscriber = createSubscriber(db, { phone: phone ?? undefined, email: email ?? undefined });
	} catch (error: unknown) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		if (errorMsg.includes("UNIQUE constraint failed")) {
			const retryMatch = phone ? findByPhoneNumber(db, phone) : null;
			const retryEmailMatch = !retryMatch && email ? findByEmail(db, email) : null;
			const retryExisting = retryMatch ?? retryEmailMatch;
			if (retryExisting) {
				updateContactInfo(db, retryExisting.id, { phone, email });
				if (retryExisting.status === "pending") {
					await sendConfirmations(smsProvider, ep, phone, email, retryExisting.token, baseUrl);
					return {
						success: true,
						message: `We've resent your confirmation. ${buildChannelMessage(phone, email)}`,
					};
				}
				if (retryExisting.status === "active") {
					await sendAlreadySubscribed(smsProvider, ep, phone, email, retryExisting.token, baseUrl);
					return { success: true, message: "You're already subscribed!" };
				}
				if (retryExisting.status === "unsubscribed") {
					updateStatus(db, retryExisting.id, "pending", { unsubscribed_at: null });
					await sendConfirmations(smsProvider, ep, phone, email, retryExisting.token, baseUrl);
					return {
						success: true,
						message: `Welcome back! ${buildChannelMessage(phone, email)}`,
					};
				}
			}
		}
		throw error;
	}

	await sendConfirmations(smsProvider, ep, phone, email, subscriber.token, baseUrl);
	return {
		success: true,
		message: buildChannelMessage(phone, email),
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

export type { SignupResult, SignupInput };
export { signup, handleIncomingMessage };
