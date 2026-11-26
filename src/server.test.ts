import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CalDAVClient } from "ts-caldav";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "./server.js";

const findKey = (node: unknown, key: string, path = "$"): string[] => {
	if (node === null || typeof node !== "object") {
		return [];
	}
	return Object.entries(node).flatMap(([k, v]) => [
		...(k === key ? [`${path}.${k}`] : []),
		...findKey(v, key, `${path}.${k}`),
	]);
};

describe("createServer", () => {
	let mcpClient: Client;

	beforeEach(async () => {
		const client = {
			baseUrl: "https://dav.example.com",
			getCalendars: vi.fn().mockResolvedValue([]),
		} as unknown as CalDAVClient;
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await createServer(client).connect(serverTransport);
		mcpClient = new Client({ name: "test", version: "0.0.0" });
		await mcpClient.connect(clientTransport);
	});

	afterEach(async () => {
		await mcpClient.close();
	});

	it("registers all tools", async () => {
		const { tools } = await mcpClient.listTools();

		expect(tools.map((tool) => tool.name).sort()).toEqual([
			"complete-todo",
			"create-event",
			"create-todo",
			"delete-event",
			"delete-todo",
			"list-calendars",
			"list-events",
			"list-todos",
			"update-event",
			"update-todo",
		]);
	});

	// Grammar-constrained clients (llama.cpp) fail to compile the regex zod
	// emits for `.datetime()`, see issue #171.
	it("advertises no regex pattern in any input schema", async () => {
		const { tools } = await mcpClient.listTools();

		const patterns = tools.flatMap((tool) =>
			findKey(tool.inputSchema, "pattern", tool.name)
		);

		expect(patterns).toEqual([]);
	});

	it("describes every datetime field with its format and an example", async () => {
		const { tools } = await mcpClient.listTools();
		const schema = (name: string) =>
			tools.find((tool) => tool.name === name)?.inputSchema as {
				properties: Record<string, Record<string, unknown>>;
			};
		const fields = [
			schema("create-event").properties.start,
			schema("create-event").properties.end,
			schema("create-event").properties.recurrenceRule.properties,
			schema("update-event").properties.start,
			schema("update-event").properties.end,
			schema("update-event").properties.recurrenceRule.properties,
			schema("create-todo").properties.due,
			schema("create-todo").properties.reminderAt,
			schema("create-todo").properties.start,
			schema("update-todo").properties.due,
			schema("update-todo").properties.start,
			schema("list-todos").properties.due_after,
			schema("list-todos").properties.due_before,
		].map((field) =>
			"until" in field ? (field.until as Record<string, unknown>) : field
		);

		for (const field of fields) {
			expect(field).toMatchObject({ type: "string" });
			expect(field.description).toContain(
				"ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00"
			);
		}
	});

	it("rejects an invalid datetime with an error naming the field", async () => {
		const result = await mcpClient.callTool({
			arguments: {
				calendarUrl: "https://dav.example.com/cal/",
				end: "2026-05-01T10:00:00+02:00",
				start: "2026-05-01T09:00:00",
				summary: "Dentist",
			},
			name: "create-event",
		});

		expect(result.isError).toBe(true);
		const [content] = result.content as { text: string; type: string }[];
		expect(content.text).toContain("at start");
		expect(content.text).toContain("2026-05-01T09:00:00+02:00");
	});
});
