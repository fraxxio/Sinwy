/** Formats an integer amount in the currency's minor units (cents, or yen for JPY). */
export function formatMinorUnits(
	amount: number,
	currency: string,
	locale?: string,
) {
	const format = new Intl.NumberFormat(locale, { style: "currency", currency });
	const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
	return format.format(amount / 10 ** digits);
}
