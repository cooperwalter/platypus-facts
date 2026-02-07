import { describe, expect, test } from "bun:test";
import { makeTestDatabase } from "../test-utils";
import { DevEmailProvider } from "./dev";

describe("DevEmailProvider", () => {
	test("sendEmail stores the email in database", async () => {
		const db = makeTestDatabase();
		const provider = new DevEmailProvider(db);
		await provider.sendEmail("test@example.com", "Subject", "<p>Body</p>", "Body");

		const emails = provider.getStoredEmails();
		expect(emails).toHaveLength(1);
		expect(emails[0].recipient).toBe("test@example.com");
		expect(emails[0].subject).toBe("Subject");
		expect(emails[0].htmlBody).toBe("<p>Body</p>");
	});

	test("sendEmail assigns sequential IDs from database", async () => {
		const db = makeTestDatabase();
		const provider = new DevEmailProvider(db);
		await provider.sendEmail("a@example.com", "First", "<p>1</p>");
		await provider.sendEmail("b@example.com", "Second", "<p>2</p>");

		const emails = provider.getStoredEmails();
		expect(emails[0].id).toBeGreaterThan(emails[1].id);
	});

	test("getStoredEmails returns emails in reverse chronological order (newest first)", async () => {
		const db = makeTestDatabase();
		const provider = new DevEmailProvider(db);
		await provider.sendEmail("a@example.com", "First", "<p>1</p>");
		await provider.sendEmail("b@example.com", "Second", "<p>2</p>");

		const emails = provider.getStoredEmails();
		expect(emails[0].subject).toBe("Second");
		expect(emails[1].subject).toBe("First");
	});

	test("getStoredEmailById returns the matching email", async () => {
		const db = makeTestDatabase();
		const provider = new DevEmailProvider(db);
		await provider.sendEmail("a@example.com", "First", "<p>1</p>");
		await provider.sendEmail("b@example.com", "Second", "<p>2</p>");

		const emails = provider.getStoredEmails();
		const firstId = emails[1].id;
		const email = provider.getStoredEmailById(firstId);
		expect(email).toBeDefined();
		expect(email?.subject).toBe("First");
	});

	test("getStoredEmailById returns undefined for nonexistent ID", () => {
		const db = makeTestDatabase();
		const provider = new DevEmailProvider(db);
		expect(provider.getStoredEmailById(999)).toBeUndefined();
	});

	test("sendEmail records a timestamp on each email", async () => {
		const db = makeTestDatabase();
		const provider = new DevEmailProvider(db);
		await provider.sendEmail("test@example.com", "Subject", "<p>Body</p>");

		const emails = provider.getStoredEmails();
		expect(emails[0].timestamp).toBeDefined();
		expect(typeof emails[0].timestamp).toBe("string");
	});

	test("emails persist across provider instances sharing the same database", async () => {
		const db = makeTestDatabase();
		const provider1 = new DevEmailProvider(db);
		await provider1.sendEmail("test@example.com", "From provider 1", "<p>Body</p>");

		const provider2 = new DevEmailProvider(db);
		const emails = provider2.getStoredEmails();
		expect(emails).toHaveLength(1);
		expect(emails[0].subject).toBe("From provider 1");
	});
});
