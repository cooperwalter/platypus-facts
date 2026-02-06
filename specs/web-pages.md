# Web Pages

The application serves two public-facing web pages via Bun's built-in HTTP server.

## Signup Page (`GET /`)

The landing page where visitors subscribe to Daily Platypus Facts.

### Content

- Project title: "Daily Platypus Facts"
- Tagline referencing the *Life is Strange: Double Exposure* inspiration
- Current Platypus Fan count and limit displayed (e.g., "42 / 1,000 Platypus Fans")
- A phone number input field with country code handling (default to US +1)
- A submit button
- Brief explanation of what the user is signing up for (one fact per day via SMS)
- Note that standard message rates apply
- When the Platypus Fan cap is reached, the signup form is replaced with a message indicating the service is at capacity (e.g., "We're currently at capacity! Check back later.")

### Design

*Life is Strange: Double Exposure* / platypus themed. The aesthetic should evoke the game's style:
- Warm, indie, handcrafted feel
- Platypus imagery or illustrations
- Personality and charm — this is a fun project

### Behavior

- `POST /api/subscribe` with the phone number
- On success: display a confirmation message telling the user to check their phone for a confirmation SMS
- On validation error: display inline error (invalid phone number format)
- On rate limit: display a friendly "try again later" message

## Fact Page (`GET /facts/:id`)

Displays a single platypus fact with its sources. Linked from the daily SMS.

### Content

- The fact text prominently displayed
- A list of sources with clickable links (and titles if available)
- "Daily Platypus Facts" branding
- "Inspired by *Life is Strange: Double Exposure*" attribution
- Optional: a link to the signup page for visitors who aren't yet subscribed

### Design

Consistent with the signup page theme. Clean, focused on the fact content.

## API Endpoints

### `POST /api/subscribe`

- **Body**: `{ "phoneNumber": string }`
- **Response**: `{ "success": true, "message": string }` or `{ "success": false, "error": string }`
- **Rate limit**: 5 requests per IP per hour

### `GET /health`

- **Response**: 200 OK when the server is ready (used by Kamal for deploy health checks)

### `POST /api/webhooks/twilio/incoming`

- **Body**: Twilio webhook form data
- **Validation**: Twilio request signature verification
- **Response**: TwiML XML

## Static Assets

Serve static assets (CSS, images) from a `public/` directory.
