import { describe, expect, test } from "bun:test";
import { summarizeTestOutput } from "./verify";

const output = `$ cd Sinwy.Backend && bun test
bun test v1.3.13 (bf2e2cec)
[\x1b[2K\x1b[1G✓] Pulling schema from database...

modules/billing/tests/billing.test.ts:
2026-10-25T16:04:27.804Z INFO [billing:projection] Organization projected from subscription {
  organizationId: "org_1",
}
2026-10-25T16:04:27.954Z ERROR [billing] Polar plan change failed {
  organizationId: "org_2",
  error: "ResourceNotFound",
}
2026-10-25T16:04:27.955Z ERROR [billing] Polar plan change failed {
  organizationId: "org_2",
}
2026-10-25T16:04:28.234Z ERROR [Better Auth]: Invalid checkout request
Warning: An update to Dialog inside a test was not wrapped in act(...)

modules/auth/tests/setActive.test.ts:
2026-10-25T16:04:26.846Z WARN [auth:permission] Member row has no recognised role {
  role: "member",
}

 283 pass
 2 skip
 0 fail
 719 expect() calls
Ran 285 tests across 29 files. [4.54s]
`;

describe("summarizeTestOutput", () => {
	const lines = summarizeTestOutput(output);
	const text = lines.join("\n");

	test("keeps the totals, including skips", () => {
		expect(lines[0]).toBe(
			"  283 pass, 2 skip, 0 fail, 719 expect() calls, Ran 285 tests across 29 files. [4.54s]",
		);
	});

	test("lists distinct WARN and ERROR messages per test file with counts", () => {
		expect(text).toContain(
			"    modules/billing/tests/billing.test.ts\n      2× ERROR [billing] Polar plan change failed\n      1× ERROR [Better Auth]: Invalid checkout request",
		);
		expect(text).toContain(
			"    modules/auth/tests/setActive.test.ts\n      1× WARN [auth:permission] Member row has no recognised role",
		);
	});

	test("drops INFO lines and log bodies", () => {
		expect(text).not.toContain("Organization projected");
		expect(text).not.toContain("organizationId");
	});

	test("keeps output that isn't from the app logger, under its file", () => {
		expect(text).toContain(
			"    modules/billing/tests/billing.test.ts\n      Warning: An update to Dialog inside a test was not wrapped in act(...)",
		);
		expect(text).toContain(
			"    (setup)\n      [✓] Pulling schema from database...",
		);
	});
});
