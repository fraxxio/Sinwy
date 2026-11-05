import { expect, test } from "bun:test";
import { containsPattern } from "../utils";

test("search patterns match wildcards literally", () => {
	expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
});
