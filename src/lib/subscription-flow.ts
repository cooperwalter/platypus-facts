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
import { createSubscriber, findByEmail, getActiveCount, updateStatus } from "./subscribers";

interface SignupResult {
	success: boolean;
	message: string;
}

async function sendConfirmation(
	emailProvider: EmailProvider,
	email: string,
	token: string,
	baseUrl: string,
): Promise<void> {
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

async function sendAlreadySubscribed(
	emailProvider: EmailProvider,
	email: string,
	token: string,
	baseUrl: string,
): Promise<void> {
	const unsubUrl = `${baseUrl}/unsubscribe/${token}`;
	await emailProvider.sendEmail(
		email,
		"You're already a Platypus Fan!",
		alreadySubscribedEmailHtml(),
		alreadySubscribedEmailPlain(),
		unsubscribeHeaders(unsubUrl),
	);
}

async function signup(
	db: Database,
	emailProvider: EmailProvider,
	email: string | undefined,
	maxSubscribers: number,
	baseUrl: string,
): Promise<SignupResult> {
	if (!email) {
		return { success: false, message: "Please provide an email address." };
	}

	const validation = validateEmail(email);
	if (!validation.valid) {
		return { success: false, message: validation.error };
	}
	const normalizedEmail = validation.normalized;

	const existing = findByEmail(db, normalizedEmail);

	if (existing) {
		if (existing.status === "pending") {
			await sendConfirmation(emailProvider, normalizedEmail, existing.token, baseUrl);
			return {
				success: true,
				message:
					"We've resent your confirmation. Please check your email to confirm your subscription.",
			};
		}

		if (existing.status === "active") {
			await sendAlreadySubscribed(emailProvider, normalizedEmail, existing.token, baseUrl);
			return {
				success: true,
				message: "You're already subscribed!",
			};
		}

		if (existing.status === "unsubscribed") {
			updateStatus(db, existing.id, "pending", { unsubscribed_at: null });
			await sendConfirmation(emailProvider, normalizedEmail, existing.token, baseUrl);
			return {
				success: true,
				message: "Welcome back! Please check your email to confirm your subscription.",
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

	let subscriber: { token: string };
	try {
		subscriber = createSubscriber(db, normalizedEmail);
	} catch (error: unknown) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		if (errorMsg.includes("UNIQUE constraint failed")) {
			const retryMatch = findByEmail(db, normalizedEmail);
			if (retryMatch) {
				if (retryMatch.status === "pending") {
					await sendConfirmation(emailProvider, normalizedEmail, retryMatch.token, baseUrl);
					return {
						success: true,
						message:
							"We've resent your confirmation. Please check your email to confirm your subscription.",
					};
				}
				if (retryMatch.status === "active") {
					await sendAlreadySubscribed(emailProvider, normalizedEmail, retryMatch.token, baseUrl);
					return { success: true, message: "You're already subscribed!" };
				}
				if (retryMatch.status === "unsubscribed") {
					updateStatus(db, retryMatch.id, "pending", { unsubscribed_at: null });
					await sendConfirmation(emailProvider, normalizedEmail, retryMatch.token, baseUrl);
					return {
						success: true,
						message: "Welcome back! Please check your email to confirm your subscription.",
					};
				}
			}
		}
		throw error;
	}

	await sendConfirmation(emailProvider, normalizedEmail, subscriber.token, baseUrl);
	return {
		success: true,
		message: "Please check your email to confirm your subscription.",
	};
}

export type { SignupResult };
export { signup };
