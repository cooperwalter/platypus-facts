import { describe, expect, test } from "bun:test";
import {
	alreadySubscribedEmailHtml,
	alreadySubscribedEmailPlain,
	confirmationEmailHtml,
	confirmationEmailPlain,
	dailyFactEmailHtml,
	dailyFactEmailPlain,
	unsubscribeHeaders,
	welcomeEmailHtml,
	welcomeEmailPlain,
} from "./email-templates";

const baseUrl = "https://platypus.example.com";

function makeDailyFactData(overrides: Partial<Parameters<typeof dailyFactEmailHtml>[0]> = {}) {
	return {
		factText: "Platypuses are venomous.",
		sources: [] as Array<{ url: string; title: string | null }>,
		imageUrl: null as string | null,
		factPageUrl: "https://example.com/facts/1",
		unsubscribeUrl: "https://example.com/unsubscribe/abc",
		baseUrl,
		...overrides,
	};
}

describe("dailyFactEmailHtml", () => {
	test("includes fact text in HTML body", () => {
		const html = dailyFactEmailHtml(
			makeDailyFactData({
				sources: [{ url: "https://example.com", title: "Wikipedia" }],
			}),
		);
		expect(html).toContain("Platypuses are venomous.");
	});

	test("includes image tag when imageUrl is provided", () => {
		const html = dailyFactEmailHtml(
			makeDailyFactData({
				imageUrl: "https://example.com/images/facts/1.png",
			}),
		);
		expect(html).toContain("<img");
		expect(html).toContain("https://example.com/images/facts/1.png");
	});

	test("omits fact image tag when imageUrl is null but still has mascot image", () => {
		const html = dailyFactEmailHtml(makeDailyFactData());
		expect(html).not.toContain('class="fact-image"');
		expect(html).toContain("platypus.png");
	});

	test("includes source links for valid URLs", () => {
		const html = dailyFactEmailHtml(
			makeDailyFactData({
				factText: "Fact.",
				sources: [
					{ url: "https://example.com/source1", title: "Source 1" },
					{ url: "https://example.com/source2", title: null },
				],
			}),
		);
		expect(html).toContain("Source 1");
		expect(html).toContain("https://example.com/source2");
	});

	test("filters out unsafe source URLs", () => {
		const html = dailyFactEmailHtml(
			makeDailyFactData({
				factText: "Fact.",
				sources: [{ url: "javascript:alert(1)", title: "Bad" }],
			}),
		);
		expect(html).not.toContain("javascript:");
	});

	test("includes unsubscribe link", () => {
		const html = dailyFactEmailHtml(makeDailyFactData({ factText: "Fact." }));
		expect(html).toContain("https://example.com/unsubscribe/abc");
		expect(html).toContain("Unsubscribe");
	});

	test("includes Daily Platypus Facts branding", () => {
		const html = dailyFactEmailHtml(makeDailyFactData({ factText: "Fact." }));
		expect(html).toContain("Daily Platypus Facts");
	});

	test("includes Life is Strange attribution", () => {
		const html = dailyFactEmailHtml(makeDailyFactData({ factText: "Fact." }));
		expect(html).toContain("Life is Strange: Double Exposure");
	});

	test("escapes HTML special characters in fact text", () => {
		const html = dailyFactEmailHtml(
			makeDailyFactData({
				factText: "Platypuses use <electroreception> & hunt",
			}),
		);
		expect(html).toContain("&lt;electroreception&gt;");
		expect(html).toContain("&amp; hunt");
	});

	test("includes fact page link with 'View this fact on the web' text", () => {
		const html = dailyFactEmailHtml(
			makeDailyFactData({
				factText: "Fact.",
				factPageUrl: "https://example.com/facts/42",
			}),
		);
		expect(html).toContain("https://example.com/facts/42");
		expect(html).toContain("View this fact on the web");
	});

	test("includes mascot image with baseUrl in src", () => {
		const html = dailyFactEmailHtml(makeDailyFactData({ factText: "Fact." }));
		expect(html).toContain(`src="${baseUrl}/platypus.png"`);
		expect(html).toContain('alt="Daily Platypus Facts"');
		expect(html).toContain('width="80"');
		expect(html).toContain('height="80"');
		expect(html).toContain("border-radius: 50%");
	});

	test("does not contain emoji combination in HTML", () => {
		const html = dailyFactEmailHtml(makeDailyFactData({ factText: "Fact." }));
		expect(html).not.toContain("🦫🦆🥚");
	});
});

describe("dailyFactEmailPlain", () => {
	test("includes fact text", () => {
		const plain = dailyFactEmailPlain(
			makeDailyFactData({
				sources: [{ url: "https://example.com", title: "Wikipedia" }],
			}),
		);
		expect(plain).toContain("Platypuses are venomous.");
	});

	test("includes source URLs", () => {
		const plain = dailyFactEmailPlain(
			makeDailyFactData({
				factText: "Fact.",
				sources: [{ url: "https://example.com/source", title: "Wikipedia" }],
			}),
		);
		expect(plain).toContain("Wikipedia: https://example.com/source");
	});

	test("includes unsubscribe URL", () => {
		const plain = dailyFactEmailPlain(makeDailyFactData({ factText: "Fact." }));
		expect(plain).toContain("Unsubscribe: https://example.com/unsubscribe/abc");
	});

	test("includes fact page URL with 'View this fact on the web' label", () => {
		const plain = dailyFactEmailPlain(
			makeDailyFactData({
				factText: "Fact.",
				factPageUrl: "https://example.com/facts/42",
			}),
		);
		expect(plain).toContain("View this fact on the web: https://example.com/facts/42");
	});
});

describe("confirmationEmailHtml", () => {
	test("includes confirm URL as a button link", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc-123",
			baseUrl,
		});
		expect(html).toContain("https://example.com/confirm/abc-123");
		expect(html).toContain("Confirm Subscription");
	});

	test("includes welcome message with LiS:DE reference", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc",
			baseUrl,
		});
		expect(html).toContain("Welcome to Daily Platypus Facts");
		expect(html).toContain("Life is Strange: Double Exposure");
	});

	test("includes Daily Platypus Facts branding", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc",
			baseUrl,
		});
		expect(html).toContain("Daily Platypus Facts");
	});

	test("includes mascot image with baseUrl in src", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc",
			baseUrl,
		});
		expect(html).toContain(`src="${baseUrl}/platypus.png"`);
		expect(html).toContain('alt="Daily Platypus Facts"');
	});

	test("does not contain emoji combination in HTML", () => {
		const html = confirmationEmailHtml({
			confirmUrl: "https://example.com/confirm/abc",
			baseUrl,
		});
		expect(html).not.toContain("🦫🦆🥚");
	});
});

describe("confirmationEmailPlain", () => {
	test("includes confirm URL", () => {
		const plain = confirmationEmailPlain({
			confirmUrl: "https://example.com/confirm/abc-123",
			baseUrl,
		});
		expect(plain).toContain("https://example.com/confirm/abc-123");
	});

	test("includes welcome message", () => {
		const plain = confirmationEmailPlain({
			confirmUrl: "https://example.com/confirm/abc",
			baseUrl,
		});
		expect(plain).toContain("Welcome to Daily Platypus Facts");
	});
});

describe("alreadySubscribedEmailHtml", () => {
	test("includes already-subscribed message", () => {
		const html = alreadySubscribedEmailHtml({ baseUrl });
		expect(html).toContain("already a Platypus Fan");
	});

	test("includes Daily Platypus Facts branding", () => {
		const html = alreadySubscribedEmailHtml({ baseUrl });
		expect(html).toContain("Daily Platypus Facts");
	});

	test("includes mascot image with baseUrl in src", () => {
		const html = alreadySubscribedEmailHtml({ baseUrl });
		expect(html).toContain(`src="${baseUrl}/platypus.png"`);
		expect(html).toContain('alt="Daily Platypus Facts"');
	});

	test("does not contain emoji combination in HTML", () => {
		const html = alreadySubscribedEmailHtml({ baseUrl });
		expect(html).not.toContain("🦫🦆🥚");
	});
});

describe("alreadySubscribedEmailPlain", () => {
	test("includes already-subscribed message", () => {
		const plain = alreadySubscribedEmailPlain();
		expect(plain).toContain("already a Platypus Fan");
	});
});

describe("welcomeEmailHtml", () => {
	test("includes welcome message", () => {
		const html = welcomeEmailHtml({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).toContain("Welcome to Daily Platypus Facts");
		expect(html).toContain("Platypus Fan");
	});

	test("includes catch-up fact section when fact is provided", () => {
		const html = welcomeEmailHtml({
			fact: {
				text: "Platypuses detect electric fields.",
				sources: [{ url: "https://example.com/electro", title: "Electro Study" }],
				imageUrl: "https://example.com/images/facts/1.png",
				factPageUrl: "https://example.com/facts/1",
			},
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).toContain("Here's the latest fact while you wait for tomorrow's:");
		expect(html).toContain("Platypuses detect electric fields.");
		expect(html).toContain("Electro Study");
		expect(html).toContain("https://example.com/images/facts/1.png");
		expect(html).toContain("View this fact on the web");
		expect(html).toContain("https://example.com/facts/1");
	});

	test("omits fact section entirely when fact is null", () => {
		const html = welcomeEmailHtml({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).not.toContain("Here's the latest fact");
		expect(html).not.toContain("View this fact on the web");
		expect(html).toContain("Welcome to Daily Platypus Facts");
	});

	test("includes unsubscribe link", () => {
		const html = welcomeEmailHtml({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).toContain("https://example.com/unsubscribe/abc");
		expect(html).toContain("Unsubscribe");
	});

	test("includes mascot image with baseUrl in src", () => {
		const html = welcomeEmailHtml({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).toContain(`src="${baseUrl}/platypus.png"`);
	});

	test("includes fact image when imageUrl is provided", () => {
		const html = welcomeEmailHtml({
			fact: {
				text: "Fact.",
				sources: [],
				imageUrl: "https://example.com/images/facts/1.png",
				factPageUrl: "https://example.com/facts/1",
			},
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).toContain('class="fact-image"');
		expect(html).toContain("https://example.com/images/facts/1.png");
	});

	test("does not contain emoji combination in HTML", () => {
		const html = welcomeEmailHtml({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).not.toContain("🦫🦆🥚");
	});

	test("omits fact image when imageUrl is null", () => {
		const html = welcomeEmailHtml({
			fact: {
				text: "Fact.",
				sources: [],
				imageUrl: null,
				factPageUrl: "https://example.com/facts/1",
			},
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(html).not.toContain('class="fact-image"');
	});
});

describe("welcomeEmailPlain", () => {
	test("includes welcome message", () => {
		const plain = welcomeEmailPlain({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(plain).toContain("Welcome to Daily Platypus Facts");
		expect(plain).toContain("Platypus Fan");
	});

	test("includes catch-up fact when provided", () => {
		const plain = welcomeEmailPlain({
			fact: {
				text: "Platypuses detect electric fields.",
				sources: [{ url: "https://example.com/electro", title: "Electro Study" }],
				imageUrl: null,
				factPageUrl: "https://example.com/facts/1",
			},
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(plain).toContain("Here's the latest fact while you wait for tomorrow's:");
		expect(plain).toContain("Platypuses detect electric fields.");
		expect(plain).toContain("Electro Study: https://example.com/electro");
		expect(plain).toContain("View this fact on the web: https://example.com/facts/1");
	});

	test("omits fact section when fact is null", () => {
		const plain = welcomeEmailPlain({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(plain).not.toContain("Here's the latest fact");
	});

	test("includes unsubscribe URL", () => {
		const plain = welcomeEmailPlain({
			fact: null,
			unsubscribeUrl: "https://example.com/unsubscribe/abc",
			baseUrl,
		});
		expect(plain).toContain("Unsubscribe: https://example.com/unsubscribe/abc");
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
