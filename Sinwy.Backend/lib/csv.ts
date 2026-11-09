/** Spreadsheets run a cell starting with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

export const cell = (value: string) => {
	const safe = FORMULA_START.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
};

export const csvOf = (rows: (string | number)[][]) =>
	rows
		.map((row) => row.map((value) => cell(String(value))).join(","))
		.join("\r\n")
		.concat("\r\n");

const currencyDigits = (currency: string) => {
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
};

export const majorUnits = (amountMinor: number, currency: string) => {
	const digits = currencyDigits(currency);
	return (amountMinor / 10 ** digits).toFixed(digits);
};
