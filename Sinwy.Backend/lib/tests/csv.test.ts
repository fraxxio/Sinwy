import { expect, test } from "bun:test";
import { csvOf, majorUnits } from "../csv";

test("cells starting a formula are neutralised and quotes are doubled", () => {
	expect(
		csvOf([
			["=SUM(A1)", "+1", "-1", "@A1", "\tx", 'say "hi"'],
			["plain", 3],
		]),
	).toBe(
		`"'=SUM(A1)","'+1","'-1","'@A1","'\tx","say ""hi"""\r\n"plain","3"\r\n`,
	);
});

test("major units follow the currency's digits", () => {
	expect(majorUnits(12345, "EUR")).toBe("123.45");
	expect(majorUnits(500, "JPY")).toBe("500");
});
