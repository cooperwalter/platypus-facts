import { describe, expect, test } from "bun:test";
import {
	alreadySubscribedMessage,
	atCapacityMessage,
	confirmationSuccessMessage,
	dailyFactMessage,
	helpMessage,
	unsubscribedUserMessage,
	welcomeMessage,
} from "./sms-templates";

describe("sms-templates", () => {
	test("welcomeMessage includes Life is Strange: Double Exposure attribution", () => {
		const message = welcomeMessage();
		expect(message).toContain("Life is Strange: Double Exposure");
	});

	test("welcomeMessage includes duck emoji", () => {
		const message = welcomeMessage();
		expect(message).toContain("🦆");
	});

	test("welcomeMessage includes confirmation instructions for 1 and PERRY", () => {
		const message = welcomeMessage();
		expect(message).toContain("Reply 1 or PERRY to confirm");
	});

	test("welcomeMessage returns exact spec text", () => {
		expect(welcomeMessage()).toBe(
			"Welcome to Daily Platypus Facts! Inspired by Life is Strange: Double Exposure. 🦆\nReply 1 or PERRY to confirm and start receiving a platypus fact every day.",
		);
	});

	test("confirmationSuccessMessage returns exact spec text", () => {
		expect(confirmationSuccessMessage()).toBe(
			"You're now a Platypus Fan! You'll receive one platypus fact every day. Reply STOP at any time to unsubscribe.",
		);
	});

	test("alreadySubscribedMessage returns exact spec text", () => {
		expect(alreadySubscribedMessage()).toBe(
			"You're already a Platypus Fan! Reply STOP to unsubscribe.",
		);
	});

	test("unsubscribedUserMessage interpolates baseUrl correctly", () => {
		const message = unsubscribedUserMessage("https://example.com");
		expect(message).toBe(
			"You've unsubscribed from Daily Platypus Facts. To re-subscribe, visit https://example.com",
		);
	});

	test("unsubscribedUserMessage works with different base URLs", () => {
		const message = unsubscribedUserMessage("https://platypus.fun");
		expect(message).toContain("https://platypus.fun");
	});

	test("helpMessage returns exact spec text", () => {
		expect(helpMessage()).toBe(
			"Daily Platypus Facts: Reply 1 or PERRY to confirm your subscription. Reply STOP to unsubscribe.",
		);
	});

	test("atCapacityMessage returns exact spec text", () => {
		expect(atCapacityMessage()).toBe(
			"Sorry, Daily Platypus Facts is currently at capacity! We can't confirm your subscription right now. Please try again later.",
		);
	});

	test("dailyFactMessage interpolates factText and factUrl correctly", () => {
		const message = dailyFactMessage(
			"Platypuses are venomous mammals!",
			"https://example.com/facts/1",
		);
		expect(message).toBe(
			"🦆 Daily Platypus Fact:\nPlatypuses are venomous mammals!\n\nSources: https://example.com/facts/1",
		);
	});

	test("dailyFactMessage includes duck emoji prefix", () => {
		const message = dailyFactMessage("Test fact", "https://example.com/facts/1");
		expect(message).toContain("🦆");
	});

	test("no-argument templates return consistent strings across multiple calls", () => {
		expect(welcomeMessage()).toBe(welcomeMessage());
		expect(confirmationSuccessMessage()).toBe(confirmationSuccessMessage());
		expect(alreadySubscribedMessage()).toBe(alreadySubscribedMessage());
		expect(helpMessage()).toBe(helpMessage());
		expect(atCapacityMessage()).toBe(atCapacityMessage());
	});
});
