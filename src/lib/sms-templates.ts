function welcomeMessage(): string {
	return "Welcome to Daily Platypus Facts! Inspired by Life is Strange: Double Exposure. 🦆\nReply 1 or PERRY to confirm and start receiving a platypus fact every day.";
}

function confirmationSuccessMessage(): string {
	return "You're now a Platypus Fan! You'll receive one platypus fact every day. Reply STOP at any time to unsubscribe.";
}

function alreadySubscribedMessage(): string {
	return "You're already a Platypus Fan! Reply STOP to unsubscribe.";
}

function unsubscribedUserMessage(baseUrl: string): string {
	return `You've unsubscribed from Daily Platypus Facts. To re-subscribe, visit ${baseUrl}`;
}

function helpMessage(): string {
	return "Daily Platypus Facts: Reply 1 or PERRY to confirm your subscription. Reply STOP to unsubscribe.";
}

function atCapacityMessage(): string {
	return "Sorry, Daily Platypus Facts is currently at capacity! We can't confirm your subscription right now. Please try again later.";
}

function dailyFactMessage(factText: string, factUrl: string): string {
	return `🦆 Daily Platypus Fact:\n${factText}\n\nSources: ${factUrl}`;
}

export {
	welcomeMessage,
	confirmationSuccessMessage,
	alreadySubscribedMessage,
	unsubscribedUserMessage,
	helpMessage,
	atCapacityMessage,
	dailyFactMessage,
};
