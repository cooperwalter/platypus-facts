import type { DrizzleDatabase } from "../lib/db";
import type { StoredEmail } from "../lib/email/dev";
import { getFactWithSources } from "../lib/facts";
import { escapeHtml, isSafeUrl } from "../lib/html-utils";
import { findByToken, getActiveCount, updateStatus } from "../lib/subscribers";

function renderFooter(): string {
	return `<footer class="site-footer">
		<nav class="footer-nav" aria-label="Footer">
			<a href="/inspiration">Inspiration</a>
			<a href="/about">About</a>
		</nav>
		<p class="footer-credit">Made with 🦫🦆🥚 and ❤️ by Cooper Walter</p>
	</footer>`;
}

function renderSignupPage(db: DrizzleDatabase, maxSubscribers: number): Response {
	const activeCount = getActiveCount(db);
	const atCapacity = activeCount >= maxSubscribers;
	const formattedCount = activeCount.toLocaleString();
	const formattedMax = maxSubscribers.toLocaleString();

	const formSection = atCapacity
		? `<div class="capacity-notice">
				<p>🦫🦆🥚 We're currently at capacity! Check back later.</p>
			</div>`
		: `<form id="signup-form" class="signup-form">
				<label for="email-input" class="sr-only">Email address</label>
				<input
					type="email"
					id="email-input"
					name="email"
					class="email-input"
					placeholder="platypus@example.com"
					autocomplete="email"
					inputmode="email"
					required
				/>
				<button type="submit" id="submit-btn">🦫🦆🥚 Subscribe</button>
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
		var emailInput = document.getElementById('email-input');

		form.addEventListener('submit', function(e) {
			e.preventDefault();
			messageDiv.hidden = true;
			messageDiv.className = 'form-message';

			var emailValue = emailInput.value.trim();

			if (!emailValue) {
				messageDiv.hidden = false;
				messageDiv.className = 'form-message error';
				messageDiv.textContent = 'Please enter an email address.';
				return;
			}

			submitBtn.disabled = true;
			submitBtn.textContent = '🦫🦆🥚 Subscribing...';

			fetch('/api/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: emailValue })
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
				submitBtn.textContent = '🦫🦆🥚 Subscribe';
			});
		});
	})();
	</script>`;

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>🦫🦆🥚 Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1>🦫🦆🥚 Daily Platypus Facts</h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<div class="fan-count" aria-label="${formattedCount} of ${formattedMax} Platypus Fans">
			<span class="count">${formattedCount}</span> / <span class="max">${formattedMax}</span> Platypus Fans 🦫🦆🥚
			<p class="cap-note">Since each fact is sent with love (and a small email cost), we can only support ${formattedMax} Platypus Fans right now.</p>
		</div>

		<section class="signup-section">
			<p class="description">Get one fascinating platypus fact delivered every day via email. 🦫🦆🥚</p>
			${formSection}
		</section>
	</main>
	${renderFooter()}
	${formScript}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderFactPage(db: DrizzleDatabase, factId: number): Response {
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
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
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
			<a href="/">🦫🦆🥚 Want daily platypus facts? Subscribe here!</a>
		</nav>
	</main>
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderConfirmationPage(
	db: DrizzleDatabase,
	token: string,
	maxSubscribers: number,
): Response {
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
		"🦫🦆🥚 Welcome, Platypus Fan!",
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
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<section class="message-card">
			<h2>${heading}</h2>
			<p>${body}</p>
			<a href="/">Back to home</a>
		</section>
	</main>
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderUnsubscribePage(db: DrizzleDatabase, token: string): Response {
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
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
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
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function handleUnsubscribe(db: DrizzleDatabase, token: string): Response {
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
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<section class="not-found">
			<h2>404 - Fact Not Found</h2>
			<p>This platypus fact doesn't exist. Maybe it swam away? 🦫🦆🥚</p>
			<a href="/">Back to home</a>
		</section>
	</main>
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status: 404,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderInspirationPage(): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Inspiration - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<article class="content-card">
			<h2>Inspiration</h2>
			<p>Daily Platypus Facts is inspired by <a href="https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/" target="_blank" rel="noopener noreferrer"><em>Life is Strange: Double Exposure</em></a>, where Max can subscribe to platypus facts via a blue flyer posted around Caledon University.</p>
			<p>Throughout the game, Max receives daily platypus facts as text messages &mdash; quirky, educational tidbits about one of nature's most fascinating creatures. We thought it would be fun to bring that experience to real life.</p>
			<p>This project takes the in-game concept and makes it real: one platypus fact per day, delivered straight to your inbox, complete with AI-generated illustrations and source links so you can learn even more.</p>
			<a href="/">Subscribe to Daily Platypus Facts</a>
		</article>
	</main>
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderAboutPage(): Response {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>About - Daily Platypus Facts</title>
	<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦆</text></svg>">
	<link rel="stylesheet" href="/styles.css">
</head>
<body>
	<main class="container">
		<header class="hero">
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<article class="content-card">
			<h2>About</h2>
			<p>Daily Platypus Facts is a small, handcrafted project that sends one fascinating platypus fact per day to all confirmed Platypus Fans via email.</p>
			<p>Every fact is sourced from real scientific publications and comes with an AI-generated illustration. Facts cycle through the entire collection before repeating, so you'll always learn something new.</p>
			<p>The service is built with <a href="https://bun.sh" target="_blank" rel="noopener noreferrer">Bun</a> and TypeScript, uses SQLite for data storage, and runs on a Raspberry Pi 5. Emails are sent via <a href="https://developers.brevo.com/" target="_blank" rel="noopener noreferrer">Brevo</a>.</p>
			<p>Inspired by the platypus facts in <a href="https://hardcoregamer.com/life-is-strange-double-exposure-platypus-genius-trophy/" target="_blank" rel="noopener noreferrer"><em>Life is Strange: Double Exposure</em></a>.</p>
			<a href="/">Subscribe to Daily Platypus Facts</a>
		</article>
	</main>
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function renderDevMessageList(emailMessages: StoredEmail[]): Response {
	const rows =
		emailMessages.length === 0
			? '<tr><td colspan="3" class="dev-empty">No messages sent yet.</td></tr>'
			: emailMessages
					.map(
						(entry) =>
							`<tr>
					<td><a href="/dev/messages/email-${entry.id}">${escapeHtml(entry.recipient)}</a></td>
					<td>${escapeHtml(entry.subject)}</td>
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
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
			<p class="tagline">Dev Message Viewer</p>
		</header>

		<section class="dev-messages">
			<h2>Sent Emails (${emailMessages.length})</h2>
			<table class="dev-table">
				<thead>
					<tr>
						<th>Recipient</th>
						<th>Subject</th>
						<th>Timestamp</th>
					</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>
		</section>
	</main>
	${renderFooter()}
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
			<h1><a href="/">🦫🦆🥚 Daily Platypus Facts</a></h1>
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
	${renderFooter()}
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

export {
	renderSignupPage,
	renderFactPage,
	renderConfirmationPage,
	renderUnsubscribePage,
	handleUnsubscribe,
	render404Page,
	renderInspirationPage,
	renderAboutPage,
	renderDevMessageList,
	renderDevEmailDetail,
};
