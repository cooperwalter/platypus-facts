import { describe, expect, test } from "bun:test";
import {
	alreadySubscribedEmailHtml,
	alreadySubscribedEmailPlain,
	confirmationEmailHtml,
	confirmationEmailPlain,
	dailyFactEmailHtml,
	dailyFactEmailPlain,
	unsubscribeHeaders,
} from "./email-templates";

describe("dailyFactEmailHtml", () => {
	test("includes fact text in HTML body", () => {
		const html = dailyFactEmailHtml({
			factText: "Platypuses are venomous.",
			sources: [{ url: "https://example.com", title: "Wikipedia" }],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("Platypuses are venomous.");
	});

	test("includes image tag when imageUrl is provided", () => {
		const html = dailyFactEmailHtml({
			factText: "Platypuses are venomous.",
			sources: [],
			imageUrl: "https://example.com/images/facts/1.png",
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("<img");
		expect(html).toContain("https://example.com/images/facts/1.png");
	});

	test("omits image tag entirely when imageUrl is null", () => {
		const html = dailyFactEmailHtml({
			factText: "Platypuses are venomous.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).not.toContain("<img");
	});

	test("includes source links for valid URLs", () => {
		const html = dailyFactEmailHtml({
			factText: "Fact.",
			sources: [
				{ url: "https://example.com/source1", title: "Source 1" },
				{ url: "https://example.com/source2", title: null },
			],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("Source 1");
		expect(html).toContain("https://example.com/source2");
	});

	test("filters out unsafe source URLs", () => {
		const html = dailyFactEmailHtml({
			factText: "Fact.",
			sources: [{ url: "javascript:alert(1)", title: "Bad" }],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).not.toContain("javascript:");
	});

	test("includes unsubscribe link", () => {
		const html = dailyFactEmailHtml({
			factText: "Fact.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("https://example.com/unsubscribe/abc");
		expect(html).toContain("Unsubscribe");
	});

	test("includes Daily Platypus Facts branding", () => {
		const html = dailyFactEmailHtml({
			factText: "Fact.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("Daily Platypus Facts");
	});

	test("includes Life is Strange attribution", () => {
		const html = dailyFactEmailHtml({
			factText: "Fact.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("Life is Strange: Double Exposure");
	});

	test("escapes HTML special characters in fact text", () => {
		const html = dailyFactEmailHtml({
			factText: "Platypuses use <electroreception> & hunt",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("&lt;electroreception&gt;");
		expect(html).toContain("&amp; hunt");
	});

	test("includes fact page link with 'View this fact on the web' text", () => {
		const html = dailyFactEmailHtml({
			factText: "Fact.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/42",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(html).toContain("https://example.com/facts/42");
		expect(html).toContain("View this fact on the web");
	});
});

describe("dailyFactEmailPlain", () => {
	test("includes fact text", () => {
		const plain = dailyFactEmailPlain({
			factText: "Platypuses are venomous.",
			sources: [{ url: "https://example.com", title: "Wikipedia" }],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(plain).toContain("Platypuses are venomous.");
	});

	test("includes source URLs", () => {
		const plain = dailyFactEmailPlain({
			factText: "Fact.",
			sources: [{ url: "https://example.com/source", title: "Wikipedia" }],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(plain).toContain("Wikipedia: https://example.com/source");
	});

	test("includes unsubscribe URL", () => {
		const plain = dailyFactEmailPlain({
			factText: "Fact.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/1",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(plain).toContain("Unsubscribe: https://example.com/unsubscribe/abc");
	});

	test("includes fact page URL with 'View this fact on the web' label", () => {
		const plain = dailyFactEmailPlain({
			factText: "Fact.",
			sources: [],
			imageUrl: null,
			factPageUrl: "https://example.com/facts/42",
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
		});
		expect(plain).toContain("View this fact on the web: https://example.com/facts/42");
	});
});

describe("confirmationEmailHtml", () => {
	test("includes confirm URL as a button link", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc-123",
		});
		expect(html).toContain("https://example.com/confirm/abc-123");
		expect(html).toContain("Confirm Subscription");
	});

	test("includes welcome message with LiS:DE reference", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc",
		});
		expect(html).toContain("Welcome to Daily Platypus Facts");
		expect(html).toContain("Life is Strange: Double Exposure");
	});

	test("includes Daily Platypus Facts branding", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc",
		});
		expect(html).toContain("Daily Platypus Facts");
	});
});

describe("confirmationEmailPlain", () => {
	test("includes confirm URL", () => {
		const plain = confirmationEmailPlain({
			confirmUrl: "https://example.com/confirm/abc-123",
		});
		expect(plain).toContain("https://example.com/confirm/abc-123");
	});

	test("includes welcome message", () => {
		const plain = confirmationEmailPlain({
			confirmUrl: "https://example.com/confirm/abc",
		});
		expect(plain).toContain("Welcome to Daily Platypus Facts");
	});
});

describe("alreadySubscribedEmailHtml", () => {
	test("includes already-subscribed message", () => {
		const html = alreadySubscribedEmailHtml();
		expect(html).toContain("already a Platypus Fan");
	});

	test("includes Daily Platypus Facts branding", () => {
		const html = alreadySubscribedEmailHtml();
		expect(html).toContain("Daily Platypus Facts");
	});
});

describe("alreadySubscribedEmailPlain", () => {
	test("includes already-subscribed message", () => {
		const plain = alreadySubscribedEmailPlain();
		expect(plain).toContain("already a Platypus Fan");
	});
});

describe("unsubscribeHeaders", () => {
	test("returns List-Unsubscribe header with URL in angle brackets", () => {
		const headers = unsubscribeHeaders("https://example.com/unsubscribe/abc");
		expect(headers["List-Unsubscribe"]).toBe("<https://example.com/unsubscribe/abc>");
	});

	test("returns List-Unsubscribe-Post header for RFC 8058 one-click support", () => {
		const headers = unsubscribeHeaders("https://example.com/unsubscribe/abc");
		expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});
});
