#!/usr/bin/env tsx
// Agent eval for task reminders: drives the server through `claude -p` with
// the requests a user makes ("remind me tomorrow at 9", "make it 10", "don't
// remind me anymore", and a near miss that must not set a reminder), then
// checks the tool calls the agent made and what the server stored.
//
// SMOKE_SERVER picks the server to test (default `dist/index.js`), so the
// same eval runs against a build of `main`. Prints one `result:` line.
// Deletes every task it saw created, whatever the outcome.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TOOL_PREFIX = "mcp__caldav__";
const server = process.env.SMOKE_SERVER ?? "dist/index.js";

interface Call {
	input: Record<string, unknown>;
	name: string;
	output?: string;
}

interface Turn {
	calls: Call[];
	error?: string;
}

function env(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing env var: ${name}`);
	}
	return value;
}

function serverEnv(): Record<string, string> {
	return {
		CALDAV_BASE_URL: env("CALDAV_BASE_URL"),
		CALDAV_PASSWORD: env("CALDAV_PASSWORD"),
		CALDAV_USERNAME: env("CALDAV_USERNAME"),
		PATH: process.env.PATH ?? "",
		...(process.env.TZ && { TZ: process.env.TZ }),
	};
}

const mcpConfig = JSON.stringify({
	mcpServers: {
		caldav: {
			args: [server],
			command: "node",
			env: serverEnv(),
			type: "stdio",
		},
	},
});

function resultText(content: unknown): string {
	return Array.isArray(content)
		? content.map((c: { text?: string }) => c.text ?? "").join("")
		: String(content);
}

/** The caldav tool calls and the error, if any, in `claude -p` stream-json. */
function parseStream(out: string): Turn {
	const calls = new Map<string, Call>();
	let failure: string | undefined;
	for (const line of out.split("\n").filter((l) => l.trim())) {
		const msg = JSON.parse(line);
		if (msg.type === "result" && msg.is_error) {
			failure = String(msg.result);
		}
		for (const part of msg.message?.content ?? []) {
			if (part.type === "tool_use" && part.name.startsWith(TOOL_PREFIX)) {
				calls.set(part.id, {
					input: part.input,
					name: part.name.slice(TOOL_PREFIX.length),
				});
			}
			const call = calls.get(part.tool_use_id);
			if (part.type === "tool_result" && call) {
				const text = resultText(part.content);
				call.output = part.is_error ? `error: ${text}` : text;
			}
		}
	}
	return { calls: [...calls.values()], ...(failure && { error: failure }) };
}

/** One user message; the first of a session passes `fresh`. */
function ask(prompt: string, sessionId: string, fresh: boolean): Turn {
	try {
		const out = execFileSync(
			"claude",
			[
				"-p",
				prompt,
				fresh ? "--session-id" : "--resume",
				sessionId,
				"--mcp-config",
				mcpConfig,
				"--strict-mcp-config",
				"--allowedTools",
				`${TOOL_PREFIX}*`,
				"--output-format",
				"stream-json",
				"--verbose",
			],
			{
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		return parseStream(out);
	} catch (error) {
		// Keep the calls made before the failure, so cleanup sees their tasks.
		const { status, stderr, stdout } = error as {
			status?: number;
			stderr?: string;
			stdout?: string;
		};
		let partial: Turn = { calls: [] };
		try {
			partial = parseStream(stdout ?? "");
		} catch {
			// A line cut off mid-write; the calls before it are lost.
		}
		return {
			calls: partial.calls,
			error: `exit ${status}: ${stderr ?? ""} ${(stdout ?? "").slice(-1500)}`,
		};
	}
}

/** Tomorrow at `hour` o'clock in this process's time zone. */
function tomorrowAt(hour: number): number {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(hour, 0, 0, 0);
	return d.getTime();
}

const writes = (turn: Turn) =>
	turn.calls.filter((c) => !c.name.startsWith("list-"));

async function main() {
	const failures: string[] = [];
	const created = new Map<string, string>(); // uid → calendarUrl
	const callCounts: number[] = [];

	const client = new Client({ name: "smoke-agent-reminder", version: "0" });
	await client.connect(
		new StdioClientTransport({
			args: [server],
			command: "node",
			env: serverEnv(),
			stderr: "inherit",
		})
	);

	const record = (turn: Turn) => {
		callCounts.push(turn.calls.length);
		for (const c of turn.calls) {
			if (
				c.name === "create-todo" &&
				c.output &&
				!c.output.startsWith("error")
			) {
				created.set(c.output.trim(), String(c.input.calendarUrl));
			}
		}
		if (turn.error) {
			failures.push(`agent error: ${turn.error}`);
		}
	};

	const reminders = async (uid: string): Promise<number[] | undefined> => {
		const calendarUrl = created.get(uid) as string;
		const result = (await client.callTool({
			arguments: { calendarUrl, status: "ALL" },
			name: "list-todos",
		})) as { content: Array<{ text: string }> };
		const listed = JSON.parse(result.content[0]?.text ?? "{}") as {
			// `main` has no `reminders`: a task without them has none.
			todos: Array<{ uid: string; reminders?: string[] }>;
		};
		const todo = listed.todos.find((t) => t.uid === uid);
		return todo && (todo.reminders ?? []).map((r) => new Date(r).getTime());
	};

	const expectReminders = async (
		uid: string,
		expected: number[],
		step: string
	) => {
		const actual = await reminders(uid);
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			failures.push(
				`${step}: stored reminders ${JSON.stringify(actual?.map((t) => new Date(t).toISOString()))}, expected ${JSON.stringify(expected.map((t) => new Date(t).toISOString()))}`
			);
		}
	};

	try {
		const session = randomUUID();
		const first = ask(
			"Remind me tomorrow at 9 to call the plumber (caldav-mcp smoke). Use the first calendar that holds tasks.",
			session,
			true
		);
		record(first);
		const creates = writes(first).filter((c) => c.name === "create-todo");
		const [uid] = created.keys();
		if (creates.length !== 1 || writes(first).length !== 1 || !uid) {
			failures.push(
				`remind at 9: expected one create-todo, got ${JSON.stringify(writes(first).map((c) => c.name))}`
			);
		} else {
			await expectReminders(uid, [tomorrowAt(9)], "remind at 9");

			const second = ask("Make it 10 instead", session, false);
			record(second);
			await expectReminders(uid, [tomorrowAt(10)], "make it 10");

			const third = ask("Don't remind me about it anymore", session, false);
			record(third);
			if (third.calls.some((c) => c.name === "delete-todo")) {
				failures.push("stop reminding: the agent deleted the task");
			} else {
				await expectReminders(uid, [], "stop reminding");
			}
		}

		const nearMiss = ask(
			"Add a task to call the plumber by Friday (caldav-mcp smoke). Use the first calendar that holds tasks.",
			randomUUID(),
			true
		);
		record(nearMiss);
		const nearCreate = nearMiss.calls.find((c) => c.name === "create-todo");
		if (!nearCreate?.input.due || "reminderAt" in nearCreate.input) {
			failures.push(
				`by Friday: expected create-todo with due and no reminderAt, got ${JSON.stringify(nearCreate?.input)}`
			);
		}
	} finally {
		await Promise.allSettled(
			[...created].map(([uid, calendarUrl]) =>
				client.callTool({
					arguments: { calendarUrl, uid },
					name: "delete-todo",
				})
			)
		);
		await client.close();
	}

	for (const f of failures) {
		console.log(`✗ ${f}`);
	}
	console.log(
		`result: ${failures.length ? "fail" : "pass"} server=${server} calls=${JSON.stringify(callCounts)}`
	);
	process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
	console.log(`result: error ${String(error)}`);
	process.exitCode = 1;
});
