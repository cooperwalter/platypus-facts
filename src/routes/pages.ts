import type { Database } from "bun:sqlite";
import { getFactWithSources } from "../lib/facts";
import { escapeHtml, isSafeUrl } from "../lib/html-utils";
import { getActiveCount } from "../lib/subscribers";

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
						required
					/>
				</div>
				<button type="submit" id="submit-btn">Subscribe</button>
				<p class="rates-note">Standard message rates apply</p>
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

		form.addEventListener('submit', function(e) {
			e.preventDefault();
			messageDiv.hidden = true;
			messageDiv.className = 'form-message';
			submitBtn.disabled = true;
			submitBtn.textContent = 'Subscribing...';

			var phoneValue = phoneInput.value.trim();

			fetch('/api/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phoneNumber: phoneValue })
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
	<main class="container">
		<header class="hero">
			<h1>Daily Platypus Facts</h1>
			<p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
		</header>

		<div class="fan-count" aria-label="${formattedCount} of ${formattedMax} Platypus Fans">
			<span class="count">${formattedCount}</span> / <span class="max">${formattedMax}</span> Platypus Fans
		</div>

		<section class="signup-section">
			<p class="description">Get one fascinating platypus fact delivered to your phone every day via SMS.</p>
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

export { renderSignupPage, renderFactPage, render404Page };
