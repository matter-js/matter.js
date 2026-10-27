# CLAUDE.md

Guidance for AI coding agents working with code in this repository. `AGENTS.md` is a symlink to
this file, so agents reading either name get the same instructions.

Architecture, package layout, code generation, build and test reference:
[.github/copilot-instructions.md](.github/copilot-instructions.md). This file carries the rules
that apply to every change.

## AI policy

This project follows the [Open Home Foundation AI Policy](AI_POLICY.md). Autonomous
contributions are not accepted: a human must review, understand, and be able to explain every
change before it is submitted. Do not open issues or pull requests autonomously, and do not post
comments on behalf of a user without their review.

Additionally in this repository: never submit a bug report, root-cause claim, or fix whose
justification is an analysis without the complete raw log file it is derived from.

## Before declaring work done

Run from the repository root, in this order:

```bash
npm run build        # `npm run build-clean` before opening a PR — incremental caches mask errors in dependent packages
npm run format       # rewrites files in place; `npm run format-verify` only checks
npm run lint
npm test             # `npm test -- -p packages/<name>` while iterating on one package
```

Use the project scripts, never invoke oxfmt, oxlint or the test runner directly — the scripts
pick up project configuration a direct call misses. Single tests are fine for fast iteration, but
the full suite gates completion.

If a test fails after your change, assume the change broke it. Do not fix unrelated failures
along the way; report them.

Claims of "done", "fixed" or "passing" need the command output behind them.

## Code comments

WHY, not WHAT. Add a WHAT comment only when the logic is genuinely non-obvious. Before writing
any comment, ask: would a reader who sees only the final code — not the diff — need it? If the
identifiers and JSDoc of the code at this location already say it, delete the comment. (A
callee's JSDoc does not count here; see the call-site note below.)

Fix the code before writing the comment. An inline comment is a sign that the code is not clear
on its own. The longer the comment, the stronger the sign. Before writing one, try a better name,
an extracted function, a named constant or a type. Only what is still unclear after these changes
gets a comment. An inline comment is one line, at most three for a specification constraint.
Anything longer goes into API JSDoc or becomes a code change. Most comments belong in API JSDoc,
not inline.

Acceptable, and rare:

- An invariant a future refactor could innocently break (one line, forward-looking)
- A non-obvious specification constraint the code depends on
- A documented tradeoff ("we accept X because Y is worse")
- Cross-file coupling the type system cannot express — only when the comment names a documented
  contract of the other module (JSDoc, or a test that pins the behavior). If the code relies on
  another module's internals ("safe because `foo()` internally does X"), make that behavior part
  of the contract of `foo()` or remove the dependency. A comment does not make an internal detail
  safe to rely on.
- A one-line note at a call site about a non-obvious contract of the callee ("resolves before the
  session closes"), so the reader does not have to open the callee. The callee's JSDoc is the
  source of truth; the note must match that JSDoc.

Always wrong:

- Narrating the change ("moved from A to B because…", "this used to do Y") — that belongs in the
  commit message
- Restating an `if` condition or an identifier in prose
- Pointing at structure the reader can see ("cleanup lives in the outer `finally`")
- Trivia about standard APIs
- Justifying the code by walking through rejected alternatives — state the invariant instead

Never put GitHub issue or pull request numbers or URLs in code or test comments. Describe the
case; references belong in the commit message or pull request body.

Public APIs get JSDoc, including `@see` references to the relevant Matter specification section.
JSDoc covers what a caller cannot see from the signature: units, lifetime and ownership, whether
it may be called again while it runs, from which transaction or context it may be called, error
behavior, and why the API exists. Describe a state
machine or an event matrix with a small table or ASCII diagram, not paragraphs.

Write comments and documentation in plain, literal words. Many readers are not native English
speakers. Name the actual action, not a metaphor: "start the timer", not "arm" it; "set the
flag", not "latch" it; "clear the state", not "burn" or "spend" it; "use X", not "leverage X" or
"key off X"; "which case fails", not "where it bites". Existing identifiers stay as they are. Name
the subject in each sentence; use "it" or "this" only when the noun directly before is the
referent. One idea per sentence; keep sentences short. No hype or self-praise ("robust",
"seamless", "zero overhead"); name a tradeoff only with its concrete cost.

## TypeScript

- Avoid type casts (`as any`, `as SomeType`). Use generics, type narrowing, overloads or proper
  interfaces. If a cast is genuinely unavoidable, say so in the pull request.
- No `ts-ignore` or comparable escapes — find and fix the real typing issue.
- `new Array<T>()` for empty typed arrays, not `const x: T[] = []`.
- The base configuration is `"strict": true`; consumers need at least `strictNullChecks`.

## Errors

Never throw a plain `Error`. Throw a typed `MatterError` subclass from `@matter/general`, chosen
for what actually went wrong:

- `InternalError` — cannot happen; an invariant of our own code was violated
- `ImplementationError` — the caller used the API wrongly
- `NotImplementedError`, `ConstraintError`, `CommissioningError`, … — see
  `packages/general/src/MatterError.ts` and the protocol packages for the full set

Error messages carry context, not just a symptom.

## Async

- Prefer `async`/`await` over raw promise chains.
- Never void or swallow a promise. For event-driven asynchronous work in behaviors use
  `reactTo`/`stopReacting`. If catching is genuinely unavoidable, log the error.
- Handle cancellation with `AbortSignal` where the operation can be abandoned.
- Use `using` for resource management where applicable.

## Logging

Choose levels by [docs/LOGGING.md](docs/LOGGING.md). The level reflects how the code handles the
situation, not how alarming the error looks:

- `error` — a whole feature or subsystem stays broken until someone acts. A failure contained to
  one operation is never `error`.
- `warn` — an anomaly contained to one operation that hints at a problem worth a look, such as an
  unexpected error that fails only that operation.
- `info` / `debug` — routine protocol mechanics are `debug`: status responses, BUSY, retransmits,
  a peer's value refused with a status. Each occurrence of something a peer can trigger
  repeatedly logs at `debug` or `info`, so a peer cannot flood the log. When one occurrence
  explains a symptom users see, add a single de-duplicated `notice` for it.
- Log where you handle or swallow an error, not where you throw or rethrow, and log one event
  once. Attach the error object when its stack or cause helps.

## Values and formatting

- Format durations with `Duration.format()`. Never hand-roll `/ 1000` arithmetic for display.
- Encode Matter payloads through the TLV schemas; validate all external input against a schema.

## Monorepo

- Always run `npm install` from the repository root, never from a package directory — installing
  inside a workspace breaks hoisting and produces a wrong `node_modules` layout, even when the
  `package.json` you edited lives in `packages/foo/`.
- Packages use TypeScript project references. A new cross-package dependency must be added to the
  relevant `tsconfig.json`, not only to `package.json`.
- Generated files (`/*** THIS FILE IS GENERATED, DO NOT EDIT ***/`) are never edited by hand.
  Change the generator in `support/codegen` or the model overrides in `support/models/src/local`.

## Changelog, pull request text and working documents

- User-visible changes get a `CHANGELOG.md` entry under the `## __WORK IN PROGRESS__` heading:
  state the change, keep it short, skip the rationale. That heading is matched literally by the
  release workflow — do not reformat it.
- Plans, analyses and other working documents stay uncommitted.
- Pull request descriptions explain why the change is needed and why this design was chosen. State
  what changed only as far as that explanation needs; do not list files or mechanical edits,
  because the diff shows them.
