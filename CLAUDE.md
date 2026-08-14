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
identifiers and JSDoc already say it, delete the comment.

Acceptable, and rare:

- An invariant a future refactor could innocently break (one line, forward-looking)
- A non-obvious specification constraint the code depends on
- A documented tradeoff ("we accept X because Y is worse")
- Cross-file coupling the type system cannot express

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

## Changelog and working documents

- User-visible changes get a `CHANGELOG.md` entry under the `## __WORK IN PROGRESS__` heading:
  state the change, keep it short, skip the rationale. That heading is matched literally by the
  release workflow — do not reformat it.
- Plans, analyses and other working documents stay uncommitted.
