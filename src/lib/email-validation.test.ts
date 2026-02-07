import { describe, expect, test } from "bun:test";
import { validateEmail } from "./email-validation";

describe("validateEmail", () => {
	test("accepts valid email address", () => {
		const result = validateEmail("test@example.com");
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.normalized).toBe("test@example.com");
		}
	});

	test("normalizes email to lowercase", () => {
		const result = validateEmail("Test@Example.COM");
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.normalized).toBe("test@example.com");
		}
	});

	test("trims whitespace from email", () => {
		const result = validateEmail("  test@example.com  ");
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.normalized).toBe("test@example.com");
		}
	});

	test("rejects empty string", () => {
		const result = validateEmail("");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("required");
		}
	});

	test("rejects whitespace-only string", () => {
		const result = validateEmail("   ");
		expect(result.valid).toBe(false);
	});

	test("rejects email without @ sign", () => {
		const result = validateEmail("testexample.com");
		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.error).toContain("valid email");
		}
	});

	test("rejects email with @ at the start (no local part)", () => {
		const result = validateEmail("@example.com");
		expect(result.valid).toBe(false);
	});

	test("rejects email without domain part after @", () => {
		const result = validateEmail("test@");
		expect(result.valid).toBe(false);
	});

	test("rejects email without dot in domain", () => {
		const result = validateEmail("test@localhost");
		expect(result.valid).toBe(false);
	});

	test("accepts email with subdomain", () => {
		const result = validateEmail("test@mail.example.com");
		expect(result.valid).toBe(true);
	});

	test("accepts email with plus addressing", () => {
		const result = validateEmail("test+tag@example.com");
		expect(result.valid).toBe(true);
	});
});
