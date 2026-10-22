// formatted dates must not depend on the machine running the tests; an
// explicit TZ in the environment would otherwise override bun test's UTC
process.env["TZ"] = "UTC";
