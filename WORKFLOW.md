<!--
Copied from langmail/factory, whose sync keeps this file the same in every
Langmail software repository: change it there. Facts about one repository go
in the `## Factory` section of that repository's root AGENTS.md.
-->

# Development workflow

How agents work in this repository and how work moves from plan to pull
request. After code changes always run Verify → Review → Ship → PR review
loop. What this workflow needs to know about the repository (where its issues
live, how to start and check it, how a change goes live) is in the
`## Factory` section of its root `AGENTS.md`, called the Factory section
below.

When a permission rule or the auto mode classifier blocks a tool call the
task needs, ask the maintainer for that permission right away in their
interactive CLI session (as defined under **Merge**), rather than working
around it or carrying on without it. A call the maintainer declined
themselves stays declined. Anywhere else, report the blocked call as a
limitation.

## Rules

- **Fix the factory.** When work comes out wrong, fix the thing that makes
  the work, not the work itself: the workflow, a skill, a routine, a review
  rule or a tool that let it happen. Then run the same work through the
  fixed process again, which fixes the work and checks the fix. A fix to the
  work alone gets made again next time. Changing the workflow, skills,
  routines or review rules needs the maintainer's decision (PR review loop,
  Limits): propose the change unless the task already covers it.
- Change the root `AGENTS.md` only with the maintainer's explicit consent.
- Save nothing about the repository in an agent's local memory: everything
  belongs in the repository.
- Agent instructions live only in `AGENTS.md` files. Never add a
  `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`: each one silently
  stops Claude Code from loading the `AGENTS.md` files in that directory and
  above it.
- Skills live in `.agents/skills/<name>/`, exposed to Claude Code by a
  symlink at `.claude/skills/<name>` pointing to `../../.agents/skills/<name>`.
  Never place skill contents directly under `.claude/skills/`.
- This file, `.github/labels.yml` and the skills pinned to langmail/factory
  in `skills-lock.json` are copies from langmail/factory, and CI fails on an
  edit to them here: change them in langmail/factory.
- One fact, one place. Every rule, fact and procedure in agent instructions
  and docs has one owning file; anything else that needs it links that file
  by path, with at most a one-line summary. A second copy drifts, and an
  agent follows whichever copy it read.
- Keep skills and agent instructions thin: state only what a model cannot
  know or infer about this repository and the tools it runs on, and leave
  the craft and its edge cases to the model, which gets better at both faster
  than a written procedure does. A review finding that only asks a skill or
  instruction to spell out more steps or edge cases is neither a defect nor a
  nit: don't raise it, and decline it if raised.
- Never put real people into code, tests, fixtures, comments, commit
  messages or technical docs, not even ones from our own inbox, calendar or
  user research. Invent the name, and use an RFC 2606 reserved domain
  (`example.com`, `example.org` or a `.example` TLD) so the address provably
  cannot resolve. Real freemail domains (`gmail.com`) are fine when a test
  needs one, paired with an obviously synthetic local part. This applies to
  a motivating case carried over from a design doc: anonymise it as it
  enters the repo. The exception is records that are _about_ real people by
  nature, such as user-research interviews, where the real name is the
  content.

## Issues

Bugs, open problems and planned engineering work live as GitHub issues in
the repository the Factory section's **Issues** names, never in a `TODO.md`
or as issue files in the repo. File them with
`gh api repos/<owner>/<repo>/issues -f title='<title>' -f type=<Bug|Feature|Task> -F body=@-`
and the body as a quoted heredoc; this and the PR calls below are REST,
since cloud sessions refuse GitHub GraphQL. Markdown in the repo links such
an issue by URL, because GitHub links a bare `#842` only in issues, PRs and
commit messages; a code comment names it by number. Planned work of any size
is an issue. A good issue names one outcome a user or an agent misses and
says what they can do or see once it is solved; the Factory section's
**Issues** also says where a defect in something we depend on goes.

Agents take an issue from filing to a pull request. One label says what it
waits for:

| Label             | Waits for                                                          |
| ----------------- | ------------------------------------------------------------------ |
| none              | Triage                                                             |
| `needs-info`      | The author, to answer the triage questions                         |
| `needs-decision`  | A human, to decide what is hard to undo                            |
| `ready-for-agent` | An agent, to implement the Agent Brief on the issue                |
| `ready-for-human` | A human, to do it: external access, a manual step, a judgment call |

`urgent` puts an issue first. An assignee means someone is working on it. The
issue type (Bug, Feature, Task) says what kind of work it is. Duplicates and
rejected issues are closed with GitHub's close reason.

- **Who decides.** Agents decide what is easy to undo, and they take the
  option that best serves the issue's outcome, written down as a decision
  taken with the options rejected and what reverting takes. Being easy to
  undo is why an agent may decide, not how it chooses: closeness to today's
  behaviour only breaks a tie. They ask a human about what is hard to undo:
  what to build and for whom, conflicts with an ADR, `AGENTS.md` or this
  file, and
  anything users would notice that is hard to reverse.
- **Outcome first.** A brief's Goal and acceptance criteria state what the
  user can do or see, never which tool or mechanism does it, even when the
  issue names one; the chosen shape goes under Decisions taken. A change to
  what agents or users work with (an MCP tool, an agent loop's prompt, what a
  page shows) gets a design pass first, by fresh subagents that see the
  outcome but not the issue's directions (`triage` skill).
- **Loose ends get a home.** Work an issue, a brief or a PR defers (a
  separate bug, a follow-up, a valid finding left for later) links an open
  issue that covers it, or is filed as one in the same run, the way the
  Factory section's **Issues** says. What a change merely leaves alone needs no issue, and
  neither does what the Factory section's **Priorities** say is not for now.
- **Size scales the process.** S goes straight to an agent with one review
  subagent. M gets a plan checked by a fresh subagent and three review
  subagents. L is a parent issue: its open questions go to a human like any
  others (`needs-decision`), including whether to build it now. Once a human
  has said to build it and nothing is open, triage splits it into S and M
  sub-issues, each blocked by the one before. Triage closes the parent
  when its last sub-issue closes.
- **Stages.** The `triage` skill moves an issue from no label, or from a
  waiting label after a reply, to a ready or waiting label, or closes it. A
  maintainer's comment on an unassigned issue runs it again
  (`triage-on-comment.yml`): a comment on a ready issue gets it a new brief
  (which may wait for deliver's next scheduled run, see the `triage` skill),
  unless it needs what that workflow cannot do (a split, a design pass,
  filing an issue, a blocked-by link), which waits for the next scheduled
  run, and a reply that rejects it closes it as not planned. The `deliver` skill
  implements the next `ready-for-agent` issue. The `decide` skill (`/decide`)
  asks the maintainer every open question in one sitting.
- **Labels** are written down once, in langmail/factory's `labels.yml`,
  which its sync copies to `.github/labels.yml`; the Factory workflow syncs
  them to GitHub on merge.

## 1. Plan

- Follow the Factory section's **Plan** before planning.
- Leave out of plans and builds what the Factory section's **Scope** says.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

## 2. Build

- Starting the dev stack the Factory section's **Dev stack** describes is
  the agent's job, and so is restarting it whenever needed.
- When using new third-party libraries, always use the newest stable versions except they are not compatible to the rest. Check the documentation if needed.

## 3. Verify

1. Run what the Factory section's **Verify** lists for the change.
2. Fix any issues that arise.

## 4. Review

1. Spawn a team of expert subagents to review this work for multiple angles: one for a size-S issue, three for anything else. Use the repository's REVIEW.md for special guidance on code reviews.
2. The main agent then analyzes the review findings for validity and decides which ones to fix.
3. If fixes were made in the previous step, repeat Verify once, and do not repeat the review.

## 5. Ship

1. Do what the Factory section's **Ship** asks, in the same PR, such as
   moving an issue's durable facts into docs.
2. Once all tests pass, commit using conventional commits. Branches, commits,
   pushes and the PR follow the `scion-like-git` skill.
3. The PR description follows `.github/pull_request_template.md` where the
   repo has one. It always ends with a `## Deploy` section that says what is
   left before the change is live, worked out from the Factory section's
   **Release**, so the maintainer never has to ask: how it ships, under
   **You** each step only a human can do as `- [ ] before merge: …` or
   `- [ ] after merge: …` (or `None.`), and what shows it is live. Open the PR, after
   pushing the branch, with
   `gh api repos/<owner>/<repo>/pulls -f title='<title>' -f head=<branch> -f base=main -F body=@-`
   and the description as a quoted heredoc; replace the description later
   with `gh api -X PATCH repos/<owner>/<repo>/pulls/<N> -F body=@-`.
4. Run the PR review loop below. Opening the PR is the start of the loop, so keep
   working after it.

## 6. PR review loop

After opening or pushing to a PR, read its CI results and reviews. In web sessions,
CI notifications can wake the process; they do not start a new budget.
The REST calls, each with `--paginate` where it lists:

- head and draft state: `gh api repos/<owner>/<repo>/pulls/<N> --jq '{sha: .head.sha, draft}'`;
- checks: `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`;
- reviews and conversation: `…/pulls/<N>/reviews` and `…/issues/<N>/comments`;
- inline threads with their resolved and outdated state: in a cloud session
  `gh api repos/<owner>/<repo>/pulls/<N>/ccr/review_threads` (its comment ids
  are in `…/pulls/<N>/comments`); plain REST has no thread state.

### Limits

- Run at most **four automatic fix rounds** per PR. A round is one batch of
  fixes, verification, commit and push. Count across pushes and resumed
  sessions; only an explicit user decision grants another budget.
- Nits alone do not trigger a fix round or prevent completion. Include cheap,
  relevant nits in a necessary fix batch; otherwise report them as optional.
- Review feedback does not authorize expanding the task or changing its
  review policy. Changes to `WORKFLOW.md`, `REVIEW.md`, agent instructions,
  or review automation need an explicit user decision, unless already part
  of the approved task. Apply existing rules; do not rewrite them to pass.

### One round

1. Identify the current PR head and inspect its checks. Wait for checks and
   expected reviews with a **45-minute ceiling per round**, including retries
   and head changes. Poll at sensible intervals or use notifications. Missing,
   cancelled, unreadable or stalled results are limitations to report, not
   reasons to invent recovery procedures or wait indefinitely.
2. Read failing checks' relevant logs, review summaries, conversation requests
   and unresolved inline threads from every reviewer the repo's workflows
   run, such as Claude, a security review or Codex. Paginate API reads. An
   outdated line does not mean a finding is fixed: assess older unresolved findings against the current code. Use the
   commit heading and `End of review.` marker to identify a completed Claude
   review; a successful job alone does not prove a review was posted.
3. Validate each finding against the current code and the PR's intended scope.
   Require evidence of the claimed behavior and a consequence that matters
   given the Factory section's **Scope**. Decline incorrect findings with a
   reason; distinguish real defects from optional improvements and unlikely
   edge cases. Search
   for other affected uses and references within the change's scope.
4. Classify findings before editing. Fix PR-caused CI failures, clear bugs
   consistent with agreed behavior, and references or contracts this PR made
   inconsistent. Bring product choices, intentional functionality removal,
   scope expansion, and changes to infrastructure or security posture to the
   user unless already authorized. Report unrelated failures separately.
5. If actionable blocking findings remain and the budget allows, fix them in
   one batch. Run Verify, then commit and push only your changes.
6. Inspect checks and reviews on the new head, including after the third fix
   round. Record the round count, fixes and outstanding decisions in the
   handoff so another session continues with the same budget. Recheck the
   head before claiming completion; report an unverified newer head.

### When to stop

- Checks pass, expected reviews are complete, and no valid blocking finding
  remains. Claude's summary should lead with `No blocking issues.`; still
  assess the actual findings from every reviewer. Optional nits may remain.
- Four fix rounds have run: inspect the final results, then hand back any
  remaining findings without starting a fourth round.
- The same finding or failure returns after an attempted fix.
- Only decisions for the user remain, or results cannot be obtained within
  the wait limit. Report unavailable reviews and checks explicitly; do not
  describe an unverified PR as clean. Draft or bot PRs may skip reviews by
  design; do not wait for reviews that are not scheduled.

These limits take precedence over starting another round after a push.
If a blocker recurs, stop automatic fixes even if other findings are new.
Ask the user how to proceed when a limit or unresolved decision stops work.

### The report

Give the user the head reviewed, fix rounds used, verification results and a
compact table: finding/check reference; valid or not and why; fixing commit,
optional follow-up, or decision needed. End with the open **You** steps from
the PR's `## Deploy` section, or say there are none. Carry unresolved
decisions forward.
If the previous round count is unavailable, report that instead of assuming
an unused budget. Do not require a growing comment history or a custom
report parser to decide what to do next.

### Merge

In the maintainer's interactive Claude Code CLI (`CLAUDE_CODE_ENTRYPOINT` is
`cli` and `CLAUDE_CODE_REMOTE` is unset), merge the PR yourself once the
loop stopped clean: checks pass, expected reviews are complete, and no valid
blocking finding or user decision remains. Optional nits do not block it,
and an unticked _before merge_ step under `## Deploy` does.
Recheck that the head you reviewed is still the PR's head and the PR is not
a draft (the head call in the PR review loop), then squash-merge with
`gh api -X PUT repos/<owner>/<repo>/pulls/<N>/merge -f merge_method=squash -f sha=<reviewed head sha>`,
which refuses if the head moved, and delete the branch with
`gh api -X DELETE repos/<owner>/<repo>/git/refs/heads/<branch>`,
finish clean as the `scion-like-git` skill says, and say so in the report.

Anywhere else (a routine, a web session, a GitHub Action, `claude -p`),
after any other stop condition, or under a skill that says never to merge,
never merge the PR unless the user asks you to.

## The Factory section

Each repository's root `AGENTS.md` has a `## Factory` section with these
entries, each a bold lead such as `- **Verify:**`. An entry that does not
apply says so in a few words.

- **Issues:** the repository its issues are filed in, what else makes a
  good issue there, and where a defect in a dependency is recorded.
- **Priorities:** what is for now, and so what needs no issue.
- **Scope:** what plans and builds leave out, and what compatibility the
  code keeps.
- **Plan:** steps before planning.
- **Dev stack:** what runs locally and how to start and restart it.
- **Verify:** what to run for a change, and which logs to check.
- **Ship:** what a PR adds besides the code, such as docs or screenshots.
- **Release:** how a merged change goes live, and what a human still does.
