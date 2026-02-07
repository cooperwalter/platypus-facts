import * as fs from "node:fs";
import * as path from "node:path";

const STYLE_PROMPT =
	"Minimalist black line drawing of a cute platypus on a white background. " +
	"Hand-drawn sketchy style with occasional rosy pink cheek accents. " +
	"Simple, whimsical, charming. " +
	"No text, no letters, no words, no numbers anywhere in the image.";

const DALL_E_API_URL = "https://api.openai.com/v1/images/generations";

class ImageAuthError extends Error {
	constructor(
		message: string,
		public statusCode: number,
	) {
		super(message);
		this.name = "ImageAuthError";
	}
}

interface DallEResponse {
	data: Array<{ b64_json: string }>;
}

export async function generateFactImage(factId: number, apiKey: string): Promise<string | null> {
	const prompt = STYLE_PROMPT;
	const outputDir = path.join(process.cwd(), "public", "images", "facts");
	const filePath = path.join(outputDir, `${factId}.png`);
	const relativePath = `images/facts/${factId}.png`;

	try {
		const response = await fetch(DALL_E_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: "dall-e-3",
				prompt,
				size: "1024x1024",
				response_format: "b64_json",
				n: 1,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			if (response.status === 401 || response.status === 403) {
				throw new ImageAuthError(
					`DALL-E API authentication failed (${response.status}): ${errorText}`,
					response.status,
				);
			}
			console.error(`DALL-E API error (${response.status}): ${errorText}`);
			return null;
		}

		const data = (await response.json()) as DallEResponse;
		const b64 = data.data[0]?.b64_json;
		if (!b64) {
			console.error("DALL-E response missing b64_json data");
			return null;
		}

		const buffer = Buffer.from(b64, "base64");
		fs.mkdirSync(outputDir, { recursive: true });
		await Bun.write(filePath, buffer);

		return relativePath;
	} catch (error) {
		if (error instanceof ImageAuthError) {
			throw error;
		}
		console.error(
			`Failed to generate image for fact ${factId}:`,
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

export { STYLE_PROMPT, DALL_E_API_URL, ImageAuthError };
