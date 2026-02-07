function validateEmail(
	email: string,
): { valid: true; normalized: string } | { valid: false; error: string } {
	const trimmed = email.trim().toLowerCase();

	if (trimmed.length === 0) {
		return { valid: false, error: "Email address is required." };
	}

	const atIndex = trimmed.indexOf("@");
	if (atIndex < 1) {
		return { valid: false, error: "Please enter a valid email address." };
	}

	const domain = trimmed.slice(atIndex + 1);
	if (domain.length === 0 || !domain.includes(".")) {
		return { valid: false, error: "Please enter a valid email address." };
	}

	return { valid: true, normalized: trimmed };
}

export { validateEmail };
