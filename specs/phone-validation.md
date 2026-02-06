# Phone Number Validation and Normalization

How the application validates and normalizes user-provided phone numbers.

## Scope

US phone numbers only for v1. The Twilio phone number is a US number, and the service targets US users.

## Accepted Input Formats

The following US phone number formats are accepted on the signup form:

- `+15558234567` (E.164, already normalized)
- `15558234567` (with country code, no plus)
- `5558234567` (10-digit, no country code)
- `(555) 823-4567` (formatted with parens and dash)
- `555-823-4567` (dashes)
- `555.823.4567` (dots)
- `555 823 4567` (spaces)
- Any combination of the above separators

## Normalization

All accepted inputs are normalized to E.164 format: `+1XXXXXXXXXX` (exactly 12 characters: `+1` followed by 10 digits).

## Validation Rules

After stripping all non-digit characters (except a leading `+`):

1. If the result starts with `+1` followed by exactly 10 digits → valid.
2. If the result starts with `1` followed by exactly 10 digits → prepend `+`, valid.
3. If the result is exactly 10 digits → prepend `+1`, valid.
4. Otherwise → invalid.

Additional checks:
- The area code (first 3 digits after country code) must not start with `0` or `1` (NANP rules).
- The exchange (next 3 digits) must not start with `0` or `1` (NANP rules).

## Error Messages

- Invalid format: "Please enter a valid US phone number."
- The web page's phone input should hint at the expected format (placeholder like `(555) 823-4567`).

## Implementation

No external library required. A small validation function with regex handles all cases. Located at `src/lib/phone.ts`.
