import type { Tx } from "@db";
import type { booking } from "@db/schema/bookingSchema";
import { payment } from "@db/schema/paymentSchema";
import { and, eq } from "drizzle-orm";

type PricedBooking = Pick<
	typeof booking.$inferSelect,
	"id" | "organizationId" | "priceMinor" | "currency"
>;

/** Free bookings get no payment. */
export const createBookingPayment = async (tx: Tx, row: PricedBooking) => {
	if (row.priceMinor === 0) return;
	await tx.insert(payment).values({
		id: crypto.randomUUID(),
		organizationId: row.organizationId,
		bookingId: row.id,
		amountMinor: row.priceMinor,
		currency: row.currency,
		status: "pending",
		provider: "manual",
	});
};

/** Only a pending payment is voided; a paid one stays paid until refunds exist. */
export const voidBookingPayment = async (tx: Tx, bookingId: string) => {
	await tx
		.update(payment)
		.set({ status: "void", updatedAt: new Date() })
		.where(
			and(eq(payment.bookingId, bookingId), eq(payment.status, "pending")),
		);
};
