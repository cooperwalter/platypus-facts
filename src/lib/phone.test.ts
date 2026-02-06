import { describe, expect, test } from "bun:test";
import { validateAndNormalizePhone } from "./phone";

describe("phone number validation and normalization", () => {
	test("accepts E.164 format +15558234567 and returns it unchanged", () => {
		const result = validateAndNormalizePhone("+15558234567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts country code without plus 15558234567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("15558234567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts 10-digit 5558234567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("5558234567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts parenthesized format (555) 823-4567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("(555) 823-4567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts dashed format 555-823-4567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("555-823-4567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts dotted format 555.823.4567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("555.823.4567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts spaced format 555 823 4567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("555 823 4567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("accepts mixed separators like (555) 823.4567 and normalizes to +15558234567", () => {
		const result = validateAndNormalizePhone("(555) 823.4567");
		expect(result).toEqual({ valid: true, normalized: "+15558234567" });
	});

	test("rejects 10-digit number with area code starting with 0 (e.g. 0558234567)", () => {
		const result = validateAndNormalizePhone("0558234567");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects 10-digit number with area code starting with 1 as 10 digits", () => {
		const result = validateAndNormalizePhone("+11558234567");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects number with exchange starting with 0 (e.g. 5550234567)", () => {
		const result = validateAndNormalizePhone("5550234567");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects number with exchange starting with 1 (e.g. 5551134567)", () => {
		const result = validateAndNormalizePhone("5551134567");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects numbers with too few digits (e.g. 55582345)", () => {
		const result = validateAndNormalizePhone("55582345");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects numbers with too many digits (e.g. 155582345678)", () => {
		const result = validateAndNormalizePhone("155582345678");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects non-US country codes (e.g. +445558234567)", () => {
		const result = validateAndNormalizePhone("+445558234567");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects empty string", () => {
		const result = validateAndNormalizePhone("");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});

	test("rejects letters and non-numeric input (e.g. abcdefghij)", () => {
		const result = validateAndNormalizePhone("abcdefghij");
		expect(result).toEqual({ valid: false, error: "Please enter a valid US phone number." });
	});
});
