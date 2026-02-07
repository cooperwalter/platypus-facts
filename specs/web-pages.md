# Web Pages

The application serves two public-facing web pages via Bun's built-in HTTP server.

## Signup Page (`GET /`)

The landing page where visitors subscribe to Daily Platypus Facts.

### Content

- Project title: "Daily Platypus Facts"
- Tagline referencing the *Life is Strange: Double Exposure* inspiration
- Current Platypus Fan count and limit displayed (e.g., "42 / 1,000 Platypus Fans")
- A phone number input field with country code handling (default to US +1) — optional
- An email input field — optional
- At least one of phone or email is required; the form validates this before submission
- A submit button
- Brief explanation of what the user is signing up for (one fact per day via SMS and/or email)
- Note that standard message rates apply (for SMS)
- When the Platypus Fan cap is reached, the signup form is replaced with a message indicating the service is at capacity (e.g., "We're currently at capacity! Check back later.")

### Design

*Life is Strange: Double Exposure* / platypus themed. The aesthetic should evoke the game's style:
- Warm, indie, handcrafted feel
- Platypus imagery or illustrations
- Personality and charm — this is a fun project
- **Repeating platypus background pattern** — all pages use a subtle, tiled background using the platypus SVG at `public/platypus-icon.svg`. Applied via CSS `background-image` with `background-repeat: repeat`. Low-opacity so it doesn't compete with page content, creating a soft watermark-style texture across the entire page. The icons should be **generously spaced** — not packed tightly together. Use `background-size` and/or padding within the tile to ensure visible gaps between each icon so the pattern feels airy and light, not dense or wallpaper-like.
- **No animated platypus** — there should be no animated, moving, or swimming platypus element on any page. The background pattern is the only platypus decoration.

### Behavior

- `POST /api/subscribe` with phone number and/or email
- On success: display a confirmation message telling the user to check their phone and/or email
- On validation error: display inline error (invalid phone number format)
- On rate limit: display a friendly "try again later" message

## Fact Page (`GET /facts/:id`)

Displays a single platypus fact with its sources. Linked from the daily SMS.

### Content

- The AI-generated platypus illustration for this fact, displayed prominently above the fact text (see `fact-images.md` for style details).
- The fact text prominently displayed
- A list of sources with clickable links (and titles if available)
- "Daily Platypus Facts" branding
- "Inspired by *Life is Strange: Double Exposure*" attribution
- Optional: a link to the signup page for visitors who aren't yet subscribed

### No Image

If a fact does not have a generated image (`image_path` is NULL), the page renders without the image section entirely — no broken image, no placeholder, no empty space. The fact text simply appears at the top. The page layout should look intentional and complete whether or not an image is present.

### Design

Consistent with the signup page theme. Clean, focused on the fact content (and illustration when available). When an image is present, it should be centered and sized appropriately (max-width constrained, responsive).

## Confirmation Page (`GET /confirm/:token`)

Handles email-based subscription confirmation.

- Valid pending token: confirms the subscription, displays a success page.
- Already active: displays "You're already confirmed!" page.
- Invalid/unsubscribed token: displays an appropriate message.
- Cap reached: displays a "we're at capacity" page.

See `subscription-flow.md` for full confirmation logic.

## Unsubscribe Pages (`GET /unsubscribe/:token`, `POST /unsubscribe/:token`)

Handles email-based unsubscribe.

- `GET`: Displays a confirmation page: "Are you sure you want to unsubscribe from Daily Platypus Facts?"
- `POST`: Processes the unsubscribe, displays a success page.
- Invalid token: displays an appropriate message.

## Dev Message Viewer (Development Only)

When running with dev providers (see `email-integration.md`, `sms-integration.md`), dev-only routes are available for viewing sent messages:

- `GET /dev/messages` — Lists all sent messages (SMS and email, newest first) with recipient, type, subject/preview, and timestamp.
- `GET /dev/messages/:id` — Displays a specific message. For emails, renders the HTML content. For SMS, displays the text body.

These routes are only registered when dev providers are active. They are never available in production.

## API Endpoints

### `POST /api/subscribe`

- **Body**: `{ "phoneNumber": string | null, "email": string | null }` (at least one required)
- **Response**: `{ "success": true, "message": string }` or `{ "success": false, "error": string }`
- **Rate limit**: 5 requests per IP per hour

### `GET /health`

- **Response**: 200 OK when the server is ready (used by Kamal for deploy health checks)

### `POST /api/webhooks/twilio/incoming`

- **Body**: Twilio webhook form data
- **Validation**: Twilio request signature verification
- **Response**: TwiML XML

## Static Assets

Serve static assets (CSS, images) from a `public/` directory. This includes AI-generated fact illustrations stored in `public/images/facts/` (see `fact-images.md`).
