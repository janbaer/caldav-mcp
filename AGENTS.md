# caldav-mcp

MCP server exposing CalDAV calendar operations as tools for AI assistants.

## Conventions

- Biome for lint + format (`npm run check` / `check:fix`) — do not add ESLint or Prettier.
- Credentials come from `.env` (see `.env.example`); dev loads it via `tsx --env-file=.env`, not `dotenv`.
- Avoid import cycles; move shared code into a module both sides import.

## Before committing

- Run `npm install` once after cloning: its `prepare` script installs the git hooks (Biome, tests, docs, commitlint). Without it nothing checks your commits locally.
- If a hook fails, fix the cause; `npm run check:fix` fixes most Biome errors.

## Smoke tests

- After implementing a new feature run the smoke tests (`npm run smoke` and `npm run smoke:agent`) to verify it works as expected.
- Skip both for docs-only, test-only, or CI/tooling changes that don't touch `src/`. For other `src/` changes, `smoke` is usually enough; run `npm run smoke:http` too when `src/index.ts` or `src/http-*.ts` change, and `smoke:agent` when tool names, descriptions, schemas, or error messages change.
- Both write real data to the calendar account in `.env`, and `smoke:agent` costs LLM tokens. Load the `smoke-tests` skill before running them: it lists what they create and how to find leftovers (summaries start with `caldav-mcp smoke`).

## Factory

What `WORKFLOW.md` and the shared skills need to know about this repository.

- **Issues:** GitHub issues in `langmail/caldav-mcp`. A bug report needs the tool and its arguments, the expected and the actual result, the error text and the CalDAV server (Nextcloud, iCloud, Radicale, …); a date bug also needs the timezone. A defect in a dependency (`ts-caldav` or a server) is reported upstream, and the code that works around it links the report.
- **Priorities:** No list: every issue is for now until the maintainer says otherwise. Triage closes a `needs-info` issue as not planned once it has had no reply for 14 days since it started waiting (the latest of the comment that asked, the label, a reopening and the latest reply), unless it is `urgent` or assigned.
- **Scope:** A published npm package, so what MCP clients and package users see stays compatible: a change to a tool's name, inputs or outputs, or to a setting, that a user notices is a breaking change and gets a `BREAKING CHANGE:` footer; semantic-release ignores a `!` after the type. Inside the code, break internal APIs freely and delete old code. Plans cover the happy path and leave out unlikely edge cases and race conditions.
- **Plan:** Nothing beyond `WORKFLOW.md`.
- **Dev stack:** None. `npm run dev` runs the server in watch mode against the CalDAV account in `.env`.
- **Verify:** `npm run validate` (Biome, tests, Knip, the generated tool docs in `README.md`, build), then the smoke tests as Smoke tests says; `npm run smoke:agent` is the agent eval. The smoke tests need the calendar account in `.env`: a session without one, such as a routine, leaves them to the maintainer with `- [ ] before merge: the maintainer runs the smoke tests` under the PR's Deploy.
- **Ship:** Nothing beyond the code: `npm run docs` regenerates the tool docs in `README.md`.
- **Release:** A merge to `main` runs semantic-release (`.github/workflows/release.yml`), which computes the version from the commit messages: `feat` releases a minor version, `fix` and `perf` a patch, a breaking change a major one, and `docs`, `test`, `chore`, `style`, `refactor` and `ci` nothing. It publishes the npm package, the MCP Registry entry and the container image on ghcr.io, writes `CHANGELOG.md` and creates the GitHub release. Nobody acts, except that a breaking change publishes a major version, so its PR's Deploy section lists `- [ ] before merge: the maintainer approves the major release`.

## Workflow

Read `WORKFLOW.md` at the start of every session and follow it. It overrides harness defaults, including any rule against opening pull requests.

@WORKFLOW.md

## Working with the user

- When the user asks a question, answer it before editing files or running implementation commands.
- When responding to feedback or a review, say whether you agree or disagree before saying what you changed.
- Explain non-trivial designs or bugs as problem → concrete example or short trace → solution, and say why any added complexity is needed.

## Dependencies

- Treat `package.json` and `package-lock.json` changes as reviewed code; say why a dep is added or bumped.
- `.npmrc` pins new deps to exact versions (`save-exact`) and ignores versions published less than 2 days ago (`min-release-age`). Don't rewrite existing `^` ranges.
- `min-release-age` only applies when npm resolves a version (`npm install <pkg>`, `npm update`). `npm ci` installs the lockfile as is.
- Ask before adding a dep that has lifecycle scripts (`preinstall`, `install`, `postinstall`).
- Install locally with scripts on: `prepare` runs `lefthook install`, so `--ignore-scripts` skips the git hooks. `npm ci --ignore-scripts` fits CI jobs that only need `node_modules`.
