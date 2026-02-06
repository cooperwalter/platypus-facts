interface PhoneValidationResult {
	valid: true;
	normalized: string;
}

interface PhoneValidationError {
	valid: false;
	error: string;
}

type PhoneResult = PhoneValidationResult | PhoneValidationError;

const ERROR_MESSAGE = "Please enter a valid US phone number.";

function validateAndNormalizePhone(input: string): PhoneResult {
	const hasLeadingPlus = input.trimStart().startsWith("+");
	const digits_only = input.replace(/\D/g, "");

	let digits: string;

	if (hasLeadingPlus && digits_only.startsWith("1") && digits_only.length === 11) {
		digits = digits_only.slice(1);
	} else if (hasLeadingPlus) {
		return { valid: false, error: ERROR_MESSAGE };
	} else if (digits_only.startsWith("1") && digits_only.length === 11) {
		digits = digits_only.slice(1);
	} else if (digits_only.length === 10) {
		digits = digits_only;
	} else {
		return { valid: false, error: ERROR_MESSAGE };
	}

	if (digits.length !== 10) {
		return { valid: false, error: ERROR_MESSAGE };
	}

	const areaCode = digits[0];
	const exchange = digits[3];

	if (areaCode === "0" || areaCode === "1") {
		return { valid: false, error: ERROR_MESSAGE };
	}

	if (exchange === "0" || exchange === "1") {
		return { valid: false, error: ERROR_MESSAGE };
	}

	return { valid: true, normalized: `+1${digits}` };
}

export type { PhoneResult, PhoneValidationResult, PhoneValidationError };
export { validateAndNormalizePhone };
