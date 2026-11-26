# Review instructions

What matters in this repository. The review format, and what no review
reports, are in the prompt of langmail/factory's `review.yml`.

## What Important means here

Reserve Important for findings that would break behavior for an MCP
client or a calendar: incorrect logic, dates or times that land on the
wrong day or in the wrong time zone, wrong CalDAV URLs or hrefs, data
written to or deleted from the wrong event or todo, and tool names,
inputs, or outputs that change without a breaking-change commit.

## Do not report

- Anything CI already enforces: Biome lint and formatting, typechecks,
  tests, knip, and the generated README tool docs (`npm run docs:check`)

## Always check

- A tool's description and `returns` text still match what its handler does
- A new tool in `src/tools/` has a `*.test.ts` next to it
- Whole-day and time zone handling, which has regressed before
  (`src/tools/whole-day.test.ts`)
