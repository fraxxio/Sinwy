import { TZDate } from "@date-fns/tz";
import type { PaymentDto } from "@sinwy/shared";
import { formatISO } from "date-fns";

const HEADER = [
	"Created",
	"Paid on",
	"Customer",
	"Service",
	"Appointment",
	"Amount",
	"Currency",
	"Status",
	"Provider",
	"Reference",
];

/** Spreadsheets run a cell starting with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

const cell = (value: string) => {
	const safe = FORMULA_START.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
};

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

const localIso = (instant: string | null, timezone: string) =>
	instant ? formatISO(new TZDate(new Date(instant), timezone)) : "";

export const paymentsCsv = (payments: PaymentDto[], timezone: string) =>
	[
		HEADER,
		...payments.map((row) => [
			localIso(row.createdAt, timezone),
			localIso(row.paidAt, timezone),
			row.customerName,
			row.serviceName,
			localIso(row.startsAt, timezone),
			majorUnits(row.amountMinor, row.currency),
			row.currency,
			row.status,
			row.provider,
			row.providerRef ?? "",
		]),
	]
		.map((line) => line.map(cell).join(","))
		.join("\r\n")
		.concat("\r\n");
