import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { toCalendarPath } from "./caldav-href.js";
import {
	assertOrganizerForAttendees,
	emailAddressSchema,
	toCalAddress,
} from "./calendar-address.js";
import {
	reminderBeforeSchema,
	toAlarm,
	toTransp,
	transparentSchema,
} from "./event-extras.js";
import { isoDateTime } from "./iso-datetime.js";
import type { RecurrenceRuleInput } from "./recurrence-rule.js";
import { recurrenceRuleSchema, toRecurrenceRule } from "./recurrence-rule.js";
import { toWholeDayDate } from "./whole-day-date.js";

interface CreateEventInput {
	attendees?: string[] | undefined;
	calendarUrl: string;
	description?: string | undefined;
	end: string;
	location?: string | undefined;
	organizer?: string | undefined;
	recurrenceRule?: RecurrenceRuleInput | undefined;
	reminderBefore?: string | undefined;
	start: string;
	summary: string;
	transparent?: boolean | undefined;
	wholeDay?: boolean | undefined;
}

export const createEventDefinition = {
	description:
		"Creates an event in the calendar specified by its URL. For all-day events, set `wholeDay` to true. For a single-day all-day event, use `start` and `end` datetimes on the same calendar date; they do not need to be identical timestamps.",
	inputSchema: {
		calendarUrl: z.string(),
		description: z.string().optional(),
		end: isoDateTime("End datetime"),
		location: z.string().optional(),
		organizer: emailAddressSchema
			.optional()
			.describe(
				"Organizer email (no mailto:), written as ORGANIZER; a scheduling-capable server (e.g. Radicale with the email/iMIP hook) uses it to send invitations, updates and cancellations to the attendees."
			),
		recurrenceRule: recurrenceRuleSchema.optional(),
		reminderBefore: reminderBeforeSchema
			.optional()
			.describe(
				"Display reminder before the event start, as ISO 8601 duration in weeks, days, hours, minutes or seconds (e.g. P3D, PT30M)"
			),
		start: isoDateTime("Start datetime"),
		attendees: z
			.array(emailAddressSchema)
			.optional()
			.describe(
				"Attendee emails (no mailto:), written as ATTENDEE lines; a scheduling-capable server mails them the invitation. Requires organizer."
			),
		summary: z.string(),
		transparent: transparentSchema
			.optional()
			.describe("Mark the event as free (true) or busy (false)"),
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
				reminderBefore,
				transparent,
				organizer,
				attendees,
			} = args;
			const calendarUrl = toCalendarPath(args.calendarUrl, client.baseUrl);
			assertOrganizerForAttendees(organizer, attendees ?? []);
			// organizer/attendees and TRANSP go through ts-caldav's customFields,
			// which it writes as plain ICS properties.
			const customFields: Record<string, string | string[]> = {};
			if (organizer) {
				customFields.organizer = toCalAddress(organizer);
			}
			if (attendees?.length) {
				customFields.attendee = attendees.map(toCalAddress);
			}
			if (transparent !== undefined) {
				customFields.transp = toTransp(transparent);
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
				...(reminderBefore !== undefined && {
					alarms: [toAlarm(reminderBefore, summary)],
				}),
				...(Object.keys(customFields).length > 0 && { customFields }),
			});

			return {
				content: [{ text: event.uid, type: "text" }],
			};
		}
	);
}
