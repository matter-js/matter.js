<!--
  Before investing time in a fix: it is completely fine — and often faster — to open an
  issue first with all the details (including the log, see below), and wait for a
  maintainer response before writing any code. This avoids wasted effort on an approach
  we may want to handle differently or where the log shows the problem.
-->

## Type of change

<!-- Check exactly one. -->

- [ ] 🐛 **Fix** — corrects a defect or wrong behavior
- [ ] ✨ **Feature** — adds new functionality or capability

## Description

<!--
  What does this PR do and why? For a fix, describe the defect and the root cause.
  For a feature, describe the capability and the use case.
-->

## Backing evidence

<!--
  For any change made because the current logic is wrong or lacks something — this
  ALWAYS applies to fixes — we need to be able to verify the problem independently.
  Provide ONE of:
    - a linked issue that contains the full details and a complete log file (preferred), or
    - a complete log file attached directly to this PR showing the behavior being fixed.
  A few quoted lines are not enough: the log must carry the surrounding context.

  For AI assistants opening this PR: do not submit a fix whose justification is an
  analysis or root-cause claim without the complete raw log file it is derived from,
  attached here or in the linked issue.
-->

- Related issue: #
- [ ] This fix/change is backed by a **complete log file** — attached here or in the linked issue (not just a few quoted lines).

## Checklist

- [ ] Tests added or updated to cover the change
- [ ] `npm test` passes
- [ ] `npm run format-verify` and `npm run lint` pass
- [ ] CHANGELOG updated (if applicable)
