import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Event } from "ts-caldav";
import { CalDAVClient } from "ts-caldav";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerUpdateEvent } from "./update-event.js";

type ToolHandler = (params: {
	uid: string;
	calendarUrl: string;
	summary?: string;
	start?: string;
	end?: string;
	wholeDay?: boolean;
	description?: string;
	location?: string;
	organizer?: string;
	attendees?: string[];
	recurrenceRule?: {
		freq?: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
		interval?: number;
		count?: number;
		until?: string;
		byday?: string[];
		bymonthday?: number[];
		bymonth?: number[];
	};
}) => Promise<{ content: { type: string; text: string }[] }>;

const existingEvent: Event = {
	end: new Date("2026-04-03T11:00:00Z"),
	etag: '"abc123"',
	href: "/f/test-calendar/event-123.ics",
	start: new Date("2026-04-03T10:00:00Z"),
	summary: "Original summary",
	uid: "event-123",
};

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "update-event") {
				toolHandler = handler;
			}
			return originalRegisterTool(name, config, handler);
		}
	) as typeof server.registerTool;
	return { getHandler: () => toolHandler, server };
}

describe("registerUpdateEvent", () => {
	it("updates only the provided fields", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		const result = await handler({
			calendarUrl: "/f/test-calendar/",
			summary: "Updated summary",
			uid: "event-123",
		});

		expect(result.content[0].text).toBe("event-123");
		expect(mockClient.getEventsByHref).toHaveBeenCalledWith(
			"/f/test-calendar/",
			["/f/test-calendar/event-123.ics"]
		);
		expect(mockClient.updateEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			expect.objectContaining({
				end: existingEvent.end,
				etag: '"abc123"',
				start: existingEvent.start,
				summary: "Updated summary",
				uid: "event-123",
			})
		);
	});

	it("throws when event is not found", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([]),
			updateEvent: vi.fn(),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await expect(
			handler({ calendarUrl: "/f/test-calendar/", uid: "missing" })
		).rejects.toThrow("Event not found: missing");

		expect(mockClient.updateEvent).not.toHaveBeenCalled();
	});

	it("appends trailing slash to calendarUrl when building href", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({ calendarUrl: "/f/test-calendar", uid: "event-123" });

		expect(mockClient.getEventsByHref).toHaveBeenCalledWith(
			"/f/test-calendar",
			["/f/test-calendar/event-123.ics"]
		);
	});

	it("converts recurrenceRule.until from ISO string to Date", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		const untilIso = "2026-05-15T10:00:00.000Z";
		await handler({
			calendarUrl: "/f/test-calendar/",
			recurrenceRule: { freq: "DAILY", until: untilIso },
			uid: "event-123",
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.recurrenceRule?.until).toBeInstanceOf(Date);
		expect(passed?.recurrenceRule?.until?.toISOString()).toBe(untilIso);
		expect(passed?.recurrenceRule?.freq).toBe("DAILY");
	});

	it("turns a timed event into a whole-day event on the same day", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			uid: "event-123",
			wholeDay: true,
		});

		// The writer stores the toISOString() day of start and end, and treats
		// end as the last day of the event. Both must be 2026-04-03, or the
		// event ends up with DTEND <= DTSTART.
		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString().slice(0, 10)).toBe("2026-04-03");
		expect(passed?.end.toISOString().slice(0, 10)).toBe("2026-04-03");
	});

	it("updates wholeDay flag when provided", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			uid: "event-123",
			wholeDay: true,
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.wholeDay).toBe(true);
	});
	it("preserves the calendar date when updating a whole-day event with a positive UTC offset", async () => {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-09-30T00:00:00+09:00",
			recurrenceRule: { freq: "YEARLY", until: "2030-09-30T00:00:00+09:00" },
			start: "2026-09-30T00:00:00+09:00",
			uid: "event-123",
			wholeDay: true,
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.recurrenceRule?.until?.toISOString()).toBe(
			"2030-09-30T00:00:00.000Z"
		);
	});

	it("keeps treating start/end as whole-day when wholeDay isn't passed but the existing event is whole-day", async () => {
		const existingWholeDayEvent: Event = {
			...existingEvent,
			wholeDay: true,
		};
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([existingWholeDayEvent]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: existingEvent.href,
				newCtag: "",
				uid: "event-123",
			}),
		};

		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-09-30T00:00:00+09:00",
			start: "2026-09-30T00:00:00+09:00",
			uid: "event-123",
		});

		const passed = mockClient.updateEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
	});
});

describe("registerUpdateEvent whole-day handling", () => {
	// A VALUE=DATE reaches us as local midnight; pin a zone east of UTC so
	// that local midnight is the previous day in UTC. Pinned here rather than
	// relying on the global TZ in vitest.config.ts, so these tests keep
	// exercising the shift even if that default changes.
	beforeEach(() => {
		vi.stubEnv("TZ", "Europe/Berlin");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// Built per test so the fixture is read in the stubbed zone.
	const wholeDayEvent = (): Event => ({
		end: new Date(2026, 7, 23),
		etag: '"trip"',
		href: "/f/test-calendar/trip-1.ics",
		start: new Date(2026, 7, 18),
		summary: "Trip",
		uid: "trip-1",
		wholeDay: true,
	});

	async function run(event: Event, args: Parameters<ToolHandler>[0]) {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([event]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new"',
				href: event.href,
				newCtag: "",
				uid: event.uid,
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}
		await handler(args);
		return mockClient;
	}

	// Serialize the way ts-caldav does: VALUE=DATE from toISOString(), and
	// DTEND = inclusive end + 1 day.
	const asDate = (d: Date) => d.toISOString().slice(0, 10);
	const asExclusiveEnd = (d: Date) =>
		asDate(new Date(d.getTime() + 24 * 60 * 60 * 1000));

	it("writes back the stored DTSTART and DTEND when only the location changes", async () => {
		const client = await run(wholeDayEvent(), {
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
			uid: "trip-1",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(payload.location).toBe("Somewhere else");
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asExclusiveEnd(payload.end)).toBe("2026-08-23");
	});

	it("keeps RRULE UNTIL, EXDATE, RDATE and RECURRENCE-ID on their days when only the location changes", async () => {
		const yearly: Event = {
			...wholeDayEvent(),
			end: new Date(2026, 9, 1),
			exdates: [new Date(2027, 8, 30)],
			rdates: [new Date(2027, 9, 2)],
			recurrenceId: new Date(2028, 8, 30),
			recurrenceRule: { freq: "YEARLY", until: new Date(2030, 8, 30) },
			start: new Date(2026, 8, 30),
		};
		const client = await run(yearly, {
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
			uid: "trip-1",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(asDate(payload.start)).toBe("2026-09-30");
		expect(asExclusiveEnd(payload.end)).toBe("2026-10-01");
		expect(payload.recurrenceRule.freq).toBe("YEARLY");
		expect(asDate(payload.recurrenceRule.until)).toBe("2030-09-30");
		expect(payload.exdates.map(asDate)).toEqual(["2027-09-30"]);
		expect(payload.rdates.map(asDate)).toEqual(["2027-10-02"]);
		expect(asDate(payload.recurrenceId)).toBe("2028-09-30");
	});

	it("keeps a zero-length whole-day event (DTEND equal to DTSTART) a valid range", async () => {
		const zeroLength: Event = {
			...wholeDayEvent(),
			end: new Date(2026, 7, 18),
		};
		const client = await run(zeroLength, {
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
			uid: "trip-1",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asDate(payload.end)).toBe("2026-08-18");
	});

	it("turns a timed event into a whole-day event on its local day", async () => {
		// 00:30 to 01:30 in Berlin, still the 17th in UTC.
		const lateNight: Event = {
			...wholeDayEvent(),
			end: new Date("2026-08-18T01:30:00+02:00"),
			start: new Date("2026-08-18T00:30:00+02:00"),
			wholeDay: false,
		};
		const client = await run(lateNight, {
			calendarUrl: "/f/test-calendar/",
			uid: "trip-1",
			wholeDay: true,
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(payload.wholeDay).toBe(true);
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asExclusiveEnd(payload.end)).toBe("2026-08-19");
	});

	it("keeps a timed event that ends at midnight on one day when it becomes whole-day", async () => {
		const toMidnight: Event = {
			...wholeDayEvent(),
			end: new Date("2026-08-19T00:00:00+02:00"),
			start: new Date("2026-08-18T23:00:00+02:00"),
			wholeDay: false,
		};
		const client = await run(toMidnight, {
			calendarUrl: "/f/test-calendar/",
			uid: "trip-1",
			wholeDay: true,
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(asDate(payload.start)).toBe("2026-08-18");
		expect(asExclusiveEnd(payload.end)).toBe("2026-08-19");
	});

	it("converts an explicitly given date to its calendar day", async () => {
		const client = await run(wholeDayEvent(), {
			calendarUrl: "/f/test-calendar/",
			start: "2026-09-01T00:00:00+02:00",
			uid: "trip-1",
		});

		const [, payload] = client.updateEvent.mock.calls[0];
		expect(payload.start).toEqual(new Date("2026-09-01T00:00:00.000Z"));
		expect(payload.end).toEqual(new Date(Date.UTC(2026, 7, 22)));
	});

	it("does not touch the dates of a timed event", async () => {
		const timed: Event = { ...wholeDayEvent(), wholeDay: false };
		const client = await run(timed, {
			calendarUrl: "/f/test-calendar/",
			location: "Somewhere else",
			uid: "trip-1",
		});

		expect(client.updateEvent).toHaveBeenCalledWith(
			"/f/test-calendar/",
			expect.objectContaining({ end: timed.end, start: timed.start })
		);
	});
});

describe("registerUpdateEvent organizer and attendees", () => {
	const scheduled: Event = {
		...existingEvent,
		customFields: {
			attendee: ["mailto:a@example.com", "mailto:b@example.com"],
			organizer: "mailto:o@example.com",
			"x-custom": "keep me",
		},
	};

	async function update(
		stored: Event,
		changes: { organizer?: string; attendees?: string[]; summary?: string }
	) {
		const mockClient = {
			getEventsByHref: vi.fn().mockResolvedValue([stored]),
			updateEvent: vi.fn().mockResolvedValue({
				etag: '"new-etag"',
				href: stored.href,
				newCtag: "",
				uid: stored.uid,
			}),
		};
		const { server, getHandler } = makeServer();
		registerUpdateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}
		await handler({
			calendarUrl: "/f/test-calendar/",
			uid: stored.uid,
			...changes,
		});
		return mockClient.updateEvent.mock.calls[0]?.[1] as Event;
	}

	it("keeps the stored custom fields when neither is passed", async () => {
		const payload = await update(scheduled, { summary: "Renamed" });
		expect(payload.customFields).toEqual(scheduled.customFields);
	});

	it("changes only the organizer and keeps the attendees", async () => {
		const payload = await update(scheduled, { organizer: "new@example.com" });
		expect(payload.customFields).toEqual({
			attendee: ["mailto:a@example.com", "mailto:b@example.com"],
			organizer: "mailto:new@example.com",
			"x-custom": "keep me",
		});
	});

	it("replaces the attendee list and keeps the organizer", async () => {
		const payload = await update(scheduled, {
			attendees: ["a@example.com", "c@example.com"],
		});
		expect(payload.customFields).toEqual({
			attendee: ["mailto:a@example.com", "mailto:c@example.com"],
			organizer: "mailto:o@example.com",
			"x-custom": "keep me",
		});
	});

	it("keeps a single stored attendee (a plain string) when only the organizer changes", async () => {
		const payload = await update(
			{
				...existingEvent,
				customFields: {
					attendee: "mailto:a@example.com",
					organizer: "mailto:o@example.com",
				},
			},
			{ organizer: "new@example.com" }
		);
		expect(payload.customFields).toEqual({
			attendee: ["mailto:a@example.com"],
			organizer: "mailto:new@example.com",
		});
	});

	it("removes all attendees with an empty list", async () => {
		const payload = await update(scheduled, { attendees: [] });
		expect(payload.customFields).toEqual({
			organizer: "mailto:o@example.com",
			"x-custom": "keep me",
		});
	});

	it("removes organizer and attendees together", async () => {
		const payload = await update(scheduled, { attendees: [], organizer: "" });
		expect(payload.customFields).toEqual({ "x-custom": "keep me" });
	});

	it("refuses to remove the organizer while attendees remain", async () => {
		await expect(update(scheduled, { organizer: "" })).rejects.toThrow(
			"attendees need an organizer"
		);
	});

	it("refuses to add attendees to an event without an organizer", async () => {
		await expect(
			update(existingEvent, { attendees: ["a@example.com"] })
		).rejects.toThrow("attendees need an organizer");
	});
});

// Runs ts-caldav's own reader and writer, with only the HTTP calls stubbed, so
// the alarms go through the same round trip as against a server.
describe("registerUpdateEvent alarm round trip", () => {
	function eventIcs(alarms: string): string {
		return [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Example Corp//Calendar//EN",
			"BEGIN:VEVENT",
			"UID:event-123",
			"DTSTAMP:20261120T100000Z",
			"DTSTART:20261127T090000Z",
			"DTEND:20261127T100000Z",
			"SUMMARY:Original summary",
			alarms,
			"END:VEVENT",
			"END:VCALENDAR",
		].join("\r\n");
	}

	function multistatus(ics: string): string {
		return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
	<d:response>
		<d:href>/f/test-calendar/event-123.ics</d:href>
		<d:propstat>
			<d:prop>
				<d:getetag>"abc123"</d:getetag>
				<cal:calendar-data>${ics}</cal:calendar-data>
			</d:prop>
			<d:status>HTTP/1.1 200 OK</d:status>
		</d:propstat>
	</d:response>
</d:multistatus>`;
	}

	async function updateSummaryOf(storedIcs: string): Promise<string> {
		const client = new CalDAVClient({
			auth: { password: "secret", type: "basic", username: "user" },
			baseUrl: "https://caldav.example.com",
		});
		vi.spyOn(client, "report").mockResolvedValue(multistatus(storedIcs));
		vi.spyOn(client, "getCtag").mockResolvedValue("ctag");
		const put = vi
			.spyOn(client, "mkIcsPut")
			.mockResolvedValue({ data: "", headers: {}, status: 204 });

		const { server, getHandler } = makeServer();
		registerUpdateEvent(client, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}
		await handler({
			calendarUrl: "/f/test-calendar/",
			summary: "Updated summary",
			uid: "event-123",
		});

		const written = put.mock.calls[0]?.[1];
		if (written === undefined) {
			throw new Error("event not written");
		}
		return written;
	}

	it("keeps an alarm with an absolute trigger time", async () => {
		const written = await updateSummaryOf(
			eventIcs(
				[
					"BEGIN:VALARM",
					"ACTION:DISPLAY",
					"DESCRIPTION:Reminder",
					"TRIGGER;VALUE=DATE-TIME:20261127T080000Z",
					"END:VALARM",
				].join("\r\n")
			)
		);

		expect(written).toContain("SUMMARY:Updated summary");
		expect(written).toContain("TRIGGER;VALUE=DATE-TIME:20261127T080000Z");
	});

	it("keeps relative alarms unchanged", async () => {
		const written = await updateSummaryOf(
			eventIcs(
				[
					"BEGIN:VALARM",
					"ACTION:DISPLAY",
					"DESCRIPTION:Reminder",
					"TRIGGER:-PT15M",
					"END:VALARM",
					"BEGIN:VALARM",
					"ACTION:AUDIO",
					"TRIGGER:P1D",
					"END:VALARM",
				].join("\r\n")
			)
		);

		expect(written).toContain("TRIGGER:-PT15M");
		expect(written).toContain("TRIGGER:P1D");
	});
});
