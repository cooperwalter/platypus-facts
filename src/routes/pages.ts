import type { Database } from "bun:sqlite";
import type { StoredEmail } from "../lib/email/dev";
import { getFactWithSources } from "../lib/facts";
import { escapeHtml, isSafeUrl } from "../lib/html-utils";
import type { StoredSms } from "../lib/sms/dev";
import { findByToken, getActiveCount, updateStatus } from "../lib/subscribers";

function renderSignupPage(db: Database, maxSubscribers: number): Response {
	const activeCount = getActiveCount(db);
	const atCapacity = activeCount >= maxSubscribers;
	const formattedCount = activeCount.toLocaleString();
	const formattedMax = maxSubscribers.toLocaleString();

	const formSection = atCapacity
		? `<div class="capacity-notice">
				<p>We're currently at capacity! Check back later.</p>
			</div>`
		: `<form id="signup-form" class="signup-form">
				<label for="phone-input" class="sr-only">Phone number</label>
				<div class="input-group">
					<span class="input-prefix" id="phone-prefix" aria-hidden="true">+1</span>
					<input
						type="tel"
						id="phone-input"
						name="phoneNumber"
						placeholder="(555) 823-4567"
						autocomplete="tel-national"
						inputmode="tel"
						aria-describedby="phone-prefix"
					/>
				</div>
				<div class="input-divider">and / or</div>
				<label for="email-input" class="sr-only">Email address</label>
				<input
					type="email"
					id="email-input"
					name="email"
					class="email-input"
					placeholder="platypus@example.com"
					autocomplete="email"
					inputmode="email"
				/>
				<button type="submit" id="submit-btn">Subscribe</button>
				<p class="rates-note">Standard message rates may apply for SMS</p>
			</form>
			<div id="form-message" class="form-message" role="alert" hidden></div>`;

	const formScript = atCapacity
		? ""
		: `<script>
	(function() {
		var form = document.getElementById('signup-form');
		if (!form) return;

		var messageDiv = document.getElementById('form-message');
		var submitBtn = document.getElementById('submit-btn');
		var phoneInput = document.getElementById('phone-input');
		var emailInput = document.getElementById('email-input');

		form.addEventListener('submit', function(e) {
			e.preventDefault();
			messageDiv.hidden = true;
			messageDiv.className = 'form-message';

			var phoneValue = phoneInput.value.trim();
			var emailValue = emailInput.value.trim();

			if (!phoneValue && !emailValue) {
				messageDiv.hidden = false;
				messageDiv.className = 'form-message error';
				messageDiv.textContent = 'Please enter a phone number or email address.';
				return;
			}

			submitBtn.disabled = true;
			submitBtn.textContent = 'Subscribing...';

			var payload = {};
			if (phoneValue) payload.phoneNumber = phoneValue;
			if (emailValue) payload.email = emailValue;

			fetch('/api/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})
			.then(function(res) { return res.json().then(function(data) { return { status: res.status, data: data }; }); })
			.then(function(result) {
				messageDiv.hidden = false;
				if (result.status === 429) {
					messageDiv.className = 'form-message error';
					messageDiv.textContent = 'Too many requests. Please try again later.';
				} else if (result.data.success) {
					messageDiv.className = 'form-message success';
					messageDiv.textContent = result.data.message;
					form.hidden = true;
				} else {
					messageDiv.className = 'form-message error';
					messageDiv.textContent = result.data.error;
				}
			})
			.catch(function() {
				messageDiv.hidden = false;
				messageDiv.className = 'form-message error';
				messageDiv.textContent = 'Something went wrong. Please try again.';
			})
			.finally(function() {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Subscribe';
			});
		});
	})();
	</script>`;

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<div class="platypus-swim" aria-hidden="true">
		<svg class="platypus" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
			<g class="platypus-body">
				<ellipse cx="90" cy="50" rx="45" ry="25" fill="#8B6914" stroke="#6B4F10" stroke-width="1.5"/>
				<ellipse cx="90" cy="50" rx="38" ry="20" fill="#A07828"/>
				<ellipse cx="135" cy="50" rx="12" ry="8" fill="#8B6914" stroke="#6B4F10" stroke-width="1"/>
				<g class="platypus-tail">
					<ellipse cx="148" cy="50" rx="18" ry="6" fill="#6B4F10" stroke="#5A3E0A" stroke-width="1"/>
					<line x1="140" y1="47" x2="158" y2="47" stroke="#5A3E0A" stroke-width="0.5"/>
					<line x1="140" y1="50" x2="160" y2="50" stroke="#5A3E0A" stroke-width="0.5"/>
					<line x1="140" y1="53" x2="158" y2="53" stroke="#5A3E0A" stroke-width="0.5"/>
				</g>
				<ellipse cx="48" cy="52" rx="20" ry="7" fill="#4A3A2A" stroke="#3A2A1A" stroke-width="1"/>
				<ellipse cx="48" cy="52" rx="18" ry="5.5" fill="#5C4A36"/>
				<circle cx="62" cy="42" r="3" fill="#1A1A1A"/>
				<circle cx="62.8" cy="41.5" r="1" fill="#fff"/>
				<g class="platypus-front-foot">
					<ellipse cx="75" cy="70" rx="10" ry="4" fill="#4A3A2A" stroke="#3A2A1A" stroke-width="0.8"/>
				</g>
				<g class="platypus-back-foot">
					<ellipse cx="110" cy="70" rx="10" ry="4" fill="#4A3A2A" stroke="#3A2A1A" stroke-width="0.8"/>
				</g>
			</g>
			<g class="platypus-bubbles">
				<circle class="bubble bubble-1" cx="35" cy="38" r="2" fill="none" stroke="#b8d4e8" stroke-width="0.8"/>
				<circle class="bubble bubble-2" cx="28" cy="42" r="1.5" fill="none" stroke="#b8d4e8" stroke-width="0.6"/>
				<circle class="bubble bubble-3" cx="32" cy="35" r="1" fill="none" stroke="#b8d4e8" stroke-width="0.5"/>
			</g>
		</svg>
	</div>
	<main class="container">
		<header class="hero">
			<h1>Daily Platypus Facts</h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<div class="fan-count" aria-label="${formattedCount} of ${formattedMax} Platypus Fans">
			<span class="count">${formattedCount}</span> / <span class="max">${formattedMax}</span> Platypus Fans
		</div>

		<section class="signup-section">
			<p class="description">Get one fascinating platypus fact delivered every day via SMS and/or email.</p>
			${formSection}
		</section>
	</main>
	${formScript}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderFactPage(db: Database, factId: number): Response {
	const result = getFactWithSources(db, factId);

	if (!result) {
		return render404Page();
	}

	const { fact, sources } = result;

	const sourceLinks = sources
		.filter((source) => isSafeUrl(source.url))
		.map((source) => {
			const displayText = source.title ? escapeHtml(source.title) : escapeHtml(source.url);
			return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${displayText}</a></li>`;
		})
		.join("\n\t\t\t\t");

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Platypus Fact #${fact.id} - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<article class="fact-card">
			${fact.image_path ? `<img src="/${escapeHtml(fact.image_path)}" alt="Illustration for this platypus fact" class="fact-image" />` : ""}
			<p class="fact-text">${escapeHtml(fact.text)}</p>

			<section class="sources">
				<h2>Sources</h2>
				<ul>
					${sourceLinks}
				</ul>
			</section>
		</article>

		<nav class="cta">
			<a href="/">Want daily platypus facts? Subscribe here!</a>
		</nav>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderConfirmationPage(db: Database, token: string, maxSubscribers: number): Response {
	const subscriber = findByToken(db, token);

	if (!subscriber) {
		return renderMessagePage(
			"Invalid Link",
			"This confirmation link is invalid or has expired.",
			404,
		);
	}

	if (subscriber.status === "active") {
		return renderMessagePage(
			"Already Confirmed",
			"You're already confirmed as a Platypus Fan! You'll receive daily platypus facts.",
		);
	}

	if (subscriber.status === "unsubscribed") {
		return renderMessagePage(
			"Subscription Inactive",
			'This subscription has been cancelled. Visit the <a href="/">signup page</a> to re-subscribe.',
		);
	}

	const activeCount = getActiveCount(db);
	if (activeCount >= maxSubscribers) {
		return renderMessagePage(
			"At Capacity",
			"Sorry, Daily Platypus Facts is currently at capacity! We can't confirm your subscription right now. Please try again later.",
		);
	}

	updateStatus(db, subscriber.id, "active", { confirmed_at: new Date().toISOString() });

	return renderMessagePage(
		"Welcome, Platypus Fan!",
		"You're now confirmed! You'll receive one fascinating platypus fact every day.",
	);
}

function renderMessagePage(heading: string, body: string, status = 200): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(heading)} - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<section class="message-card">
			<h2>${heading}</h2>
			<p>${body}</p>
			<a href="/">Back to home</a>
		</section>
	</main>
</body>
</html>`;

	return new Response(html, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderUnsubscribePage(db: Database, token: string): Response {
	const subscriber = findByToken(db, token);

	if (!subscriber) {
		return renderMessagePage(
			"Invalid Link",
			"This unsubscribe link is invalid or has expired.",
			404,
		);
	}

	if (subscriber.status === "unsubscribed") {
		return renderMessagePage(
			"Already Unsubscribed",
			'You\'ve already unsubscribed from Daily Platypus Facts. Visit the <a href="/">signup page</a> to re-subscribe.',
		);
	}

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Unsubscribe - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<section class="message-card">
			<h2>Unsubscribe</h2>
			<p>Are you sure you want to unsubscribe from Daily Platypus Facts?</p>
			<form method="POST" action="/unsubscribe/${escapeHtml(token)}">
				<button type="submit" class="unsubscribe-btn">Yes, unsubscribe me</button>
			</form>
			<a href="/">No, take me back</a>
		</section>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function handleUnsubscribe(db: Database, token: string): Response {
	const subscriber = findByToken(db, token);

	if (!subscriber) {
		return renderMessagePage(
			"Invalid Link",
			"This unsubscribe link is invalid or has expired.",
			404,
		);
	}

	if (subscriber.status === "unsubscribed") {
		return renderMessagePage(
			"Already Unsubscribed",
			'You\'ve already unsubscribed from Daily Platypus Facts. Visit the <a href="/">signup page</a> to re-subscribe.',
		);
	}

	updateStatus(db, subscriber.id, "unsubscribed", { unsubscribed_at: new Date().toISOString() });

	return renderMessagePage(
		"Unsubscribed",
		"You've been unsubscribed from Daily Platypus Facts. We'll miss you! Visit the <a href=\"/\">signup page</a> anytime to re-subscribe.",
	);
}

function render404Page(): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Not Found - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<section class="not-found">
			<h2>404 - Fact Not Found</h2>
			<p>This platypus fact doesn't exist. Maybe it swam away?</p>
			<a href="/">Back to home</a>
		</section>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 404,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

interface DevMessageEntry {
	id: string;
	type: "sms" | "email";
	recipient: string;
	preview: string;
	timestamp: string;
}

function buildDevMessageList(
	smsMessages: StoredSms[],
	emailMessages: StoredEmail[],
): DevMessageEntry[] {
	const entries: DevMessageEntry[] = [];

	for (const sms of smsMessages) {
		entries.push({
			id: `sms-${sms.id}`,
			type: "sms",
			recipient: sms.to,
			preview: sms.body.length > 80 ? `${sms.body.slice(0, 80)}...` : sms.body,
			timestamp: sms.timestamp,
		});
	}

	for (const email of emailMessages) {
		entries.push({
			id: `email-${email.id}`,
			type: "email",
			recipient: email.recipient,
			preview: email.subject,
			timestamp: email.timestamp,
		});
	}

	entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
	return entries;
}

function renderDevMessageList(smsMessages: StoredSms[], emailMessages: StoredEmail[]): Response {
	const entries = buildDevMessageList(smsMessages, emailMessages);

	const rows =
		entries.length === 0
			? '<tr><td colspan="4" class="dev-empty">No messages sent yet.</td></tr>'
			: entries
					.map(
						(entry) =>
							`<tr>
					<td><a href="/dev/messages/${escapeHtml(entry.id)}">${escapeHtml(entry.recipient)}</a></td>
					<td><span class="dev-badge dev-badge-${entry.type}">${entry.type.toUpperCase()}</span></td>
					<td>${escapeHtml(entry.preview)}</td>
					<td>${escapeHtml(entry.timestamp)}</td>
				</tr>`,
					)
					.join("\n\t\t\t\t");

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Dev Messages - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Dev Message Viewer</p>
		</header>

		<section class="dev-messages">
			<h2>Sent Messages (${entries.length})</h2>
			<table class="dev-table">
				<thead>
					<tr>
						<th>Recipient</th>
						<th>Type</th>
						<th>Preview</th>
						<th>Timestamp</th>
					</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>
		</section>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderDevSmsDetail(sms: StoredSms): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>SMS #${sms.id} - Dev Messages</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Dev Message Viewer</p>
		</header>

		<section class="dev-detail">
			<p><a href="/dev/messages">Back to messages</a></p>
			<h2>SMS Message</h2>
			<dl>
				<dt>To</dt>
				<dd>${escapeHtml(sms.to)}</dd>
				<dt>Sent</dt>
				<dd>${escapeHtml(sms.timestamp)}</dd>
				${sms.mediaUrl ? `<dt>Media</dt>\n\t\t\t\t<dd><a href="${escapeHtml(sms.mediaUrl)}">${escapeHtml(sms.mediaUrl)}</a></dd>` : ""}
			</dl>
			<pre class="dev-body">${escapeHtml(sms.body)}</pre>
		</section>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderDevEmailDetail(email: StoredEmail): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Email #${email.id} - Dev Messages</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">Daily Platypus Facts</a></h1>
			<p class="tagline">Dev Message Viewer</p>
		</header>

		<section class="dev-detail">
			<p><a href="/dev/messages">Back to messages</a></p>
			<h2>Email Message</h2>
			<dl>
				<dt>To</dt>
				<dd>${escapeHtml(email.recipient)}</dd>
				<dt>Subject</dt>
				<dd>${escapeHtml(email.subject)}</dd>
				<dt>Sent</dt>
				<dd>${escapeHtml(email.timestamp)}</dd>
			</dl>
			<h3>HTML Body</h3>
			<div class="dev-email-preview">${email.htmlBody}</div>
		</section>
	</main>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderDevMessage(
	id: string,
	smsMessages: StoredSms[],
	emailMessages: StoredEmail[],
): Response {
	const match = id.match(/^(sms|email)-(\d+)$/);
	if (!match) {
		return renderMessagePage("Not Found", "Message not found.", 404);
	}

	const type = match[1];
	const numId = Number.parseInt(match[2], 10);

	if (type === "sms") {
		const sms = smsMessages.find((m) => m.id === numId);
		if (!sms) {
			return renderMessagePage("Not Found", "Message not found.", 404);
		}
		return renderDevSmsDetail(sms);
	}

	const email = emailMessages.find((e) => e.id === numId);
	if (!email) {
		return renderMessagePage("Not Found", "Message not found.", 404);
	}
	return renderDevEmailDetail(email);
}

export {
	renderSignupPage,
	renderFactPage,
	renderConfirmationPage,
	renderUnsubscribePage,
	handleUnsubscribe,
	render404Page,
	renderDevMessageList,
	renderDevMessage,
};
