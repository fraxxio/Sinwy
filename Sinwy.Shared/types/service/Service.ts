/** Prices are integers in the currency's smallest unit (cents, or whole yen). */
export type ServiceDto = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	durationMinutes: number;
	priceMinor: number;
	currency: string;
	bufferBeforeMinutes: number;
	bufferAfterMinutes: number;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
};

export const SERVICE_LIMITS = {
	name: 100,
	description: 1000,
	durationMin: 5,
	durationMax: 720,
	durationStep: 5,
	bufferMax: 240,
	bufferStep: 5,
	// fits a Postgres integer with room to spare
	priceMinorMax: 99_999_999,
} as const;
