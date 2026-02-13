import fs from "node:fs";
import path from "node:path";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const PUBLIC_DIR = path.resolve(import.meta.dir, "../../public");
const FACTS_DIR = path.join(PUBLIC_DIR, "images/facts");
const MASCOT_PATH = path.join(PUBLIC_DIR, "platypus.png");

const FACT_TARGET_SIZE = 640;
const MASCOT_TARGET_SIZE = 400;

async function optimizeImage(
	filePath: string,
	targetSize: number,
): Promise<{ skipped: boolean; before: number; after: number }> {
	const before = fs.statSync(filePath).size;
	const metadata = await sharp(filePath).metadata();

	if (
		metadata.width &&
		metadata.height &&
		metadata.width <= targetSize &&
		metadata.height <= targetSize
	) {
		return { skipped: true, before, after: before };
	}

	const buffer = await sharp(filePath)
		.resize(targetSize, targetSize, { fit: "cover" })
		.png({ compressionLevel: 9 })
		.toBuffer();

	fs.writeFileSync(filePath, buffer);
	const after = buffer.length;
	return { skipped: false, before, after };
}

function formatSize(bytes: number): string {
	return `${(bytes / 1024).toFixed(0)} KB`;
}

async function optimizeFactImages(): Promise<void> {
	if (!fs.existsSync(FACTS_DIR)) {
		console.log("No fact images directory found, skipping");
		return;
	}

	const files = fs.readdirSync(FACTS_DIR).filter((f) => f.endsWith(".png"));
	console.log(`Found ${files.length} fact images`);

	for (const file of files) {
		const filePath = path.join(FACTS_DIR, file);
		try {
			const result = await optimizeImage(filePath, FACT_TARGET_SIZE);
			if (result.skipped) {
				console.log(`  ${file}: already optimized (${formatSize(result.before)})`);
			} else {
				console.log(`  ${file}: ${formatSize(result.before)} → ${formatSize(result.after)}`);
			}
		} catch (error) {
			console.error(`  ${file}: failed -`, error instanceof Error ? error.message : error);
		}
	}
}

async function optimizeMascot(): Promise<void> {
	if (!fs.existsSync(MASCOT_PATH)) {
		console.log("No mascot image found, skipping");
		return;
	}

	try {
		const result = await optimizeImage(MASCOT_PATH, MASCOT_TARGET_SIZE);
		if (result.skipped) {
			console.log(`platypus.png: already optimized (${formatSize(result.before)})`);
		} else {
			console.log(`platypus.png: ${formatSize(result.before)} → ${formatSize(result.after)}`);
		}
	} catch (error) {
		console.error("platypus.png: failed -", error instanceof Error ? error.message : error);
	}
}

async function generateFavicons(): Promise<void> {
	if (!fs.existsSync(MASCOT_PATH)) {
		console.log("No mascot image found, skipping favicon generation");
		return;
	}

	try {
		const favicon32Buffer = await sharp(MASCOT_PATH)
			.resize(32, 32, { fit: "cover" })
			.png()
			.toBuffer();
		const favicon32Path = path.join(PUBLIC_DIR, "favicon-32.png");
		fs.writeFileSync(favicon32Path, favicon32Buffer);
		console.log(`favicon-32.png: generated (${formatSize(favicon32Buffer.length)})`);

		const appleTouchBuffer = await sharp(MASCOT_PATH)
			.resize(180, 180, { fit: "cover" })
			.png()
			.toBuffer();
		const appleTouchPath = path.join(PUBLIC_DIR, "apple-touch-icon.png");
		fs.writeFileSync(appleTouchPath, appleTouchBuffer);
		console.log(`apple-touch-icon.png: generated (${formatSize(appleTouchBuffer.length)})`);

		const ico16Buffer = await sharp(MASCOT_PATH).resize(16, 16, { fit: "cover" }).png().toBuffer();
		const ico32Buffer = favicon32Buffer;

		const ico16Path = path.join(PUBLIC_DIR, "favicon-16-tmp.png");
		const ico32Path = path.join(PUBLIC_DIR, "favicon-32-tmp.png");
		fs.writeFileSync(ico16Path, ico16Buffer);
		fs.writeFileSync(ico32Path, ico32Buffer);

		const icoBuffer = await pngToIco([ico16Path, ico32Path]);
		const icoPath = path.join(PUBLIC_DIR, "favicon.ico");
		fs.writeFileSync(icoPath, icoBuffer);
		console.log(`favicon.ico: generated (${formatSize(icoBuffer.length)})`);

		fs.unlinkSync(ico16Path);
		fs.unlinkSync(ico32Path);
	} catch (error) {
		console.error("Favicon generation failed:", error instanceof Error ? error.message : error);
	}
}

console.log("=== Image Optimization ===\n");

console.log("Optimizing fact images...");
await optimizeFactImages();

console.log("\nOptimizing mascot image...");
await optimizeMascot();

console.log("\nGenerating favicons...");
await generateFavicons();

console.log("\nDone!");
