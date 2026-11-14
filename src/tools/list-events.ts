import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient, Event } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import { readTransparent } from "./event-extras.js";
import { expandEvents } from "./recurrence.js";
import { wholeDaySpan } from "./whole-day-date.js";

const DAY_MS = 24 * 60 * 60 * 1000;

interface ListEventsInput {
	calendarUrl: string;
	end: string;
	start: string;
}

export const listEventsDefinition = {
	description:
		"List all events between start and end date in the calendar specified by its URL. A whole-day event has `wholeDay: true` and plain calendar dates (`YYYY-MM-DD`) as `start` and `end`; `end` is the last day the event covers (inclusive, not the exclusive iCalendar DTEND). These dates can be passed to create-event and update-event as they are, together with `wholeDay: true`. Every other event has ISO 8601 instants.",
	inputSchema: {
		calendarUrl: z.string(),
		end: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("End date (ISO 8601)"),
		start: z
			.string()
			.refine((val) => !Number.isNaN(Date.parse(val)), {
				message: "Invalid date string",
			})
			.describe("Start date (ISO 8601)"),
	},
	name: "list-events",
	returns:
		"A list of occurrences that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, `recurring`, `occurrence`, and optionally `description`, `location`, `alarms` (each with `action` and `trigger`, e.g. `-PT30M`) and `transparent` (true when the event is marked free). A whole-day event also carries `wholeDay: true`, and its `start` and `end` are plain calendar dates (`YYYY-MM-DD`) with `end` being the last day covered. A recurring series contributes one entry per occurrence, so several entries share a `uid`. Careful when acting on one of them: `uid` addresses the whole series, and update-event and delete-event take nothing finer, so they change or remove every instance. `occurrence` names the single slot for display and cannot be passed back to target it.",
} as const;

// The event moved to one occurrence. A whole-day event spans calendar days, so
// its length is added in days: milliseconds would be an hour short or long
// across a clock change.
function atOccurrence(event: Event, occurrenceStart: Date): Event {
	const end = new Date(occurrenceStart);
	const lengthMs = event.end.getTime() - event.start.getTime();
	if (event.wholeDay === true) {
		end.setDate(end.getDate() + Math.round(lengthMs / DAY_MS));
	} else {
		end.setTime(end.getTime() + lengthMs);
	}
	return { ...event, end, start: occurrenceStart };
}

export function registerListEvents(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		listEventsDefinition.name,
		{
			description: listEventsDefinition.description,
			inputSchema: listEventsDefinition.inputSchema,
		},
		async (args: ListEventsInput) => {
			const { start, end } = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);
			const windowStart = new Date(start);
			const windowEnd = new Date(end);
			const allEvents = await client.getEvents(calendarUrl, {
				end: windowEnd,
				start: windowStart,
			});
			const data = expandEvents(allEvents, windowStart, windowEnd).map(
				({ event, start: occurrenceStart, key, fromSeries }) => {
					const transparent = readTransparent(event.customFields);
					return {
						...(event.wholeDay === true
							? wholeDaySpan(atOccurrence(event, occurrenceStart))
							: {
									end: atOccurrence(event, occurrenceStart).end,
									start: occurrenceStart,
								}),
						// Identifies this occurrence within the series. `uid` addresses the
						// whole series, so update-event and delete-event acting on it hit
						// every instance, not the one shown here.
						occurrence: key,
						recurring: fromSeries,
						summary: event.summary,
						uid: event.uid,
						...(event.description && { description: event.description }),
						...(event.location && { location: event.location }),
						...(event.alarms?.length && {
							alarms: event.alarms.map(({ action, trigger }) => ({
								action,
								trigger,
							})),
						}),
						...(transparent !== undefined && { transparent }),
					};
				}
			);
			return {
				content: [{ text: JSON.stringify(data), type: "text" }],
			};
		}
	);
}
