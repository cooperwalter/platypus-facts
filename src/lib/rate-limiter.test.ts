import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "./rate-limiter";

describe("rate-limiter", () => {
	test("allows requests under the limit", () => {
		const limiter = createRateLimiter(5, 3600000);
		for (let i = 0; i < 5; i++) {
			expect(limiter.isAllowed("192.168.1.1")).toBe(true);
		}
	});

	test("allows the 5th request (at limit)", () => {
		const limiter = createRateLimiter(5, 3600000);
		for (let i = 0; i < 4; i++) {
			limiter.isAllowed("192.168.1.1");
		}
		expect(limiter.isAllowed("192.168.1.1")).toBe(true);
	});

	test("rejects the 6th request (over limit)", () => {
		const limiter = createRateLimiter(5, 3600000);
		for (let i = 0; i < 5; i++) {
			limiter.isAllowed("192.168.1.1");
		}
		expect(limiter.isAllowed("192.168.1.1")).toBe(false);
	});

	test("allows requests again after the window expires", () => {
		const limiter = createRateLimiter(5, 100);
		for (let i = 0; i < 5; i++) {
			limiter.isAllowed("192.168.1.1");
		}
		expect(limiter.isAllowed("192.168.1.1")).toBe(false);

		const start = Date.now();
		while (Date.now() - start < 110) {
			/* wait for window to expire */
		}

		expect(limiter.isAllowed("192.168.1.1")).toBe(true);
	});

	test("tracks different IPs independently", () => {
		const limiter = createRateLimiter(2, 3600000);
		limiter.isAllowed("192.168.1.1");
		limiter.isAllowed("192.168.1.1");
		expect(limiter.isAllowed("192.168.1.1")).toBe(false);

		expect(limiter.isAllowed("192.168.1.2")).toBe(true);
		expect(limiter.isAllowed("192.168.1.2")).toBe(true);
		expect(limiter.isAllowed("192.168.1.2")).toBe(false);
	});

	test("cleanup removes expired entries while keeping active ones", () => {
		const limiter = createRateLimiter(1, 100);
		limiter.isAllowed("192.168.1.1");

		const start = Date.now();
		while (Date.now() - start < 110) {
			/* wait for window to expire */
		}

		limiter.isAllowed("192.168.1.2");
		limiter.cleanup();

		expect(limiter.isAllowed("192.168.1.1")).toBe(true);
		expect(limiter.isAllowed("192.168.1.2")).toBe(false);
	});
});
