# Email Template Mascot Branding

Add the platypus mascot image as a header graphic in all email templates, replacing the emoji combination (🦫🦆🥚) in the email header.

## Motivation

Web pages already use the platypus mascot PNG instead of the emoji combination. Emails still use 🦫🦆🥚 in the header, which renders inconsistently across email clients and platforms. A hosted mascot image provides consistent, recognizable branding across all email clients.

## Mascot Image in Emails

### Image Source

The mascot image is hosted at `{baseUrl}/platypus.png` (the same file used on the home page). After image optimization (see `image-optimization.md`), this file will be approximately 80 KB at 400x400 pixels — acceptable for email.

### Display Size

The mascot image is displayed at **80x80 pixels** in email headers. This is smaller than the 200x200 web display because email headers should be compact. The `width` and `height` attributes are set explicitly to prevent layout shift:

```html
<img src="{baseUrl}/platypus.png" alt="Daily Platypus Facts" width="80" height="80" style="display: block; margin: 0 auto 12px; border-radius: 50%;" />
```

The image is displayed as a circle (`border-radius: 50%`) to match the warm, friendly aesthetic. It is centered above the title text.

Note: `border-radius: 50%` is **not supported** in Outlook 2007-2021 desktop clients (which use the Word rendering engine). The mascot will display as a square in these clients, which is acceptable — the image remains fully recognizable and the email is functional.

## Template Changes

### `emailWrapper()` Update

The `emailWrapper()` function in `src/lib/email-templates.ts` currently renders the header as:

```html
<div class="header">
  <h1>🦫🦆🥚 Daily Platypus Facts</h1>
  <p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
</div>
```

Update to:

```html
<div class="header">
  <img src="{baseUrl}/platypus.png" alt="Daily Platypus Facts" width="80" height="80"
       style="display: block; margin: 0 auto 12px; border-radius: 50%;" />
  <h1>Daily Platypus Facts</h1>
  <p class="tagline">Inspired by <em>Life is Strange: Double Exposure</em></p>
</div>
```

The emoji combination is **removed** from the `<h1>` since the mascot image replaces it visually. The `alt` text on the image provides the accessible name.

### `emailWrapper()` Signature Change

`emailWrapper()` currently accepts `(title: string, bodyContent: string)`. It must now also accept `baseUrl: string` to construct the mascot image URL:

```
emailWrapper(title: string, bodyContent: string, baseUrl: string): string
```

All callers of `emailWrapper()` must be updated to pass `baseUrl`.

### Affected Templates

Since `emailWrapper()` is shared, all email templates gain the mascot header automatically:

1. **Daily Fact Email** (`dailyFactEmailHtml`) — already receives `baseUrl` context via its data object; pass to wrapper
2. **Confirmation Email** (`confirmationEmailHtml`) — must add `baseUrl` to its data interface (`ConfirmationEmailData`)
3. **Already Subscribed Email** (`alreadySubscribedEmailHtml`) — must add `baseUrl` to its data interface or accept as parameter
4. **Welcome Email** (`welcomeEmailHtml`, from `welcome-email.md`) — not yet implemented; when implemented, it will use the updated `emailWrapper()` signature with `baseUrl`

### Emoji Removal in Body Text

Two templates also include the emoji combination inline in body text:

- **Confirmation email** (line 111): `"🦫🦆🥚 Welcome to Daily Platypus Facts!..."` — Remove the emoji prefix. The mascot image in the header provides the visual identity.
- **Already subscribed email** (line 132): `"🦫🦆🥚 You're already a Platypus Fan!"` — Remove the emoji prefix.

After these changes, the emoji combination 🦫🦆🥚 is no longer used anywhere in email templates. Per the existing overview spec, the emoji is still appropriate in non-HTML contexts (README, documentation, commit messages).

## Email Client Compatibility

### Image Loading

Most email clients load remote images by default or with a single click. For clients that block images:

- The `alt="Daily Platypus Facts"` text provides a readable fallback
- The email remains fully functional without the image — the `<h1>` title and all content are text-based
- The image is decorative branding, not essential content

### Image Format

The mascot is served as PNG, which has universal email client support (Gmail, Outlook, Apple Mail, Yahoo Mail, Thunderbird, and all major mobile clients).

### Inline CSS

The mascot `<img>` tag uses **inline styles** (`style="..."`) rather than class-based styles. This is intentional — many email clients strip `<style>` blocks but preserve inline styles. The critical layout properties (`display: block`, `margin: 0 auto`, `border-radius`) must be inline to render correctly in Outlook and Gmail.

## CSS Changes

Add to the `<style>` block in `emailWrapper()`:

```css
.header img {
  display: block;
  margin: 0 auto 12px;
  border-radius: 50%;
}
```

This serves as a fallback for email clients that support `<style>` blocks. The inline styles on the `<img>` tag handle clients that strip the style block.

## Testing

- Verify the mascot image renders in Gmail (web and mobile), Outlook (desktop and web), Apple Mail, and Thunderbird
- Verify the image displays as a centered 80x80 circle above the title
- Verify the email renders correctly when images are blocked (alt text visible, layout intact)
- Verify the emoji combination 🦫🦆🥚 no longer appears in any email HTML
- Verify all four email templates (daily fact, confirmation, already subscribed, welcome) show the mascot
- Update existing email template tests to:
  - Assert `<img` tag with `platypus.png` is present in HTML body
  - Assert 🦫🦆🥚 is NOT present in HTML body
  - Assert `baseUrl` is correctly embedded in the image `src`

## Rollback

To revert, restore the emoji combination 🦫🦆🥚 to the `emailWrapper()` header `<h1>`, remove the `<img>` tag, revert the `emailWrapper()` signature to `(title, bodyContent)`, and restore emoji prefixes in confirmation and already-subscribed body text. Remove the `baseUrl` parameter from all affected data interfaces.
