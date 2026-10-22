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
