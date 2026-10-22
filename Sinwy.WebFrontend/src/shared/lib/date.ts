/** "Nov 21, 2026"; "—" for a date that doesn't parse, so one bad value can't break a page. */
export function formatDay(iso: string, locale?: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
