---
name: decide
description: >-
  Use when the maintainer wants to answer the open questions on this
  repository's issues in one sitting — `needs-decision` issues, and `needs-info` issues they
  wrote themselves.
disable-model-invocation: true
---

# Decide

Agents draft and decide what is easy to undo. This skill asks the maintainer
everything else in one sitting, instead of one conversation per issue.

## Steps

1. **Collect.** Open issues labelled `needs-decision`, and `needs-info` issues
   the maintainer wrote (`gh api user -q .login`), in the repository the
   Factory section's **Issues** names (`WORKFLOW.md`, The Factory section). From each, take the questions
   of the latest comment ending with `<!-- agent: triage -->` or
   `<!-- agent: deliver -->` that no later reply answered. What counts as a
   reply is defined in `.agents/skills/triage/SKILL.md`, section Comments.
2. **Ask** with AskUserQuestion, four questions per call, oldest issue first.
   Open each issue in the maintainer's browser (`gh browse <N> --repo <owner>/<name>`)
   before the first question about it, in a dialog or in plain text, because
   the dialog covers the conversation and the options refer to the issue's
   comments. Where no browser opens (a web session), list the issue URLs
   above the question instead.
   The header is `#<N>`, and the question names the issue in a few words. The
   options are the recommended one first, marked "(Recommended)", then the
   others in the agent's order, then "Leave open". A question without
   options, a fact only the maintainer knows, is asked in plain text after the
   dialog rounds.
3. **Post** the answers on each issue in one comment. Leave out questions left
   open:

   ```markdown
   **Answers:**
   1. <the question, shortened>: <the answer>

   _Answered by <login> in the decide skill._
   <!-- decide -->
   ```

4. **Re-triage** every issue that got answers: read
   `.agents/skills/triage/SKILL.md` and follow it for those issues.
5. **Show what else waits:** `ready-for-human` issues with the reason from
   their brief, `needs-info` issues waiting on someone else, and assigned
   issues that no open PR closes, which may be a deliver run that died.

## Rules

- Every answer comes from the maintainer in this session. Never fill one in.
- Ask the question as the agent wrote it. Its recommendation stays first, even
  when you would pick another.
- "Leave open" changes nothing on the issue.
