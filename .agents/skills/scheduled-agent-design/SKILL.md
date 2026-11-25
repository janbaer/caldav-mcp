---
name: scheduled-agent-design
description: >-
  Use when creating, changing or reviewing a Claude Code routine (a scheduled
  or event-triggered cloud agent) for this repository, its prompt, schedule,
  model, environment or connectors, a skill a routine runs, or a file in
  `.agents/routines/`.
---

# Scheduled agent design

A Claude Code routine (a cloud scheduled or event-triggered task) runs a skill
from its repository, so what it does is versioned and reviewed like code.

- **The prompt only points at files:** `Read WORKFLOW.md, then
  .agents/skills/<name>/SKILL.md, and follow them.` The run checks out the
  repository before the agent starts, but a cloud session does not expand
  the `@WORKFLOW.md` import in `AGENTS.md`, so the prompt names it, unless a
  SessionStart hook of the repository prints it. Say "read
  the file", not "use the skill", so the run never depends on the model
  choosing to invoke it.
- **The skill holds everything else:** the logic, the limits on what it may
  write, how an event narrows the run, and notes for the cloud environment.
  Wording that lives only in the routine's prompt drifts unseen. The skill
  says what it does, never when its routine runs.
- **`.agents/routines/<routine>.yml` records each routine** of the
  repository: its id, name, prompt, repository, sources, environment, model,
  schedule, triggers, tools, connectors, auto-fix and notifications, in the
  API's own terms where it has one. They are set in claude.ai, and the file
  mirrors them: change both together, and when you create a routine, add
  the file. Read the values back with `RemoteTrigger get`. It does not
  return GitHub event triggers, so write those down from the routine's page.
  Small drift between the file and claude.ai is acceptable, and nothing
  checks it. The file may be public: it never holds a token or a secret.
- **The name starts with the repository:** `<owner>/<name>: <what it does>`,
  such as `octo/app: Issue triage`. The routine list in claude.ai holds
  routines for every repository, and the name is what tells them apart.
- **Only this repository's routines:** a request to create, change or review
  routines covers the ones whose repository is this one. Leave routines for
  other repositories alone unless the maintainer names them.
- **A public repository's routines read text written by strangers,** so they
  get no connectors, an environment without production secrets, and their
  own repository as the only source.
- **A change only to `.agents/routines/` goes straight to `main`** in the
  maintainer's interactive Claude Code CLI (`CLAUDE_CODE_ENTRYPOINT` is
  `cli` and `CLAUDE_CODE_REMOTE` is unset). Once the change is live in
  claude.ai (read it back with `RemoteTrigger get`, or from the routine's
  page for a GitHub event trigger), the files only record it, so they skip
  the review and pull request in `WORKFLOW.md`. Commit them on their own,
  push with `git push origin <branch>:main`, and finish clean as
  `scion-like-git` says. Where the repository's rules refuse a direct push,
  take the usual pull request. Anywhere else, and for a change that also
  touches a skill or anything else, take the usual pull request.
- **Cloud sessions have no GitHub GraphQL.** A routine's session refuses it
  with `HTTP 403: GitHub GraphQL is not available from Claude Code
  sessions`, so `gh issue`, `gh pr` and `gh search` fail, and the GitHub MCP
  `search_*` tools are absent. `gh api` on REST endpoints works, search
  included (`gh api -X GET search/issues -f q='…'`). A skill a routine reads
  therefore writes each GitHub step as the exact `gh api` call that does it,
  at the step. The same calls work in a local CLI.
- **Auto-fix pull requests** is on for every routine of a private
  repository: Claude watches CI and review comments on the PRs a routine
  opens and pushes fixes. Those fixes follow the PR review loop in
  `WORKFLOW.md`, its limits included. Turn it on when you create a routine
  (`autofix_on_pr_create` in the API). In a public repository anyone can
  comment on those PRs, so it stays off there.
