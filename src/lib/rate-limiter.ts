interface RateLimitEntry {
	count: number;
	windowStart: number;
}

interface RateLimiter {
	isAllowed(ip: string): boolean;
	cleanup(): void;
}

function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
	const entries = new Map<string, RateLimitEntry>();

	return {
		isAllowed(ip: string): boolean {
			const now = Date.now();
			const entry = entries.get(ip);

			if (!entry || now - entry.windowStart >= windowMs) {
				entries.set(ip, { count: 1, windowStart: now });
				return true;
			}

			entry.count += 1;
			return entry.count <= maxRequests;
		},

		cleanup(): void {
			const now = Date.now();
			for (const [ip, entry] of entries) {
				if (now - entry.windowStart >= windowMs) {
					entries.delete(ip);
				}
			}
		},
	};
}

export type { RateLimiter };
export { createRateLimiter };
