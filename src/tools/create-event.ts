import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import {
	type RecurrenceRuleInput,
	recurrenceRuleSchema,
	toRecurrenceRule,
} from "./recurrence-rule.js";
import { toWholeDayDate } from "./whole-day-date.js";

interface CreateEventInput {
	attendees?: string[] | undefined;
	calendarUrl: string;
	description?: string | undefined;
	end: string;
	location?: string | undefined;
	organizer?: string | undefined;
	recurrenceRule?: RecurrenceRuleInput | undefined;
	start: string;
	summary: string;
	wholeDay?: boolean | undefined;
}

export const createEventDefinition = {
	description:
		"Creates an event in the calendar specified by its URL. For all-day events, set `wholeDay` to true. For a single-day all-day event, use `start` and `end` datetimes on the same calendar date; they do not need to be identical timestamps.",
	inputSchema: {
		calendarUrl: z.string(),
		description: z.string().optional(),
		end: z
			.string()
			.datetime({ offset: true })
			.describe("End datetime (ISO 8601)"),
		location: z.string().optional(),
		organizer: z
			.string()
			.optional()
			.describe(
				"Organizer email (no mailto:), written as ORGANIZER; a scheduling-capable server (e.g. Radicale with the email/iMIP hook) uses it to send invitations, updates and cancellations to the attendees."
			),
		recurrenceRule: recurrenceRuleSchema.optional(),
		start: z
			.string()
			.datetime({ offset: true })
			.describe("Start datetime (ISO 8601)"),
		attendees: z
			.array(z.string())
			.optional()
			.describe(
				"Attendee emails (no mailto:), written as ATTENDEE lines; a scheduling-capable server mails them the invitation. Use with organizer."
			),
		summary: z.string(),
		wholeDay: z.boolean().optional().describe("Create as a whole-day event"),
	},
	name: "create-event",
	returns: "The unique ID of the created event",
} as const;

export function registerCreateEvent(client: CalDAVClient, server: McpServer) {
	server.registerTool(
		createEventDefinition.name,
		{
			description: createEventDefinition.description,
			inputSchema: createEventDefinition.inputSchema,
		},
		async (args: CreateEventInput) => {
			const {
				summary,
				start,
				end,
				wholeDay,
				description,
				location,
				recurrenceRule,
				organizer,
				attendees,
			} = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);
			// organizer/attendees are written through the ts-caldav customFields
			// escape hatch (unknown props round-trip as raw ICS lines). The typed
			// cast keeps this compiling across ts-caldav versions.
			const customFields: Record<string, string | string[]> = {};
			if (organizer) {
				customFields.organizer = `mailto:${organizer}`;
			}
			if (attendees?.length) {
				customFields.attendee = attendees.map((a) => `mailto:${a}`);
			}
			const event = await client.createEvent(calendarUrl, {
				end: wholeDay ? toWholeDayDate(end) : new Date(end),
				start: wholeDay ? toWholeDayDate(start) : new Date(start),
				summary,
				...(wholeDay !== undefined && { wholeDay }),
				...(description !== undefined && { description }),
				...(location !== undefined && { location }),
				...(recurrenceRule !== undefined && {
					recurrenceRule: toRecurrenceRule(recurrenceRule, wholeDay),
				}),
				...(Object.keys(customFields).length > 0 && {
					customFields: customFields as unknown as never,
				}),
			});

			return {
				content: [{ text: event.uid, type: "text" }],
			};
		}
	);
}
