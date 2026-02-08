import { escapeHtml, isSafeUrl } from "./html-utils";

interface DailyFactEmailData {
	factText: string;
	sources: Array<{ url: string; title: string | null }>;
	imageUrl: string | null;
	factPageUrl: string;
	unsubscribeUrl: string;
}

interface ConfirmationEmailData {
	confirmUrl: string;
}

function emailWrapper(title: string, bodyContent: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; padding: 0; background: #fdf6ec; font-family: Georgia, 'Times New Roman', serif; color: #3d2b1f; }
.container { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
.header { text-align: center; padding-bottom: 24px; border-bottom: 2px solid #e8d5c0; margin-bottom: 24px; }
.header h1 { font-size: 24px; margin: 0 0 4px 0; color: #5a3825; }
.tagline { font-style: italic; font-size: 13px; color: #8b6f5e; margin: 0; }
.fact-text { font-size: 17px; line-height: 1.6; margin: 20px 0; }
.fact-image { max-width: 100%; height: auto; border-radius: 8px; margin: 16px 0; }
.sources { margin: 20px 0; }
.sources h2 { font-size: 14px; margin: 0 0 8px 0; color: #8b6f5e; text-transform: uppercase; letter-spacing: 1px; }
.sources ul { margin: 0; padding: 0 0 0 20px; }
.sources li { margin: 4px 0; }
.sources a { color: #5a3825; }
.cta-button { display: inline-block; background: #5a3825; color: #fff !important; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 16px; margin: 16px 0; }
.footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e8d5c0; font-size: 12px; color: #8b6f5e; text-align: center; }
.footer a { color: #8b6f5e; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>🦫🦆🥚 Daily Platypus Facts</h1>
<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
</div>
${bodyContent}
</div>
</body>
</html>`;
}

function dailyFactEmailHtml(data: DailyFactEmailData): string {
	const imageSection = data.imageUrl
		? `<img src="${escapeHtml(data.imageUrl)}" alt="Illustration for this platypus fact" class="fact-image" />`
		: "";

	const sourceLinks = data.sources
		.filter((source) => isSafeUrl(source.url))
		.map((source) => {
			const displayText = source.title ? escapeHtml(source.title) : escapeHtml(source.url);
			return `<li><a href="${escapeHtml(source.url)}">${displayText}</a></li>`;
		})
		.join("\n");

	const sourcesSection =
		sourceLinks.length > 0
			? `<div class="sources">
<h2>Sources</h2>
<ul>
${sourceLinks}
</ul>
</div>`
			: "";

	const body = `${imageSection}
<p class="fact-text">${escapeHtml(data.factText)}</p>
${sourcesSection}
<p style="text-align: center; margin: 24px 0;">
<a href="${escapeHtml(data.factPageUrl)}" class="cta-button">View this fact with sources</a>
</p>
<div class="footer">
<p><a href="${escapeHtml(data.unsubscribeUrl)}">Unsubscribe</a></p>
</div>`;

	return emailWrapper("Daily Platypus Fact", body);
}

function dailyFactEmailPlain(data: DailyFactEmailData): string {
	const sourceLines = data.sources
		.filter((source) => isSafeUrl(source.url))
		.map((source) => {
			const label = source.title ?? source.url;
			return `- ${label}: ${source.url}`;
		})
		.join("\n");

	const sourcesSection = sourceLines.length > 0 ? `\nSources:\n${sourceLines}\n` : "";

	return `Daily Platypus Fact

${data.factText}
${sourcesSection}
View this fact with sources: ${data.factPageUrl}

---
Daily Platypus Facts — Inspired by Life is Strange: Double Exposure
Unsubscribe: ${data.unsubscribeUrl}`;
}

function confirmationEmailHtml(data: ConfirmationEmailData): string {
	const body = `<p class="fact-text">🦫🦆🥚 Welcome to Daily Platypus Facts! Inspired by Life is Strange: Double Exposure.</p>
<p>Click the button below to confirm your subscription and start receiving a platypus fact every day.</p>
<p style="text-align: center;">
<a href="${escapeHtml(data.confirmUrl)}" class="cta-button">Confirm Subscription</a>
</p>`;

	return emailWrapper("Confirm your Daily Platypus Facts subscription", body);
}

function confirmationEmailPlain(data: ConfirmationEmailData): string {
	return `Welcome to Daily Platypus Facts! Inspired by Life is Strange: Double Exposure.

Click the link below to confirm your subscription and start receiving a platypus fact every day.

${data.confirmUrl}

---
Daily Platypus Facts — Inspired by Life is Strange: Double Exposure`;
}

function alreadySubscribedEmailHtml(): string {
	const body = `<p class="fact-text">🦫🦆🥚 You're already a Platypus Fan!</p>
<p>You're already subscribed to Daily Platypus Facts and receiving your daily dose of platypus knowledge.</p>`;

	return emailWrapper("You're already a Platypus Fan!", body);
}

function alreadySubscribedEmailPlain(): string {
	return `You're already a Platypus Fan!

You're already subscribed to Daily Platypus Facts and receiving your daily dose of platypus knowledge.

---
Daily Platypus Facts — Inspired by Life is Strange: Double Exposure`;
}

function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
	return {
		"List-Unsubscribe": `<${unsubscribeUrl}>`,
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
}

export type { DailyFactEmailData, ConfirmationEmailData };
export {
	dailyFactEmailHtml,
	dailyFactEmailPlain,
	confirmationEmailHtml,
	confirmationEmailPlain,
	alreadySubscribedEmailHtml,
	alreadySubscribedEmailPlain,
	unsubscribeHeaders,
};
