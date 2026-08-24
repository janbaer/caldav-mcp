import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Event } from "ts-caldav";
import { z } from "zod";
import { expandEvents } from "./recurrence.js";

type ListEventsInput = {
	start: string;
	end: string;
	calendarUrl: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function localDate(instant: Date): string {
	const month = `${instant.getMonth() + 1}`.padStart(2, "0");
	const day = `${instant.getDate()}`.padStart(2, "0");
	return `${instant.getFullYear()}-${month}-${day}`;
}

/** Whole days from one plain date to another. Both are zone-free, so exact. */
function daysBetween(from: string, to: string): number {
	return Math.round(
		(Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
			DAY_MS,
	);
}

/**
 * The calendar dates one whole-day occurrence covers, last day included.
 *
 * A `VALUE=DATE` carries no time and no zone, but ical.js hands it back as a
 * `Date` at local midnight. Reporting that instant puts the event on the day
 * before for any zone east of UTC: `20260825` reads as `2026-08-24T22:00:00Z`
 * in Berlin, so a vacation stored correctly looks shifted. Reading the local
 * calendar fields undoes the conversion.
 *
 * The length comes from the master's own dates rather than the difference
 * between its two instants, because a daylight saving change inside the span
 * makes that difference an hour short of whole days. `DTEND` is exclusive, so
 * the last day is one before it; a missing `DTEND` gives a span of zero and
 * leaves the occurrence on a single day.
 */
function wholeDayOccurrence(event: Event, occurrenceStart: Date) {
	const days = Math.max(
		1,
		daysBetween(localDate(event.start), localDate(event.end)),
	);
	const lastDay = new Date(occurrenceStart);
	lastDay.setDate(lastDay.getDate() + days - 1);
	return {
		start: localDate(occurrenceStart),
		end: localDate(lastDay),
		wholeDay: true,
	};
}

export const listEventsDefinition = {
	name: "list-events",
	description:
		"List all events between start and end date in the calendar specified by its URL",
	inputSchema: {
		start: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("Start date (ISO 8601)"),
		end: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("End date (ISO 8601)"),
		calendarUrl: z.string(),
	},
	returns:
		"A list of occurrences that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, `recurring`, `occurrence`, and optionally `description` and `location`. A whole-day occurrence carries `wholeDay: true`, and its `start` and `end` are plain calendar dates (`YYYY-MM-DD`); `end` names the last day it covers, not the exclusive DTEND, so it is the day create-event and update-event take as their own `end`. Those two require a full ISO 8601 datetime, so add a time and an offset before passing such a date back. Every other occurrence gives `start` and `end` as ISO 8601 instants. A recurring series contributes one entry per occurrence, so several entries share a `uid`. Careful when acting on one of them: `uid` addresses the whole series, and update-event and delete-event take nothing finer, so they change or remove every instance. `occurrence` names the single slot for display and cannot be passed back to target it.",
} as const;

export function registerListEvents(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		listEventsDefinition.name,
		{
			description: listEventsDefinition.description,
			inputSchema: listEventsDefinition.inputSchema,
		},
		async (args: ListEventsInput) => {
			const { calendarUrl, start, end } = args;
			const windowStart = new Date(start);
			const windowEnd = new Date(end);
			const allEvents = await client.getEvents(calendarUrl, {
				start: windowStart,
				end: windowEnd,
				// Servers that honour this return the occurrences already expanded,
				// with EXDATE and replacements applied; expandEvents then only has to
				// pass them through. The ones that ignore it are why it exists.
				expand: true,
			});
			const data = expandEvents(allEvents, windowStart, windowEnd).map(
				({ event, start, key, fromSeries }) => ({
					uid: event.uid,
					summary: event.summary,
					...(event.wholeDay === true
						? wholeDayOccurrence(event, start)
						: {
								start,
								end: new Date(
									start.getTime() +
										(event.end.getTime() - event.start.getTime()),
								),
							}),
					recurring: fromSeries,
					// Identifies this occurrence within the series. `uid` addresses the
					// whole series, so update-event and delete-event acting on it hit
					// every instance, not the one shown here.
					occurrence: key,
					...(event.description && { description: event.description }),
					...(event.location && { location: event.location }),
				}),
			);
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
