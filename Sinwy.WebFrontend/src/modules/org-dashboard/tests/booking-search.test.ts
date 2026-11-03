import { expect, it } from "bun:test";
import {
	type BookingsSearch,
	bookingsSearchSchema,
	calendarStatusesOf,
	toQueryString,
} from "#/modules/org-dashboard/lib/booking-search";

const defaults: BookingsSearch = {
	view: "calendar",
	calendarView: "month",
	showCancelled: false,
	serviceId: [],
	status: [],
	sort: "startsAt",
	page: 1,
};

it("opens the calendar month view with no params", () => {
	expect(bookingsSearchSchema.parse({})).toEqual(defaults);
});

it("round-trips a full set of params", () => {
	const search = {
		view: "list",
		calendarView: "week",
		date: "2026-11-04",
		showCancelled: true,
		from: "2026-11-01",
		to: "2026-11-30",
		serviceId: ["a", "b"],
		status: ["pending", "confirmed"],
		q: "ana@example.com",
		sort: "-createdAt",
		page: 3,
	};
	const parsed = bookingsSearchSchema.parse(search);
	expect(parsed).toEqual(search as never);
	expect(bookingsSearchSchema.parse(parsed)).toEqual(parsed);
});

it("falls back to the defaults for invalid values", () => {
	expect(
		bookingsSearchSchema.parse({
			view: "grid",
			calendarView: "year",
			date: "tomorrow",
			showCancelled: "yes",
			from: "2026-13-01",
			serviceId: 5,
			status: "lost",
			sort: "price",
			page: -2,
		}),
	).toEqual(defaults);
});

it("takes a single value as a list and drops a list's bad entries", () => {
	const parsed = bookingsSearchSchema.parse({
		status: "confirmed",
		serviceId: "a",
	});
	expect(parsed.status).toEqual(["confirmed"]);
	expect(parsed.serviceId).toEqual(["a"]);
	expect(
		bookingsSearchSchema.parse({ status: ["pending", "lost"] }).status,
	).toEqual(["pending"]);
});

it("asks the calendar for every status only when cancelled are shown", () => {
	const search = bookingsSearchSchema.parse({});
	expect(calendarStatusesOf(search)).toEqual([]);
	expect(calendarStatusesOf({ ...search, showCancelled: true })).toContain(
		"cancelled",
	);
});

it("repeats list keys in the query string and skips empty values", () => {
	expect(
		toQueryString({
			from: "2026-11-01",
			to: undefined,
			status: ["pending", "confirmed"],
			serviceId: [],
			q: "",
			page: 2,
		}),
	).toBe("?from=2026-11-01&status=pending&status=confirmed&page=2");
	expect(toQueryString({ serviceId: [] })).toBe("");
});
