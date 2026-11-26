import { describe, expect, it } from "vitest";
import { isoDateTime } from "./iso-datetime.js";

const schema = isoDateTime("Start datetime");

describe("isoDateTime", () => {
	it.each([
		"2026-05-01T09:00:00Z",
		"2026-05-01T09:00:00+01:00",
		"2026-05-01T09:00:00.123Z",
		"2026-05-01T09:00:00.5-05:30",
	])("accepts %s", (value) => {
		expect(schema.safeParse(value).success).toBe(true);
	});

	it.each([
		"2026-05-01T09:00:00",
		"2026-05-01",
		"tomorrow at 9",
		"2026-02-30T09:00:00Z",
	])("rejects %s", (value) => {
		expect(schema.safeParse(value).success).toBe(false);
	});
});
