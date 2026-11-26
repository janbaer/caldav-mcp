import ICAL from "ical.js";
import type { Alarm } from "ts-caldav";
import { describe, expect, it } from "vitest";
import { reminderAlarm, reminderTimes, updatedAlarms } from "./reminder.js";

// Serializes alarms the way ts-caldav's `addAlarms` does.
function serialize(alarms: Alarm[]): string {
	const vtodo = new ICAL.Component("vtodo");
	for (const alarm of alarms) {
		const valarm = new ICAL.Component("valarm");
		valarm.addPropertyWithValue("trigger", alarm.trigger);
		valarm.addPropertyWithValue("action", alarm.action);
		if (alarm.description) {
			valarm.addPropertyWithValue("description", alarm.description);
		}
		vtodo.addSubcomponent(valarm);
	}
	return vtodo.toString();
}

describe("reminderAlarm", () => {
	it("writes one display alarm at an absolute UTC time with a description", () => {
		const ics = serialize([
			reminderAlarm("2026-11-27T09:00:00+01:00", "Call the plumber"),
		]);

		expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261127T080000Z");
		expect(ics).toContain("ACTION:DISPLAY");
		expect(ics).toContain("DESCRIPTION:Call the plumber");
	});
});

describe("updatedAlarms", () => {
	const same = { after: "Task", before: "Task" };
	const existing: Alarm[] = [
		{ action: "DISPLAY", description: "Old", trigger: "2026-11-27T08:00:00Z" },
		{ action: "DISPLAY", description: "Old", trigger: "-PT15M" },
	];

	it("keeps existing alarms, absolute ones writable again", () => {
		const alarms = updatedAlarms(existing, undefined, same);

		// A read-back datetime string would make ical.js throw
		// `invalid duration value`.
		expect(() => serialize([existing[0] as Alarm])).toThrow();
		const ics = serialize(alarms ?? []);
		expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261127T080000Z");
		expect(ics).toContain("TRIGGER:-PT15M");
	});

	it("leaves alarms untouched when the task has none and none are asked for", () => {
		expect(updatedAlarms(undefined, undefined, same)).toBeUndefined();
	});

	it("replaces all alarms with one at the new time", () => {
		const alarms = updatedAlarms(existing, "2026-11-27T10:00:00Z", {
			after: "Renamed",
			before: "Old",
		});

		expect(alarms).toHaveLength(1);
		expect(alarms?.[0]?.description).toBe("Renamed");
		expect(serialize(alarms ?? [])).toContain(
			"TRIGGER;VALUE=DATE-TIME:20261127T100000Z"
		);
	});

	it("moves a kept alarm's description to the new summary", () => {
		const alarms = updatedAlarms(
			[
				...existing,
				{ action: "DISPLAY", description: "Custom", trigger: "-PT1H" },
			],
			undefined,
			{ after: "Renamed", before: "Old" }
		);

		expect(alarms?.map((a) => a.description)).toEqual([
			"Renamed",
			"Renamed",
			"Custom",
		]);
	});

	it("removes all alarms for null", () => {
		expect(updatedAlarms(existing, null, same)).toEqual([]);
	});
});

describe("reminderTimes", () => {
	it("returns absolute triggers as ISO datetimes", () => {
		expect(
			reminderTimes([{ action: "DISPLAY", trigger: "2026-11-27T08:00:00Z" }])
		).toEqual(["2026-11-27T08:00:00.000Z"]);
	});

	it("resolves a relative trigger against start", () => {
		expect(
			reminderTimes(
				[{ action: "DISPLAY", trigger: "-PT15M" }],
				new Date("2026-11-27T09:00:00Z")
			)
		).toEqual(["2026-11-27T08:45:00.000Z"]);
	});

	it("returns a relative trigger raw when there is no start", () => {
		expect(reminderTimes([{ action: "DISPLAY", trigger: "-PT15M" }])).toEqual([
			"-PT15M",
		]);
	});
});
