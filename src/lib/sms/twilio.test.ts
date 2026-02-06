import { describe, expect, mock, test } from "bun:test";

interface MockTwilioClient {
	messages: {
		create: ReturnType<typeof mock>;
	};
}

let mockTwilioClient: MockTwilioClient;
let TwilioConstructor: ReturnType<typeof mock>;
let mockValidateRequest: ReturnType<typeof mock>;

mock.module("twilio", () => ({
	default: (accountSid: string, authToken: string) => {
		TwilioConstructor(accountSid, authToken);
		return mockTwilioClient;
	},
	validateRequest: (
		authToken: string,
		signature: string,
		url: string,
		params: Record<string, string>,
	) => {
		return mockValidateRequest(authToken, signature, url, params);
	},
}));

import { TwilioSmsProvider } from "./twilio";

function makeTwilioProvider() {
	const accountSid = "test-account-sid";
	const authToken = "test-auth-token";
	const phoneNumber = "+15551234567";

	mockTwilioClient = {
		messages: {
			create: mock(async () => ({ sid: "test-message-sid" })),
		},
	};

	mockValidateRequest = mock(() => true);
	TwilioConstructor = mock(() => {});

	const provider = new TwilioSmsProvider(accountSid, authToken, phoneNumber);

	return { provider, accountSid, authToken, phoneNumber, mockClient: mockTwilioClient };
}

describe("TwilioSmsProvider", () => {
	describe("sendSms", () => {
		test("should call Twilio SDK with correct from number, to number, and body", async () => {
			const { provider, phoneNumber, mockClient } = makeTwilioProvider();

			const to = "+15559876543";
			const body = "Test message";

			await provider.sendSms(to, body);

			expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
			expect(mockClient.messages.create).toHaveBeenCalledWith({
				from: phoneNumber,
				to,
				body,
			});
		});
	});

	describe("parseIncomingMessage", () => {
		test("should extract From and Body from form data", async () => {
			const { provider } = makeTwilioProvider();

			const formData = new FormData();
			formData.append("From", "+15559876543");
			formData.append("Body", "Hello platypus");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				body: formData,
			});

			const result = await provider.parseIncomingMessage(request);

			expect(result.from).toBe("+15559876543");
			expect(result.body).toBe("Hello platypus");
		});

		test("should return empty string for body when Body field is missing", async () => {
			const { provider } = makeTwilioProvider();

			const formData = new FormData();
			formData.append("From", "+15559876543");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				body: formData,
			});

			const result = await provider.parseIncomingMessage(request);

			expect(result.from).toBe("+15559876543");
			expect(result.body).toBe("");
		});

		test("should return empty string for body when Body field is empty", async () => {
			const { provider } = makeTwilioProvider();

			const formData = new FormData();
			formData.append("From", "+15559876543");
			formData.append("Body", "");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				body: formData,
			});

			const result = await provider.parseIncomingMessage(request);

			expect(result.from).toBe("+15559876543");
			expect(result.body).toBe("");
		});

		test("should return empty string for from when From field is missing", async () => {
			const { provider } = makeTwilioProvider();

			const formData = new FormData();
			formData.append("Body", "Hello platypus");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				body: formData,
			});

			const result = await provider.parseIncomingMessage(request);

			expect(result.from).toBe("");
			expect(result.body).toBe("Hello platypus");
		});

		test("should return empty string for from when From field is empty", async () => {
			const { provider } = makeTwilioProvider();

			const formData = new FormData();
			formData.append("From", "");
			formData.append("Body", "Hello platypus");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				body: formData,
			});

			const result = await provider.parseIncomingMessage(request);

			expect(result.from).toBe("");
			expect(result.body).toBe("Hello platypus");
		});
	});

	describe("validateWebhookSignature", () => {
		test("should return true when signature is valid", async () => {
			const { provider, authToken } = makeTwilioProvider();
			mockValidateRequest.mockReturnValue(true);

			const formData = new FormData();
			formData.append("From", "+15559876543");
			formData.append("Body", "Test");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				headers: {
					"X-Twilio-Signature": "valid-signature",
				},
				body: formData,
			});

			const result = await provider.validateWebhookSignature(request);

			expect(result).toBe(true);
			expect(mockValidateRequest).toHaveBeenCalledTimes(1);
			expect(mockValidateRequest).toHaveBeenCalledWith(
				authToken,
				"valid-signature",
				"http://example.com/webhook",
				{ From: "+15559876543", Body: "Test" },
			);
		});

		test("should return false when signature is invalid", async () => {
			const { provider } = makeTwilioProvider();
			mockValidateRequest.mockReturnValue(false);

			const formData = new FormData();
			formData.append("From", "+15559876543");
			formData.append("Body", "Test");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				headers: {
					"X-Twilio-Signature": "invalid-signature",
				},
				body: formData,
			});

			const result = await provider.validateWebhookSignature(request);

			expect(result).toBe(false);
		});

		test("should return false when X-Twilio-Signature header is missing", async () => {
			const { provider } = makeTwilioProvider();

			const formData = new FormData();
			formData.append("From", "+15559876543");
			formData.append("Body", "Test");

			const request = new Request("http://example.com/webhook", {
				method: "POST",
				body: formData,
			});

			const result = await provider.validateWebhookSignature(request);

			expect(result).toBe(false);
			expect(mockValidateRequest).not.toHaveBeenCalled();
		});
	});

	describe("createWebhookResponse", () => {
		test("should return empty Response XML when no message is provided", () => {
			const { provider } = makeTwilioProvider();

			const result = provider.createWebhookResponse();

			expect(result).toBe("<Response/>");
		});

		test("should return Response XML with Message when message is provided", () => {
			const { provider } = makeTwilioProvider();

			const result = provider.createWebhookResponse("hello");

			expect(result).toBe("<Response><Message>hello</Message></Response>");
		});

		test("should return empty Response XML when undefined is explicitly passed", () => {
			const { provider } = makeTwilioProvider();

			const result = provider.createWebhookResponse(undefined);

			expect(result).toBe("<Response/>");
		});

		test("should return empty Response XML when empty string is provided", () => {
			const { provider } = makeTwilioProvider();

			const result = provider.createWebhookResponse("");

			expect(result).toBe("<Response/>");
		});
	});
});
