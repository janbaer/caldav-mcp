# caldav-mcp

<div align="center">

🗓️ A CalDAV Model Context Protocol (MCP) server to expose calendar operations as tools for AI assistants.

[![Release](https://github.com/langmail/caldav-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/langmail/caldav-mcp/actions/workflows/release.yml)
[![npm version](https://badge.fury.io/js/caldav-mcp.svg)](https://www.npmjs.com/package/caldav-mcp)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![code style: biome](https://img.shields.io/badge/code_style-biome-60a5fa.svg?style=flat-square&logo=biome)](https://biomejs.dev)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)
[![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)

Maintained by the team behind Langmail. Want mail, calendar and contacts for your agent over one hosted MCP, with OAuth and nothing to run? → [langmail.me](https://langmail.me/?ref=caldav-mcp)

Using caldav-mcp? [Tell us how in three minutes](https://tally.so/r/GepQM2?source=readme).

</div>

## ✨ Features

- Connect to CalDAV servers
- List calendars
- List calendar events within a specific timeframe
- Create calendar events
- Update calendar events
- Delete calendar events by UID
- List tasks (VTODOs), open ones by default or filtered by status
- Create and update tasks, with optional due and start dates
- Mark tasks as completed
- Delete tasks by UID

## Setup

```
{
  "mcpServers": {
    ...,
    "calendar": {
      "command": "npx",
      "args": [
        "caldav-mcp"
      ],
      "env": {
        "CALDAV_BASE_URL": "<CalDAV server URL>",
        "CALDAV_USERNAME": "<CalDAV username>",
        "CALDAV_PASSWORD": "<CalDAV password>"
      }
    }
  }
}
```

## Development

### Quick Start

Run the MCP server in development mode with auto-reload:

```bash
npm run dev
```

This will run the TypeScript code directly with watch mode and automatically load environment variables from `.env`.

### Manual Build

Alternatively, you can compile TypeScript to JavaScript and run it:

1. Compile:
```bash
npx tsc
```

2. Run:
```bash
node dist/index.js
```

## Transports

The server supports two transports, selected at startup:

- **stdio** (default): JSON-RPC over stdin/stdout, suitable for the standard MCP client configuration shown in [Setup](#setup).

  ```bash
  npx caldav-mcp
  ```
- **Streamable HTTP** (`--http`): runs as a long-lived server that remote MCP clients connect to at `POST /mcp`. Each request is handled statelessly, and `GET /health` answers `ok` for health checks.

  ```bash
  MCP_AUTH_TOKEN=your-shared-secret npx caldav-mcp --http
  ```

  | Env var          | Default             | Description                                                                                                                                  |
  | ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | `MCP_HOST`       | `127.0.0.1`         | Bind address. Set to `0.0.0.0` to listen on all interfaces.                                                                                  |
  | `MCP_PORT`       | `PORT`, else `3000` | TCP port to bind. Falls back to `PORT`, which platforms like Cloud Run set.                                                                  |
  | `MCP_AUTH_TOKEN` | _(unset)_           | When set, requests must send `Authorization: Bearer <MCP_AUTH_TOKEN>`; others get `401`. Required when `MCP_HOST` is not a loopback address. |

  Connect a client, for example Claude Code (`.mcp.json`):

  ```json
  {
    "mcpServers": {
      "calendar": {
        "type": "http",
        "url": "http://127.0.0.1:3000/mcp",
        "headers": { "Authorization": "Bearer your-shared-secret" }
      }
    }
  }
  ```

  Security notes:
  - One server process serves one CalDAV account. Anyone with the token can read and change that calendar.
  - The server speaks plain HTTP. For remote access, put it behind a reverse proxy that terminates TLS.
  - Requests with an `Origin` header are rejected and there is no CORS support, so browser-based clients can't connect directly.
  - When bound to loopback, only `localhost`/`127.0.0.1`/`[::1]` Host headers are accepted, which blocks DNS rebinding.

## Docker

A container image is available for running the server with the Streamable HTTP transport — useful when hosting the MCP server as a long-running container that remote MCP clients connect to over HTTP, rather than spawning the binary locally via stdio.

Each release publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to the GitHub Container Registry, tagged with its full, minor and major version (for example `1.2.3`, `1.2`, `1`) and `latest`:

```bash
docker run --rm -p 3000:3000 \
  -e CALDAV_BASE_URL=https://your-caldav-server.com/dav \
  -e CALDAV_USERNAME=your-username \
  -e CALDAV_PASSWORD=your-password \
  -e MCP_AUTH_TOKEN=your-shared-secret \
  ghcr.io/langmail/caldav-mcp
```

To build the image yourself instead, run `docker build -t caldav-mcp .` and use `caldav-mcp` as the image name.

The image binds to `0.0.0.0:3000` (or the port in `MCP_PORT`/`PORT`), serves `POST /mcp`, and reports its health from `GET /health`. Because it listens on all interfaces, `MCP_AUTH_TOKEN` is required: without it the container exits at startup (see [Transports](#transports)). The container is not needed for the default stdio setup in [Setup](#setup) above.

## Available Tools

<!-- TOOLS:START - generated by scripts/gen-tool-docs.ts -->
### list-calendars

List all calendars returning both name and absolute URL. Pass a calendar's `url` unchanged as `calendarUrl` to the other tools.

Parameters: none

Returns:

- List of all available calendars

### list-events

List all events between start and end date in the calendar specified by its URL

Parameters:

- `calendarUrl`: string
- `end`: string — End date (ISO 8601)
- `start`: string — Start date (ISO 8601)

Returns:

- A list of events that fall within the given timeframe, each containing `uid`, `summary`, `start`, `end`, and optionally `description`, `location`, `organizer` (email), `attendees` (emails), `alarms` (each with `action` and `trigger`, e.g. `-PT30M`) and `transparent` (true when the event is marked free)

### create-event

Creates an event in the calendar specified by its URL. For all-day events, set `wholeDay` to true. For a single-day all-day event, use `start` and `end` datetimes on the same calendar date; they do not need to be identical timestamps.

Parameters:

- `calendarUrl`: string
- `description`: string (optional)
- `end`: string — End datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `location`: string (optional)
- `organizer`: string (optional) — Organizer email (no mailto:), written as ORGANIZER; a scheduling-capable server (e.g. Radicale with the email/iMIP hook) uses it to send invitations, updates and cancellations to the attendees.
- `recurrenceRule`: object (optional)
  - `byday`: array of string (optional)
  - `bymonth`: array of number (optional)
  - `bymonthday`: array of number (optional)
  - `count`: number (optional)
  - `freq`: enum (`DAILY` | `WEEKLY` | `MONTHLY` | `YEARLY`) (optional)
  - `interval`: number (optional)
  - `until`: string (optional) — Last occurrence at or before this datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `reminderBefore`: string (optional) — Display reminder before the event start, as ISO 8601 duration in weeks, days, hours, minutes or seconds (e.g. P3D, PT30M)
- `start`: string — Start datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `attendees`: array of string (optional) — Attendee emails (no mailto:), written as ATTENDEE lines; a scheduling-capable server mails them the invitation. Requires organizer.
- `summary`: string
- `transparent`: boolean (optional) — Mark the event as free (true) or busy (false)
- `wholeDay`: boolean (optional) — Create as a whole-day event

Returns:

- The unique ID of the created event

### update-event

Updates an existing event in the calendar specified by its URL. Only provided fields are changed. For a one-day full-day event, set `wholeDay` to true and set `start` and `end` to the same calendar day. Any update of an event with attendees rewrites them as bare addresses, dropping their names and replies (accepted/declined).

Parameters:

- `calendarUrl`: string
- `description`: string (optional)
- `end`: string (optional) — New end datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `location`: string (optional)
- `organizer`: string (optional) — Organizer email (no mailto:); pass to set or change ORGANIZER, or an empty string to remove it (only when the event has no attendees). Omit to leave it as stored.
- `recurrenceRule`: object (optional)
  - `byday`: array of string (optional)
  - `bymonth`: array of number (optional)
  - `bymonthday`: array of number (optional)
  - `count`: number (optional)
  - `freq`: enum (`DAILY` | `WEEKLY` | `MONTHLY` | `YEARLY`) (optional)
  - `interval`: number (optional)
  - `until`: string (optional) — Last occurrence at or before this datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `reminderBefore`: string | null (optional) — Display reminder before the event start, as ISO 8601 duration in weeks, days, hours, minutes or seconds (e.g. P3D, PT30M). Replaces the event's existing display reminders; email and audio reminders are kept. Pass null to remove the display reminders.
- `start`: string (optional) — New start datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `attendees`: array of string (optional) — The complete new attendee list (no mailto:): it replaces the stored one, so get the current attendees from list-events and include everyone who should stay. An empty list removes all attendees. Omit to leave them as stored. Requires an organizer.
- `summary`: string (optional)
- `transparent`: boolean | null (optional) — Mark the event as free (true) or busy (false). Pass null to clear the free/busy status.
- `uid`: string — Unique identifier of the event to update (obtained from list-events)
- `wholeDay`: boolean (optional) — Update whether this is a whole-day event

Returns:

- The unique ID of the updated event

### delete-event

Deletes an event in the calendar specified by its URL

Parameters:

- `calendarUrl`: string
- `uid`: string — Unique identifier of the event to delete (obtained from list-events)

Returns:

- Confirmation message when the event is successfully deleted

### list-todos

List tasks (VTODOs) in the calendar specified by its URL. By default returns only open tasks (NEEDS-ACTION and IN-PROCESS), sorted by manual order then due date. Use `status` to include completed (`COMPLETED`) or all (`ALL`) tasks, and `limit`/`offset` to page through long lists.

Parameters:

- `calendarUrl`: string
- `due_after`: string (optional) — Only tasks with a due date at or after this; undated tasks are excluded when a due window is set (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `due_before`: string (optional) — Only tasks with a due date at or before this; undated tasks are excluded when a due window is set (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `limit`: number (optional) — Max tasks to return (default 50, max 500)
- `offset`: number (optional) — Tasks to skip (default 0)
- `status`: enum (`OPEN` | `ALL` | `NEEDS-ACTION` | `COMPLETED` | `IN-PROCESS` | `CANCELLED`) (optional) — Filter by status. `OPEN` (default) = NEEDS-ACTION + IN-PROCESS; `ALL` = everything; or an exact status (NEEDS-ACTION, COMPLETED, IN-PROCESS, CANCELLED).

Returns:

- An object `{ todos, total, limit, offset }` where `total` is the count before pagination. Each todo has `uid`, `summary`, `status`, `reminders` (when the task will notify, as ISO datetimes, or as the raw offset such as `-PT15M` for a relative reminder on a task without `start`; empty when it has none), and optionally `due`, `start`, `completed`, `description`, `location`.

### create-todo

Creates a task (VTODO) in the calendar specified by its URL. Only `summary` is required; a task may have no dates. Use `due` for a deadline and `start` for when work should begin. Use `reminderAt` when the user wants to be reminded ("remind me tomorrow at 9"); a task without it gets no reminder.

Parameters:

- `calendarUrl`: string
- `description`: string (optional)
- `due`: string (optional) — Due datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `location`: string (optional)
- `reminderAt`: string (optional) — When the user's devices should notify about the task: a clock time, not an offset from the due date. For "an hour before it's due", pass the due time minus one hour (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `start`: string (optional) — Start datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `status`: enum (`NEEDS-ACTION` | `COMPLETED` | `IN-PROCESS` | `CANCELLED`) (optional) — Defaults to NEEDS-ACTION when omitted
- `summary`: string

Returns:

- The unique ID of the created todo

### update-todo

Updates an existing task (VTODO) in the calendar specified by its URL. Only provided fields are changed. `reminderAt` replaces the task's reminders with one at that time, `null` removes all of them, and omitting it keeps them. To mark a task done, prefer the `complete-todo` tool.

Parameters:

- `calendarUrl`: string
- `description`: string (optional)
- `due`: string (optional) — New due datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `location`: string (optional)
- `reminderAt`: string | null (optional) — When the user's devices should notify about the task: a clock time, not an offset from the due date. For "an hour before it's due", pass the due time minus one hour. Replaces all existing reminders; `null` removes them; omit to keep them (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `start`: string (optional) — New start datetime (ISO 8601 with an offset, e.g. 2026-05-01T09:00:00+02:00 or 2026-05-01T07:00:00Z)
- `status`: enum (`NEEDS-ACTION` | `COMPLETED` | `IN-PROCESS` | `CANCELLED`) (optional)
- `summary`: string (optional)
- `uid`: string — Unique identifier of the todo to update (from list-todos)

Returns:

- The unique ID of the updated todo

### complete-todo

Marks a task (VTODO) as done. Sets its status to COMPLETED and records the completion time.

Parameters:

- `calendarUrl`: string
- `uid`: string — Unique identifier of the todo to complete (from list-todos)

Returns:

- The unique ID of the completed todo

### delete-todo

Deletes a task (VTODO) in the calendar specified by its URL

Parameters:

- `calendarUrl`: string
- `uid`: string — Unique identifier of the todo to delete (from list-todos)

Returns:

- Confirmation message when the todo is successfully deleted
<!-- TOOLS:END -->

## License

MIT
