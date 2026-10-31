/**
 * Formats an integer amount in the currency's minor units (cents, or yen for
 * JPY). "—" for a currency Intl doesn't know, so one bad value can't break a page.
 */
export function formatMinorUnits(
	amount: number,
	currency: string,
	locale?: string,
) {
	let format: Intl.NumberFormat;
	try {
		format = new Intl.NumberFormat(locale, { style: "currency", currency });
	} catch {
		return "—";
	}
	const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
	return format.format(amount / 10 ** digits);
}

/** How many decimals the currency's minor unit has: 2 for EUR, 0 for JPY. */
export function currencyDigits(currency: string) {
	try {
		return (
			new Intl.NumberFormat("en", {
				style: "currency",
				currency,
			}).resolvedOptions().maximumFractionDigits ?? 2
		);
	} catch {
		return 2;
	}
}

export type ParsedAmount =
	| { ok: true; minor: number }
	| { ok: false; message: string };

/**
 * Reads a typed amount ("25", "25.5", "25,50") into minor units with string
 * arithmetic, so no float rounding can creep in.
 */
export function parseMinorUnits(input: string, currency: string): ParsedAmount {
	const match = /^(\d+)(?:[.,](\d*))?$/.exec(input.trim());
	if (!match) return { ok: false, message: "Enter an amount like 25 or 25.50" };
	const [, whole = "", fraction = ""] = match;
	const digits = currencyDigits(currency);
	if (fraction.length > digits)
		return {
			ok: false,
			message:
				digits === 0
					? `${currency} prices have no decimals`
					: `Use at most ${digits} decimals`,
		};
	return { ok: true, minor: Number(whole + fraction.padEnd(digits, "0")) };
}

/** The editable form of a minor-unit amount: 2550 EUR → "25.50", 2500 JPY → "2500". */
export function formatAmountInput(minor: number, currency: string) {
	const digits = currencyDigits(currency);
	if (digits === 0) return String(minor);
	const padded = String(minor).padStart(digits + 1, "0");
	return `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}
