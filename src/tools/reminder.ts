import ICAL from "ical.js";
import type { Alarm } from "ts-caldav";

// A trigger that ts-caldav read back is a string: an ISO 8601 duration
// (`-PT15M`) for a relative alarm, or a datetime (`2026-11-27T08:00:00Z`) for
// an absolute one. ts-caldav's `addAlarms` hands the trigger to ical.js as is,
// which parses a string as a duration, so only an `ICAL.Time` writes a
// `TRIGGER;VALUE=DATE-TIME`. The `Alarm` type says `string`, hence the casts.
// Workaround for the lost trigger parameters, reported in issue #192.
const DURATION = /^[+-]?P/u;

function isDuration(trigger: string): boolean {
	return DURATION.test(trigger);
}

/** One display alarm that fires at `at` (ISO 8601 with offset). */
export function reminderAlarm(at: string, description: string): Alarm {
	const trigger = ICAL.Time.fromJSDate(new Date(at), true);
	return {
		action: "DISPLAY",
		description,
		trigger: trigger as unknown as string,
	};
}

/**
 * Alarms as read from the server, made writable again: an absolute trigger
 * becomes an `ICAL.Time`, so writing it back keeps `VALUE=DATE-TIME` instead
 * of throwing `invalid duration value`.
 */
export function writableAlarms(alarms: Alarm[]): Alarm[] {
	return alarms.map((alarm) =>
		isDuration(alarm.trigger)
			? alarm
			: {
					...alarm,
					trigger: ICAL.Time.fromDateTimeString(
						alarm.trigger
					) as unknown as string,
				}
	);
}

/**
 * When each alarm fires, as ISO datetimes. A relative trigger is resolved
 * against `start`; without one it is returned as the raw duration. ts-caldav
 * drops `RELATED=END`, so a due-relative trigger is resolved wrongly (#192).
 */
export function reminderTimes(alarms: Alarm[], start?: Date): string[] {
	return alarms.map(({ trigger }) => {
		if (!isDuration(trigger)) {
			return new Date(trigger).toISOString();
		}
		if (!start) {
			return trigger;
		}
		const seconds = ICAL.Duration.fromString(trigger).toSeconds();
		return new Date(start.getTime() + seconds * 1000).toISOString();
	});
}

/**
 * The alarms an update writes: `reminderAt` replaces them all with one,
 * `null` removes them, and omitting it keeps the existing ones. A kept
 * display alarm that showed the old summary shows the new one.
 */
export function updatedAlarms(
	existing: Alarm[] | undefined,
	reminderAt: string | null | undefined,
	summary: { before: string; after: string }
): Alarm[] | undefined {
	if (reminderAt === null) {
		return [];
	}
	if (reminderAt !== undefined) {
		return [reminderAlarm(reminderAt, summary.after)];
	}
	return (
		existing &&
		writableAlarms(existing).map((alarm) =>
			alarm.action === "DISPLAY" && alarm.description === summary.before
				? { ...alarm, description: summary.after }
				: alarm
		)
	);
}
