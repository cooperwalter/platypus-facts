import { describe, expect, test } from "bun:test";
import { escapeHtml, isSafeUrl } from "./html-utils";

describe("escapeHtml", () => {
	test("escapes ampersands", () => {
		expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
	});

	test("escapes angle brackets", () => {
		expect(escapeHtml("<script>alert('xss')</script>")).toBe(
			"&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;",
		);
	});

	test("escapes double quotes", () => {
		expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
	});

	test("escapes single quotes", () => {
		expect(escapeHtml("it's")).toBe("it&#039;s");
	});

	test("returns empty string for empty input", () => {
		expect(escapeHtml("")).toBe("");
	});

	test("returns plain text unchanged when no special characters", () => {
		expect(escapeHtml("hello world")).toBe("hello world");
	});
});

describe("isSafeUrl", () => {
	test("accepts https URLs", () => {
		expect(isSafeUrl("https://example.com")).toBe(true);
	});

	test("accepts http URLs", () => {
		expect(isSafeUrl("http://example.com")).toBe(true);
	});

	test("rejects javascript: URLs", () => {
		expect(isSafeUrl("javascript:alert(1)")).toBe(false);
	});

	test("rejects data: URLs", () => {
		expect(isSafeUrl("data:text/html,<h1>hi</h1>")).toBe(false);
	});

	test("rejects invalid URLs", () => {
		expect(isSafeUrl("not a url")).toBe(false);
	});

	test("rejects empty string", () => {
		expect(isSafeUrl("")).toBe(false);
	});
});
