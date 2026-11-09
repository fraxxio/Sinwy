import { csvOf, majorUnits } from "@backend/lib/csv";
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

const localIso = (instant: string | null, timezone: string) =>
	instant ? formatISO(new TZDate(new Date(instant), timezone)) : "";

export const paymentsCsv = (payments: PaymentDto[], timezone: string) =>
	csvOf([
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
	]);
