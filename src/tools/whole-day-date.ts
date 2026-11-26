import type { Event } from "ts-caldav";
import { z } from "zod";

// ts-caldav and ical.js disagree about how a whole-day (`VALUE=DATE`) value is
// represented as a `Date`. ts-caldav writes each date it stores (DTSTART,
// DTEND, RRULE UNTIL, EXDATE, RDATE, RECURRENCE-ID) with
// `date.toISOString().split("T")[0]` (the UTC calendar day) and takes `end` as
// inclusive, adding a day itself to produce the exclusive DTEND. ical.js reads
// a `VALUE=DATE` back as local midnight, and reports DTEND as is (exclusive).
// The helpers below anchor a calendar day at UTC midnight, so the writer's
// `toISOString()` truncation stores exactly the day that was meant.

/**
 * Converts an ISO 8601 datetime string to a `Date` representing the same
 * calendar date at UTC midnight, for use with whole-day events.
 *
 * A `Date` built with `new Date(iso)` preserves the input's UTC *instant*, not
 * its calendar date, so for any offset east of UTC ts-caldav's truncation
 * silently rolls the stored date back by one day (e.g. local midnight
 * `2026-09-30T00:00:00+09:00` becomes `2026-09-29T15:00:00.000Z`, which
 * truncates to `2026-09-29`). Taking the date part of the string as written
 * makes the truncation a no-op, so the calendar date the caller wrote is the
 * calendar date that gets stored.
 */
export function toWholeDayDate(iso: string): Date {
	return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Anchors the local calendar day of a `Date` read from the server at UTC
 * midnight, so ts-caldav's writer stores that day again.
 *
 * ical.js hands a `VALUE=DATE` back as local midnight, which `toISOString()`
 * turns into the previous day in any zone east of UTC. For a timed value
 * (when a timed event becomes whole-day) the local day is the day the event
 * shows on in this server's zone, which is also what UTC truncation misses.
 */
export function localDayToWholeDayDate(value: Date): Date {
	return new Date(
		Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
	);
}

/**
 * Turns an end read from the server into the inclusive last day ts-caldav's
 * writer expects, anchored at UTC midnight.
 *
 * A whole-day DTEND is exclusive (local midnight after the last day) and a
 * timed end is the instant the event stops, so in both cases the last day is
 * the local day of the instant just before `end`. It is never earlier than
 * the start's day, so a zero-length event (DTEND equal to DTSTART) stays a
 * valid one-day range instead of ending before it starts.
 */
export function inclusiveEndToWholeDayDate(end: Date, start: Date): Date {
	const last = localDayToWholeDayDate(new Date(end.getTime() - 1));
	const first = localDayToWholeDayDate(start);
	// biome-ignore lint/complexity/useMathMinMax: Math.max returns a number; this must return the later Date.
	return last < first ? first : last;
}

/**
 * Reshapes every date of a stored event that an update carries over, so a
 * whole-day event keeps its days when the caller changes something else.
 *
 * Covers DTSTART and DTEND as well as RRULE UNTIL, EXDATE, RDATE and
 * RECURRENCE-ID: ts-caldav reads and writes them all the way described above,
 * so leaving any one of them out moves it a day earlier east of UTC (an UNTIL
 * that drops the last occurrence, an EXDATE that no longer excludes
 * anything). Values the caller passes explicitly override these.
 */
export function carryOverWholeDayDates(existing: Event): Partial<Event> {
	const carried: Partial<Event> = {
		start: localDayToWholeDayDate(existing.start),
	};
	// Events built outside ts-caldav's parser can lack DTEND.
	const end = existing.end as Date | undefined;
	if (end) {
		carried.end = inclusiveEndToWholeDayDate(end, existing.start);
	}
	if (existing.recurrenceRule?.until) {
		carried.recurrenceRule = {
			...existing.recurrenceRule,
			until: localDayToWholeDayDate(existing.recurrenceRule.until),
		};
	}
	if (existing.exdates) {
		carried.exdates = existing.exdates.map(localDayToWholeDayDate);
	}
	if (existing.rdates) {
		carried.rdates = existing.rdates.map(localDayToWholeDayDate);
	}
	if (existing.recurrenceId) {
		carried.recurrenceId = localDayToWholeDayDate(existing.recurrenceId);
	}
	return carried;
}

const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

const eventDateSchema = z
	.string()
	.refine(
		(value) =>
			isoDateTime.safeParse(value).success || isoDate.safeParse(value).success,
		{
			message:
				"Invalid datetime, expected ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00, or a plain date (YYYY-MM-DD) for a whole-day event",
		}
	);

export const eventStartSchema = eventDateSchema.describe(
	"Start datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z). A whole-day event also accepts a plain date (YYYY-MM-DD)."
);

export const eventEndSchema = eventDateSchema.describe(
	"End datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z). A whole-day event also accepts a plain date (YYYY-MM-DD), which is the last day the event covers (inclusive)."
);

/**
 * Parses a `start` or `end` argument. A plain `YYYY-MM-DD`, which is what
 * list-events reports for a whole-day event, is only valid for a whole-day
 * event: for a timed one it would silently mean midnight UTC.
 */
export function toEventDate(
	value: string,
	wholeDay: boolean | undefined
): Date {
	if (wholeDay) {
		return toWholeDayDate(value);
	}
	if (isoDate.safeParse(value).success) {
		throw new Error(
			`"${value}" is a plain date, which is only valid for a whole-day event. Pass a full ISO 8601 datetime, or set wholeDay to true.`
		);
	}
	return new Date(value);
}

/**
 * The calendar dates a whole-day event covers, as list-events reports them.
 *
 * ical.js hands a `VALUE=DATE` back as local midnight, which serialises to the
 * previous day east of UTC. Reading the local calendar fields gives the date
 * the server stored. DTEND is exclusive, so the day before it is the last day
 * the event covers, which is also what create-event and update-event take as
 * `end`.
 */
export function wholeDaySpan(event: Event) {
	const end = event.end as Date | undefined;
	const first = localDayToWholeDayDate(event.start);
	const last = end ? inclusiveEndToWholeDayDate(end, event.start) : first;
	return {
		end: last.toISOString().slice(0, 10),
		start: first.toISOString().slice(0, 10),
	};
}
