import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createEventDefinition, registerCreateEvent } from "./create-event.js";

type ToolHandler = (params: {
	summary: string;
	start: string;
	end: string;
	calendarUrl: string;
	wholeDay?: boolean;
	description?: string;
	location?: string;
	reminderBefore?: string;
	transparent?: boolean;
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

function makeServer() {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });
	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "create-event") {
				toolHandler = handler;
			}
			return originalRegisterTool(name, config, handler);
		}
	) as typeof server.registerTool;
	return { getHandler: () => toolHandler, server };
}

describe("registerCreateEvent", () => {
	it("converts recurrenceRule.until from ISO string to Date", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		const untilIso = "2026-05-15T10:00:00.000Z";
		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-05-12T10:30:00.000Z",
			recurrenceRule: { freq: "DAILY", until: untilIso },
			start: "2026-05-12T10:00:00.000Z",
			summary: "Recurring",
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.recurrenceRule?.until).toBeInstanceOf(Date);
		expect(passed?.recurrenceRule?.until?.toISOString()).toBe(untilIso);
		expect(passed?.recurrenceRule?.freq).toBe("DAILY");
	});

	it("omits recurrenceRule when not provided", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-05-12T10:30:00.000Z",
			start: "2026-05-12T10:00:00.000Z",
			summary: "One-off",
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.recurrenceRule).toBeUndefined();
	});

	it("passes wholeDay flag when true", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-05-13T00:00:00.000Z",
			start: "2026-05-12T00:00:00.000Z",
			summary: "Whole day",
			wholeDay: true,
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.wholeDay).toBe(true);
	});

	it("passes wholeDay flag when false", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-05-12T10:30:00.000Z",
			start: "2026-05-12T10:00:00.000Z",
			summary: "Timed event",
			wholeDay: false,
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.wholeDay).toBe(false);
	});

	it("preserves the calendar date for whole-day events with a positive UTC offset", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-09-30T00:00:00+09:00",
			recurrenceRule: {
				freq: "YEARLY",
				until: "2030-09-30T00:00:00+09:00",
			},
			start: "2026-09-30T00:00:00+09:00",
			summary: "Quarterly reminder",
			wholeDay: true,
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.start.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
		expect(passed?.recurrenceRule?.until.toISOString()).toBe(
			"2030-09-30T00:00:00.000Z"
		);
	});

	it("omits wholeDay when not provided", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-05-12T10:30:00.000Z",
			start: "2026-05-12T10:00:00.000Z",
			summary: "Timed event",
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed).not.toHaveProperty("wholeDay");
	});

	it("passes reminderBefore as a negative DISPLAY alarm and transparent as TRANSP", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-11-21T16:00:00.000Z",
			reminderBefore: "P3D",
			start: "2026-11-21T09:00:00.000Z",
			summary: "Bazaar",
			transparent: true,
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed?.alarms).toEqual([
			{ action: "DISPLAY", description: "Bazaar", trigger: "-P3D" },
		]);
		expect(passed?.customFields).toEqual({ transp: "TRANSPARENT" });
	});

	it("omits alarms and customFields when neither option is given", async () => {
		const mockClient = {
			createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
		};

		const { server, getHandler } = makeServer();
		registerCreateEvent(mockClient as unknown as CalDAVClient, server);
		const handler = getHandler();
		if (!handler) {
			throw new Error("handler not registered");
		}

		await handler({
			calendarUrl: "/f/test-calendar/",
			end: "2026-11-21T16:00:00.000Z",
			start: "2026-11-21T09:00:00.000Z",
			summary: "Plain",
		});

		const passed = mockClient.createEvent.mock.calls[0]?.[1];
		expect(passed).not.toHaveProperty("alarms");
		expect(passed).not.toHaveProperty("customFields");
	});

	describe("organizer and attendees", () => {
		async function create(extra: { organizer?: string; attendees?: string[] }) {
			const mockClient = {
				createEvent: vi.fn().mockResolvedValue({ uid: "event-123" }),
			};
			const { server, getHandler } = makeServer();
			registerCreateEvent(mockClient as unknown as CalDAVClient, server);
			const handler = getHandler();
			if (!handler) {
				throw new Error("handler not registered");
			}
			await handler({
				calendarUrl: "/f/test-calendar/",
				end: "2026-05-12T10:30:00.000Z",
				start: "2026-05-12T10:00:00.000Z",
				summary: "Meeting",
				...extra,
			});
			return mockClient.createEvent.mock.calls[0]?.[1];
		}

		it("writes organizer and attendees as mailto: custom fields", async () => {
			const passed = await create({
				attendees: ["a@example.com", "b@example.com"],
				organizer: "o@example.com",
			});
			expect(passed?.customFields).toEqual({
				attendee: ["mailto:a@example.com", "mailto:b@example.com"],
				organizer: "mailto:o@example.com",
			});
		});

		it("writes an organizer without attendees", async () => {
			const passed = await create({ organizer: "o@example.com" });
			expect(passed?.customFields).toEqual({
				organizer: "mailto:o@example.com",
			});
		});

		it("omits customFields when neither is given", async () => {
			const passed = await create({});
			expect(passed).not.toHaveProperty("customFields");
		});

		it("rejects attendees without an organizer", async () => {
			await expect(create({ attendees: ["a@example.com"] })).rejects.toThrow(
				"attendees need an organizer"
			);
		});

		it("rejects addresses that would change the ICS structure", () => {
			const schema = z.object(createEventDefinition.inputSchema);
			const base = {
				calendarUrl: "/f/test-calendar/",
				end: "2026-05-12T10:30:00.000Z",
				organizer: "o@example.com",
				start: "2026-05-12T10:00:00.000Z",
				summary: "Meeting",
			};
			expect(
				schema.safeParse({
					...base,
					attendees: ["a@b.com\r\nATTENDEE:mailto:evil@x.com"],
				}).success
			).toBe(false);
			expect(
				schema.safeParse({ ...base, organizer: "mailto:o@example.com" }).success
			).toBe(false);
			expect(
				schema.safeParse({ ...base, attendees: ["a@example.com"] }).success
			).toBe(true);
		});
	});
});
