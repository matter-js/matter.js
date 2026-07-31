# Contributing to matter.js

Want to help out? Great. matter.js is part of the [Open Home Foundation](https://www.openhomefoundation.org/).

By submitting a pull request you represent that you have the right to license your
contribution under the [Apache 2.0 license](./LICENSE) of this repository.

matter.js implements the Matter specification; it does not define it. Changes that would
require a change to the specification itself belong in the Matter working group of the
[Connectivity Standards Alliance](https://csa-iot.org/), not here.

# AI policy

This project follows the
[Open Home Foundation AI Policy](./AI_POLICY.md). In short: AI tools are
welcome as an aid, but you must fully understand and be able to explain every
change you submit. Contributions made by autonomous agents — issues, pull
requests, or comments posted without human review — are not accepted.

In particular, for this repository: an AI-produced root-cause analysis is not a
substitute for the raw log it was derived from. Attach the log.

If you work with an AI coding agent, point it at [CLAUDE.md](./CLAUDE.md)
(`AGENTS.md` is a symlink to the same file) — it carries the rules that apply to
every change, and [.github/copilot-instructions.md](./.github/copilot-instructions.md)
describes the repository layout and build system.

# Questions and discussion

For usage questions, ideas and general discussion use the
[Discussions](https://github.com/matter-js/matter.js/discussions) in this repository, or the
"Matter Integrators" [Discord server](https://discord.gg/ujmRNrhDuW). Please do not open an
issue for a question.

# Reporting bugs

Report defects through the
[issue templates](https://github.com/matter-js/matter.js/issues/new/choose).

**A report without a complete log file is not actionable.** Any description of behavior — and
especially any analysis of behavior or of log output, whether written by you or by an AI tool —
must be backed by a complete log attached as a file. Enable verbose logging
(`MATTER_LOG_LEVEL=debug` or `--log-level=debug`), reproduce the problem, then attach the
resulting log. A few quoted lines are not enough; we need the surrounding context to reproduce
your analysis.

Your own analysis and a proposed fix are welcome on top of that — the log is what lets us verify
them.

# Requesting features

Request a feature through the
[issue templates](https://github.com/matter-js/matter.js/issues/new/choose), or start with an
[Idea in Discussions](https://github.com/matter-js/matter.js/discussions/categories/ideas) if the
scope is large. Early feedback on a large feature avoids wasted work and duplicated effort. Small,
self-contained features can go straight to a pull request.

If the request comes from something matter.js currently cannot do or does wrong, attach a log
showing the current behavior.

# Development setup

matter.js uses the "fork and pull request" model. Fork the repository on GitHub, then:

```bash
# Clone your fork
git clone git@github.com:<username>/matter.js.git
cd matter.js

# Configure upstream alias
git remote add upstream git@github.com:matter-js/matter.js.git

# Install dependencies and build — always from the repository root
npm install
```

This is an npm workspaces monorepo. Never run `npm install` inside a package directory: it breaks
workspace hoisting and produces a wrong `node_modules` layout, even when the `package.json` you
changed lives in `packages/`.

See the [README](./README.md#extending-and-contributing-to-matterjs) for platform prerequisites,
and [.github/copilot-instructions.md](./.github/copilot-instructions.md) for the repository
layout, code generation and build system.

# Making a change

Create a working branch off `main`:

```bash
git branch --track <branch-name> origin/main
git checkout <branch-name>
```

Keep it current with upstream so that merging stays a fast-forward:

```bash
git checkout main
git pull upstream main

git checkout <branch-name>
git rebase main
```

Code conventions — comments, typing, error handling, async, logging — are documented in
[CLAUDE.md](./CLAUDE.md). They apply to human and AI-assisted contributions alike.

Add a `CHANGELOG.md` entry under the `## __WORK IN PROGRESS__` heading for anything user-visible.
Keep it short: state the change.

# Before opening a pull request

Run the full gate from the repository root, in this order:

```bash
npm run build-clean   # incremental caches can mask errors in dependent packages
npm run format        # rewrites files in place
npm run lint
npm run test
```

CI enforces build, formatting, linting and tests. Use these scripts rather than calling prettier,
oxlint or the test runner directly.

Tests are expected for behavior changes. If a change genuinely cannot be covered automatically,
say so in the pull request and describe how you verified it manually.

# Pull request and review

Push your branch to your fork and open the pull request against `main`:

```bash
git push origin <branch-name>
```

Fill in the pull request template completely — type of change, what it does and why, the backing
log or linked issue for a fix, and the checklist.

A maintainer (see [CODEOWNERS](./CODEOWNERS)) reviews and merges once CI is green. Note that CI
occasionally reports unrelated failures; if a job looks unrelated to your change, say so in the
pull request rather than pushing speculative fixes.

Expect to answer questions about your change in your own words.

# Documentation

Public APIs are documented with JSDoc, including `@see` references to the relevant Matter
specification sections. The API documentation is generated from it with `npm run build-doc` and
published for each release. Documentation changes go through the same review as code.
