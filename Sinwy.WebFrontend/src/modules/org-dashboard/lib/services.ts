import {
	SERVICE_LIMITS as LIMITS,
	type ServiceDto,
	type ServiceInput,
	serviceSchema,
} from "@sinwy/shared";
import { z } from "zod";
import { formatAmountInput, parseMinorUnits } from "#/shared/lib/money";

/** "45 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const minuteOptions = (from: number, to: number, step: number) =>
	Array.from({ length: (to - from) / step + 1 }, (_, i) => {
		const minutes = from + i * step;
		return { value: String(minutes), label: formatDuration(minutes) };
	});

export const DURATION_OPTIONS = minuteOptions(
	LIMITS.durationMin,
	LIMITS.durationMax,
	LIMITS.durationStep,
);

export const BUFFER_OPTIONS = minuteOptions(
	0,
	LIMITS.bufferMax,
	LIMITS.bufferStep,
).map((option) =>
	option.value === "0" ? { ...option, label: "None" } : option,
);

/** Every field is the text the input holds; the schema turns them into a `ServiceInput`. */
export type ServiceFormValues = {
	name: string;
	description: string;
	price: string;
	durationMinutes: string;
	bufferBeforeMinutes: string;
	bufferAfterMinutes: string;
};

const minutes = (rule: z.ZodNumber) => z.string().transform(Number).pipe(rule);

export const serviceFormSchema = (currency: string) =>
	z.object({
		name: serviceSchema.shape.name,
		description: serviceSchema.shape.description,
		price: z
			.string()
			.transform((value, ctx) => {
				if (value.trim() === "") {
					ctx.addIssue({ code: "custom", message: "Price is required" });
					return z.NEVER;
				}
				const parsed = parseMinorUnits(value, currency);
				if (parsed.ok) return parsed.minor;
				ctx.addIssue({ code: "custom", message: parsed.message });
				return z.NEVER;
			})
			.pipe(serviceSchema.shape.priceMinor),
		durationMinutes: minutes(serviceSchema.shape.durationMinutes),
		bufferBeforeMinutes: minutes(serviceSchema.shape.bufferBeforeMinutes),
		bufferAfterMinutes: minutes(serviceSchema.shape.bufferAfterMinutes),
	});

export function toServiceInput(
	values: ServiceFormValues,
	currency: string,
): ServiceInput {
	const { price, ...rest } = serviceFormSchema(currency).parse(values);
	return { ...rest, priceMinor: price };
}

export const NEW_SERVICE_VALUES: ServiceFormValues = {
	name: "",
	description: "",
	price: "",
	durationMinutes: "30",
	bufferBeforeMinutes: "0",
	bufferAfterMinutes: "0",
};

export const toServiceFormValues = (
	service: ServiceDto,
): ServiceFormValues => ({
	name: service.name,
	description: service.description ?? "",
	price: formatAmountInput(service.priceMinor, service.currency),
	durationMinutes: String(service.durationMinutes),
	bufferBeforeMinutes: String(service.bufferBeforeMinutes),
	bufferAfterMinutes: String(service.bufferAfterMinutes),
});
