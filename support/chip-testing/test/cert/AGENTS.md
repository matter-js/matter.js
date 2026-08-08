# Authoring cert tests in this directory

Guidance for whoever (human or agent) writes the next `TC-*.test.ts` here. Update this file in the
same commit as the test case that produced the insight — see
`.superpowers/sdd/2026-08-05-cert-controller-test-automation/plan-constraints-and-api-ref.md`. Log
every test-plan-document discrepancy you find (wrong field type, unmatchable log quote, an
unimplementable step, …) in `TESTPLAN-FEEDBACK.md`, same commit, same discipline — see that file's
own header for the entry shape.

## What a cert test is, and where the worked examples live

A `TC-*.test.ts` here drives one certification test plan's steps against matter.js acting as
**controller** (DUT), with a `CertDevice` (a real `chip-<app>-app` or a matter.js `TestInstance`) as
the **TH** it's proving interop against — the reverse of this package's other test kinds
(`test/app-fast`, `test/core`, …), which drive chip-tool/python against matter.js acting as
**device**. Four pilots exist; each is the reference example for a different mechanic, not just
another TC:

- **`TC-SMOKE-0.0`** (`smoke.test.ts`) — the minimal shape: one device, one controller, a response
  check and a device-log check, plus the evidence-writing test right after it. Start here before
  reading anything else.
- **`TC-IDM-2.1`** (all-clusters) — single-controller/single-device read requests: wildcard vs.
  concrete `AttributePathIB` reads, line-adjacency log matching, the adoc→YAML→regex source-lookup
  flow. See "Translating a real test plan" and "Wildcard path idioms" below.
- **`TC-ACT-3.2`** (bridge) — invoking commands (not just reading), a device-flavor capability gap
  (`flavors` option) for a cluster matterjs's test app doesn't have, and tolerating an
  implementation-specific non-success response as valid evidence rather than a step failure. See
  "Declaring a device-flavor capability gap" and "Invoke-only TCs" below.
- **`TC-CADMIN-1.17`** (all-clusters) — multiple controllers against one device, pairing-code
  (rather than passcode/discriminator) commissioning, non-fabric-filtered reads, and a bounded
  "this must fail" check. See "Multi-controller wiring" and "Bounded negative checks" below.
- **`TC-SC-3.5`** (python-wrapped, currently live-blocked) — a script that drives its own scenario
  and only needs a human-in-the-loop (here, an automated `PromptHandler`) to react to prompts; not
  built on `certTest()` at all. See "Python-wrapped mode" below. Read this one last — it is the
  exception to almost everything above it.

Each pilot's own section further down is written chronologically (what was found while building
that TC), which is also a reasonable reading order: source lookup → single-device reads → invoking
commands → multi-controller → the python-wrapped escape hatch.

## App → chip binary mapping

`certTest()`'s `app` option (and `devices`' per-role app names) is the string chip's own example
app binaries are named after: the flavor layer spawns/pulls `chip-<app>-app` (`chip-app-subject.ts`)
or looks up a `registerMatterJsCertSubject(<app>, ...)` registration
(`support/chip-testing/src/cert/index.ts`) for the matterjs flavor. Map a new TC's plan-doc prefix
to an app this way:

| TC prefix (examples)              | app          | chip binary               | matterjs registered today? |
| ---------------------------------- | ------------ | -------------------------- | --------------------------- |
| `IDM`, `CADMIN`, most generic/core  | `all-clusters` | `chip-all-clusters-app`   | yes (`AllClustersTestInstance`) |
| `ACT`                               | `bridge`     | `chip-bridge-app`          | yes (`BridgeTestInstance`) |
| Media Playback/App-cluster TCs      | `tv`         | `chip-tv-app`               | no — `TvTestInstance` exists but isn't wired into `registerMatterJsCertSubject` yet |
| `DRLK`                              | `lock`       | `chip-lock-app`             | no — no matterjs lock `TestInstance` exists in this package yet |
| `WEBRTCR`                           | `camera`     | `chip-camera-app`           | no — no matterjs camera `TestInstance` exists in this package yet |
| `SU`, `BDX`                         | `ota-provider` / `ota-requestor` | `chip-ota-provider-app` / `chip-ota-requestor-app` | no — no matterjs OTA provider/requestor `TestInstance` in this package yet |

The three "no" rows aren't blocked on chip-local/chip-docker — those flavors only need the binary to
exist (verify with `MATTER_CERT_APP_DIR`/an app-specific image), same as any pilot. They're blocked
on **matterjs** only: either restrict every step to `flavors: ["chip-local", "chip-docker"]` (see
"Declaring a device-flavor capability gap" below) so the TC still registers and runs on the flavors
it can, or add the missing `TestInstance` + `registerMatterJsCertSubject(...)` call first if
matterjs coverage is actually wanted. Skipping the registration entirely is not an option: every
`app` any cert TC's `certTest()` names must have a `registerMatterJsCertSubject` entry, even one
whose matterjs implementation is capability-incomplete for that TC, or the whole
`test/cert/**/*.test.ts` file set throws at load time under the matterjs flavor (see "Declaring a
device-flavor capability gap").

## Flavor policy: chip is the pass/fail bar, matterjs is optional

Three flavors exist (`DeviceFlavor` in `cert-context.ts`): `chip-local`, `chip-docker`, `matterjs`.
The convention this series has followed, worth stating explicitly for the next TC:

- **At least one chip flavor (`chip-local` or `chip-docker`) passing is the actual certification
  claim.** A cert TC exists to prove matter.js's controller interoperates with the reference chip
  implementation — a chip flavor is what any TC here is ultimately for. `chip-docker` is currently
  non-functional end-to-end (see the root `README.md`'s cert section for why); `chip-local` is the
  practical way to get real chip-side evidence today, and satisfies the "at least one chip flavor"
  bar every pilot so far has used.
- **`matterjs` is the fast, no-Docker, no-binary dev loop, not a certification claim on its own.**
  It's what you run while iterating on a TC's step logic before touching Docker/a real binary at
  all, and it's also useful for confirming matter.js's own controller-side response shape
  independent of chip's TH-side implementation quirks. But a TC that only ever runs green on
  `matterjs` and skips or has never been tried against a chip flavor hasn't actually demonstrated
  interop with anything.
- **Every device-log check should supply a `chip:`-flavored pattern; a `matterjs:` pattern is a
  bonus, not a requirement.** matter.js's own logger has no equivalent of chip's structured
  `CHIP:DMG:` decode dumps, so a log check with no matterjs pattern resolves `"unverified"` under
  that flavor — by design, not a gap to fix (see "Evidence expectations" below). What actually
  proves controller behavior on `matterjs` is the accompanying `type: "response"` check.
- Use `CertStepOptions.flavors` (see "Declaring a device-flavor capability gap") when a TH app
  genuinely lacks a capability on one flavor — not as a way to avoid running a TC against chip at
  all.

## PICS handling

Two independent PICS mechanisms exist, and only one of them is live against today's flavors:

- **`certTest()`'s own `pics: string[]` option** becomes the whole TC's `TestDescriptor.pics` (AND-
  joined). This is what a CLI-level `--pics=<file>` run would filter whole test *files* on
  (`chip.ts`'s `.include()`), mirroring the existing py/yaml harness's own top-level PICS gate — no
  current cert pilot run has exercised this path with a real filter file, so treat it as
  transcription for the record (matching the plan doc's own PICS list for the TC) rather than a
  verified-live gate.
- **Per-step `pics: "<expression>"`** (`CertStepOptions.pics`, e.g. `"ACT.C.C0x.Tx"`) is evaluated
  against `subject.pics` (a `PicsFile`, via `PicsExpression.evaluate`) once per run, before that
  step executes (`cert-test.ts`'s `stepPicsMet`). A step whose PICS expression evaluates false is
  recorded `"skipped"` with a reason, same treatment a `flavors` mismatch gets.
- **On `chip-local`/`chip-docker`, per-step PICS is inert.** `ChipLocalDevice.pics`/
  `ChipDockerDevice.pics` both throw ("No active PICS file for this device" —
  `chip-app-subject.ts`); `resolvePicsFile` catches that and returns `undefined`, and `stepPicsMet`
  treats "no PICS file available" as "met" unconditionally. Every per-step `pics` value transcribed
  from a plan onto a chip-flavor TC today documents intent for a future reader, not a live gate — see
  `TC-IDM-2.1`/`TC-ACT-3.2`'s own notes below for the concrete case.
- **On `matterjs`, a real `PicsFile` is available** (the underlying `NodeTestInstance`/
  `GenericTestApp`'s own `pics` getter, the same ci-pics-values mechanism the py/yaml harness uses),
  so per-step PICS *is* live under that flavor. If a step's expected outcome genuinely depends on a
  PICS-gated capability, verify the behavior under `matterjs` at least once to confirm the gate
  actually does something, rather than assuming it's decorative everywhere just because it is on
  chip.

## Evidence expectations

Every run writes one `result.json` (`EvidenceRecorder.flush`, shape: `RunRecord` in `evidence.ts`)
plus one `<name>.log` per `attachLog` call (`device-<role>.log`, `controller-<name>.log`) to
`${MATTER_CERT_EVIDENCE_DIR}/<timestamp>-<tc>/`. A step's own evidence lives in `RunRecord.steps[]`
as `{ step, text, expected, checks: CheckRecord[], verdict, skipReason? }`; `CheckRecord` is
`{ type: "response" | "device-log" | "network", verdict: "pass" | "fail" | "unverified", detail?,
pattern?, matched?, logLine? }`.

What a check's `type` should be:

- **`"response"`** — the controller-observed outcome (an attribute value, an invoke status, a
  read/write success or rejection). This is the check that actually proves matter.js's controller
  behavior; it should be present on essentially every step and should resolve `"pass"`/`"fail"`, not
  `"unverified"`, on every flavor including `matterjs`.
- **`"device-log"`** — a pattern match against the TH's own stdout (via `LogFollower.expect`,
  usually wrapped so a timeout/close error becomes a recorded `"fail"` rather than propagating
  uncaught — see `TC-ACT-3.2`'s `recordInvokeStatus`/adversarial-review fix below for why an
  uncaught log-check error is a real evidence gap, not just noise). `"unverified"` is the correct,
  expected verdict when only a `chip:`-flavored pattern was supplied and the run is on `matterjs`
  (see "Flavor policy" above) — don't treat every `"unverified"` in a result as a bug.
- **`"network"`** — `expectMdns`'s own check kind (mDNS record presence/absence).

A step passing means its `run` callback didn't throw — `recorder.check(...)` only records evidence,
it never fails the step by itself (see "Shape of a cert test" above; this is worth repeating because
it's the single easiest mistake to make writing a new step). `RunRecord.verdict` is computed by
`EvidenceRecorder`, not hand-set: `deviceExit` set ⇒ `"fail"`; any step `"fail"`/`"aborted"` ⇒
`"fail"`; else any step `"pass"` ⇒ `"pass"`; else (every step skipped, or zero steps ran, e.g.
`TC-ACT-3.2` under `matterjs` or `TC-SC-3.5` when its prerequisite is missing) ⇒ `"skipped"`. A
`"skipped"` run-level verdict is a legitimate, expected outcome for a flavor-gapped or
prerequisite-blocked TC — it is not the same as `"fail"`, and shouldn't be treated as a failure when
triaging a run.

## Shape of a cert test

```ts
certTest("TC-XXX-0.0", { plan: "n/a" | "<plan doc id>", pics: [], app: "all-clusters" })
    .step(1, "description", async cx => {
        const dut = cx.controllers.dut; // ControllerAdapter
        const th = cx.devices.th; // CertDevice
        // ...
        cx.recorder.check({ type: "...", verdict: "pass" | "fail", detail: "..." });
        if (/* not actually pass */) {
            throw new Error("...");
        }
    });
```

- `cx.recorder.check(...)` only records evidence; it does **not** fail the step. A step fails by
  throwing from `run`. Always follow a check with an explicit `if (result.verdict !== "pass") throw
  ...` if the check result should gate the step.
- `certTest` registers the mocha `it()` immediately; `.step()` calls append to it and may continue
  after `certTest()` returns (see `cert-dsl.ts`'s `certTest`/`defineCertTest`).
- Role names: `cx.controllers.dut` / `cx.devices.th` are the defaults (`controllers: { dut: "dut" }`,
  `devices: { th: options.app }`). Override via `certTest`'s `controllers`/`devices` options for
  multi-controller/multi-device TCs (e.g. `th_cr2`).

## Commission/decommission lifecycle

Devices in this directory run in-process on the **shared host network** for the whole mocha process
(see `NodeTestInstance`'s `Environment.default`-rooted environment) — a fabric/session left behind by
one test can stall a *different* test's commissioning/decommissioning later in the same run. Always
decommission what you commission, in a `try/finally` around the check that needs the commissioned
node, not just at the end of a linear step (a thrown assertion should not skip cleanup):

```ts
const ref = await dut.commission({ passcode: th.commissioning.passcode, discriminator: th.commissioning.discriminator });
try {
    // ... checks against ref ...
} finally {
    await dut.node(ref).decommission();
}
```

## `expectMdns` (`src/cert/mdns-check.ts`)

- `commissionable: true|false` is scoped to the device via its `commissioning.discriminator` — safe
  to use with only a `CertDevice` in hand, no extra setup needed.
- `operationalRecords: n` **requires** `options.operationalInstanceName`. There is no way to derive a
  device's operational mDNS instance name from `CertDevice` alone (it needs the compressed fabric id
  and assigned node id, known only to whichever `ControllerAdapter` commissioned it). Obtain it after
  commissioning via `await dut.node(ref).operationalMdnsInstanceName()` and pass it through:

  ```ts
  const operationalInstanceName = await dut.node(ref).operationalMdnsInstanceName();
  const result = await expectMdns(th, { operationalRecords: 1 }, { operationalInstanceName });
  ```

  Do **not** be tempted to "count every `_matter._tcp` instance on the network" as a shortcut — this
  was tried and measurably fails: on a normal LAN (let alone a shared CI host running other cert tests
  concurrently) there are typically dozens of unrelated operational advertisements, and the count is
  never a stable proxy for "this device". `expectMdns` throws `ImplementationError` if
  `operationalRecords` is requested without `operationalInstanceName`, specifically so this mistake is
  loud rather than an intermittently-flaky check.
- Only `InProcessControllerAdapter` implements `operationalMdnsInstanceName()` today. A future
  chip-tool-backed `ControllerAdapter` needs its own implementation (chip-tool prints the assigned
  node id and knows its own fabric) before `operationalRecords` checks work against that flavor.

## Framework gotcha: `Boot.init`, not a one-time guard, for anything touching `Logger.destinations`

`beforeEachFile()` (`packages/testing/src/mocha.ts`) calls `Boot.reboot()` before **every spec file**,
and `Logger.ts` registers a `Boot.init` that replaces `Logger.destinations` with a fresh object on
every reboot. A module-level "install once" boolean guard around a `Logger.destinations[...] = ...`
assignment (the original pattern in both `index.ts`'s device log capture and
`InProcessControllerAdapter.ts`'s adapter log capture) only ever runs during the *first* spec file in
the process — every subsequent cert-test file's log lines silently go nowhere, because the guard skips
re-registering into the fresh `destinations` object. This was invisible until Task 7 added a second
cert-test file alongside `smoke.test.ts`; it will resurface for any *new* module-level registration
against `Logger.destinations` (or anything else `Boot.reboot()`-resettable) unless it's wrapped in
`Boot.init(() => { ... })` instead of a boolean guard.

## Known, out-of-scope flake

Closing a `CommissioningController` (e.g. `InProcessControllerAdapter.close()`) after a
decommission-of-self leaves a zombie session/subscription roughly ~75% of the time, which the test
runner reports as `Error: Tests passed but process did not exit cleanly after 5s.` (exit code 101)
even though every mocha assertion passed. This is a pre-existing issue filed against Task 6, not
specific to any one TC — if a run ends this way with all tests green in the summary above the error,
treat the run as passing and don't chase the exit code.

## Translating a real test plan into a `TC-*.test.ts` (source lookup flow)

Established while building `TC-IDM-2.1.test.ts` (steps table has ~21 rows of wildcard/data-type read
requests):

1. **Start with the plan doc** (`chip-test-plans/src/<doc>.adoc`) for the step numbering, verbatim step
   text, expected-outcome text, and per-step PICS — that's what `certTest()`'s `.step(number, text, run,
   { pics, expected })` transcribes.
2. **Check for a `Test_TC_<ID>.yaml` under `connectedhomeip/src/app/tests/suites/certification/`
   matching the exact TC id first**, before falling back to a sibling TC's YAML (e.g. the brief pointed at
   `Test_TC_IDM_1_1.yaml` as a format example, but `Test_TC_IDM_2_1.yaml` — the exact match — existed and
   had real captured `AttributePathIB` blocks for every step; always check for the exact file before using
   a neighbor's as a stand-in). Its `verification:` blocks show real captured chip log output for each
   step — that's the source for regex derivation, not the adoc (which has no log examples at all).
3. **Don't copy the YAML's literal numeric values** (endpoint/cluster/attribute ids) — those are just one
   illustrative example from whoever captured that YAML. Pick your own concrete attribute paths that (a)
   exist on both the matter.js test app (check the `AllClustersTestInstance.ts`/equivalent source) and the
   real chip app (check its `.matter`/`.zap` file's `endpoint N { server cluster X { ... } }` blocks) and
   (b) exercise the specific path shape or data type the step calls for. Verify cluster/attribute name
   spelling against `packages/model/src/standard/elements/*.element.ts` (`Matter.clusters.require(name)`
   uses the same camelCase-from-PascalCase convention already established in `smoke.test.ts`).
4. **A YAML step's `verification:` text can itself be wrong.** `Test_TC_IDM_2_1.yaml`'s step 20
   verification block describes the *opposite* direction from this TC's own DUT-as-client premise
   (reads TC-IDM-2.2's captures, not this TC's) — see `TESTPLAN-FEEDBACK.md`. Cross-check a YAML capture's
   own prose against the adoc's step text for the *same* TC before trusting it; log a mismatch as a
   `TESTPLAN-FEEDBACK.md` entry rather than silently working around it in code.

## chip's structured protocol logging needs explicit flags — and is colorized even when piped

A locally-built `chip-<app>-app` binary (verified against a `darwin-arm64-all-clusters` build; almost
certainly true of the Linux/docker builds too) logs only its terse progress categories (`[EM]`/`[IN]`/
`[SC]`/`[DIS]`) by default — the structured `CHIP:DMG:`-prefixed `ReadRequestMessage =` / `AttributePathIB`
decode dumps every step in this TC's log check depends on **never appear at all** without
`--trace_log 1 --trace_decode 1`. `chip-app-subject.ts`'s `ChipLocalDevice`/`ChipDockerDevice` now pass
these unconditionally (`TRACE_ARGS`) — no per-TC opt-in needed, since any future TC that checks chip's
protocol-level log output needs them too.

Once those flags are on, chip's own stdout is ANSI-colorized *even though it isn't a TTY* (a raw line
looks like `\x1b[0;34m[1786133143.490] [pid:tid:chip] [DMG] \t\tAttributePathIB =\x1b[0m` — literal escape
sequences, not terminal rendering). A pattern anchored on end-of-line (`$`) never matches the visible text
because the trailing ANSI reset sequence comes after it. `LogFollower` now strips ANSI (`deansify`, already
used by the py/yaml harness for the same reason — see `yaml-test.ts`) from every line as it's buffered, so
patterns like `/Attribute = 0x0000_0002,\s*$/` work as written and evidence `.log` files stay human-readable.
This is a framework-level fix (`log-follower.ts`), not something an individual TC needs to work around.

## Wildcard path idioms (`TC-IDM-2.1`)

- **`AttributePathSpec`'s wildcard fields map straight to `readAttribute`.** Any subset of
  `endpoint`/`cluster`/`attribute` can be `undefined`; `InProcessControllerAdapter.readAttribute` already
  handles every combination (no adapter extension was needed for read-side wildcarding itself). A concrete
  path (all three set) returns the raw value; anything else returns
  `{endpoint, cluster, attribute, value}[]`.
- **A wildcard read tolerates per-item statuses; a concrete read does not.** `readAttribute`'s status-throw
  used to fire on *any* non-empty `attributeStatus`, wildcard or not. A full-wildcard read against a real
  chip-all-clusters-app legitimately returns both data *and* status entries in the same response (e.g.
  `UNSUPPORTED_ATTRIBUTE` for a hidden manufacturer-specific test cluster's own attributes, mixed in with
  hundreds of successful reads) — that's normal wildcard-expansion behavior, not a failure. Fixed in
  `InProcessControllerAdapter.readAttribute`: the status-throw now only applies to concrete paths; a
  wildcard read returns whatever data it got and ignores per-item statuses.
- **chip prints Endpoint/Cluster as bare *lowercase* hex (`0x1d`, no padding) but Attribute as an 8-digit,
  underscore-grouped, *uppercase* MEI (`0x0000_FFFD`)** — verified against real trace-decode output, not
  guessed from the adoc/YAML (whose own example ids happened to be single digits, which don't disambiguate
  case). Get this wrong and every field-line pattern silently times out instead of failing fast, since
  `log.expect` just never finds a match.
- **Matching one `AttributePathIB`'s exact field set (not just "does the value appear somewhere") needs
  line-adjacency, not a single regex.** chip logs each present field on its own `CHIP:DMG:` line inside the
  `AttributePathIB = { ... }` block, in a fixed Endpoint→Cluster→Attribute order, with *no line at all* for
  an absent (wildcarded) field. `LogFollower.expect` only tests one pattern against one line at a time, so
  verifying "exactly these fields, in this order, nothing extra" means chaining `expect()` calls — each
  one's `from` set to the previous match's `index + 1` — and failing if a match doesn't land exactly there.
  See `TC-IDM-2.1.test.ts`'s `expectAttributePathIB`/`attributePathIBSequence`. This is TC-local for now;
  promote it to `log-follower.ts` if a second TC needs the same shape of check.
- **Every log check in this TC supplies only a `chip` pattern, never a `matterjs` one** — matter.js's own
  logger doesn't emit an equivalent decode dump, so every log check against the matterjs flavor resolves to
  `"unverified"` by design (see `LogExpectPatterns`/the flavor-pattern policy already documented above).
  That's the intended dual-flavor split: response-shape assertions (`recorder.check({type: "response", ...})`)
  are what actually prove behavior on matterjs; the chip-side log check is additional protocol-level
  evidence only available for the chip flavor.
- **Guard every step against leaving the DUT commissioned if it throws.** With ~21 steps sharing one
  commissioned node, the step engine aborts (skips, doesn't run) every step after the one that threw — see
  `cert-test.ts`'s `invoke()` — so a decommission written into only the *last* step never runs if an
  earlier one fails. `TC-IDM-2.1.test.ts`'s `guarded()` wraps every step's body so a thrown assertion still
  decommissions before propagating; only the actual last step decommissions on its own success path.

## Declaring a device-flavor capability gap (`TC-ACT-3.2`)

A TC's TH app can exist for some flavors but not support the cluster/commands the plan needs on others
— `TC-ACT-3.2` needs an Actions cluster on the bridge app, which the real `chip-bridge-app` has (even if
most of its commands aren't implemented — see TESTPLAN-FEEDBACK.md) but matter.js's own
`BridgeTestInstance` doesn't have at all. The DSL had no way to express "this step/TC only makes sense on
some flavors" before this TC, so it gained one: `CertStepOptions.flavors?: DeviceFlavor[]`
(`cert-dsl.ts`), threaded through to `CertStepDefinition.flavors` (`cert-context.ts`) and checked in
`CertTest.invoke()` (`cert-test.ts`) via `currentFlavor()` (every device in one run shares the same
flavor, so any one's `.flavor` speaks for the whole run) — a step whose `flavors` doesn't include the
current one is recorded `"skipped"` with a `skipReason`, the same outcome a PICS mismatch gets, before
`stepDef.run` is ever called. Omitting `flavors` runs the step on every flavor (prior behavior,
unchanged for every existing TC).

**This only helps once the flavor can construct *some* subject for the app at all.**
`certTest()`'s `describe()` body resolves a `CertDeviceFactory` for the TH app immediately at file-load
time (`subjectFactoryFor` in `cert-dsl.ts`), regardless of any step's `flavors` — a `flavors` restriction
only skips *step execution* later, it can't skip *registration*. `support/chip-testing/src/cert/index.ts`
must have `registerMatterJsCertSubject(app, ...)` called for every `app` any cert TC's `certTest()` names,
even an app whose matterjs implementation is capability-incomplete for that TC (e.g. `BridgeTestInstance`
has no Actions cluster at all) — otherwise the whole file throws at load time for every TC in the process,
not just the one missing the capability, and the `matter-test --spec="test/cert/**/*.test.ts"` gate breaks
even for unrelated TCs. `TC-ACT-3.2` needed `registerMatterJsCertSubject("bridge", ...)` added for exactly
this reason, matching the `"all-clusters"` registration already there.

## Invoke-only TCs and expected-failure responses (`TC-ACT-3.2`)

A "DUT issues command X to TH" step (as opposed to a read) has two independent things to verify: the
*outgoing* command's shape (what `TC-ACT-3.2` checks via the TH log's `CommandDataIB`/`CommandFields`,
mirroring `expectAttributePathIB`'s discipline for reads) and the *response status* the TH sent back. Per
the brief, a non-success response is tolerated evidence, not a step failure, whenever the TH's own
implementation is the reason (missing command support, an action ID it doesn't recognize, etc.) — only a
response that never arrives at all (anything that isn't a `StatusResponseError`, e.g. a real timeout) is a
genuine step failure. `TC-ACT-3.2`'s `recordInvokeStatus` catches exactly `StatusResponseError` and
records its `.code` as a `"response"` check with verdict `"pass"` either way; anything else rethrows.
Eleven of this TC's twelve steps come back `UnsupportedCommand` (0x81) against the real chip-bridge-app —
see TESTPLAN-FEEDBACK.md — and that's the expected, TESTPLAN-FEEDBACK-documented shape of a passing run,
not a bug in the TC.

## Async log delivery lag can make a later step's log check match an earlier step's trailing echo

A step's own request/response cycle finishing (its `invoke()` promise resolving) is a *network* event; the
TH's own stdout write of the matching log line is a *separate, unsynchronized* channel (the child
process's own buffering/flush timing). For a status-only command (every command in `TC-ACT-3.2`), chip logs
the *response*'s echo of `CommandPathIB` (nested under `CommandStatusIB`, not `CommandDataIB`) right as or
after it transmits the response — which can still be draining into `LogFollower`'s buffer, landing *after*
the next step's `log.mark()`, even though it chronologically belongs to the *previous* step. Since a
response's `CommandStatusIB → CommandPathIB` has the exact same `EndpointId`/`ClusterId`/`CommandId` line
shape as a request's `CommandDataIB → CommandPathIB`, a check that only looks for that 3-line shape can
lock onto the wrong step's trailing echo instead of the current step's own request — this reproduced
reliably (step 3's check matching step 2's response echo) before the fix. `TC-ACT-3.2`'s
`commandPathIBSequence` anchors on the request-side `CommandDataIB =` wrapper specifically (not just
`CommandPathIB`) to rule this out; a command with a genuine data response (unlike this TC's status-only
Actions commands) would need a different anchor, so this fix is TC-local like `TC-IDM-2.1`'s adjacency
matcher, not promoted to `log-follower.ts`.

## Known limitations carried forward from `TC-ACT-3.2`, not yet fixed

An adversarial review of this TC surfaced a few items judged real but out of this pilot's scope — noted
here rather than silently dropped, for whoever picks up the next cert TC or a framework promotion pass:

- **`commandPathIBSequence`'s adjacency chain only rules out a lagging *response* echo, not a
  theoretically lagging *previous request*.** The fix above (anchoring on `CommandDataIB =`) is verified
  against a real reproduction (step 3 matching step 2's response echo, before the fix). A previous step's
  own *request*-side log line landing after the next step's `log.mark()` would need the same kind of lag
  on the request side, which — unlike the response side — is written before chip can process and answer,
  so it should be causally impossible; this is inferred, not reproduced. If a future run hits a spurious
  `"expected line N, matched line M"` failure with no lag-inducing change nearby, this is the first place
  to look; the general fix is restarting the whole chain from `anchor.index + 1` on a mismatch instead of
  failing immediately, bounded by the same deadline.
- **A device that exits mid-step (`cert-test.ts`'s `raceAgainstDeviceExit`) leaves the step's own promise
  running detached** (pre-existing, shared by every cert TC using `guarded()`, not introduced here): if
  that orphaned promise later rejects, it's an unhandled rejection, and `guarded()`'s own cleanup catch
  never runs since the step didn't throw *to* the caller. Combined with this file's module-level
  `commissionedRef`, a second invocation of the same test file's steps in one process (a mocha retry) could
  read a stale ref left over from an aborted run. Not touched here to avoid diverging from
  `TC-IDM-2.1.test.ts`'s identical, already-shipped `guarded()`/`commissionedRef` shape with a one-off
  partial fix; the real fix is structural (see next point).
- **The `commissionedRef`/`decommissionIfNeeded`/`decommissionOnFailure`/`guarded()` scaffolding is now
  byte-identical across `TC-IDM-2.1.test.ts` and `TC-ACT-3.2.test.ts`.** This file's own "AttributePathIB
  line-adjacency matching stays TC-local... promote if a second TC needs the same shape" precedent applies
  here too: a shared commission-guard helper owning the ref as instance state (not module state) would
  fix the duplication and the staleness risk above in one place. Deferred rather than done as a drive-by
  in this TC's own commit.
- **Per-step PICS is inert on `chip-local`/`chip-docker`.** `ChipLocalDevice.pics`/`ChipDockerDevice.pics`
  both throw (`chip-app-subject.ts`), so `resolvePicsFile` always returns `undefined` for these flavors
  and every step's PICS is treated as met (see `cert-test.ts`'s `stepPicsMet`). The `pics: "ACT.C.C0x.Tx"`
  on every `TC-ACT-3.2` step is therefore transcription for the record, not a live gate, on either chip
  flavor — same as every per-step PICS in `TC-IDM-2.1`.

## chip's `CommandFields` values are suffixed with their TLV type name

A captured `CommandDataIB`'s field lines aren't just `0x<id> = <value>,` — chip appends the type,
e.g. `0x0 = 4097 (unsigned), ` (verified against a real chip-bridge-app capture; every field in
`TC-ACT-3.2` is an unsigned int, so `(unsigned)` is the only suffix seen so far). A pattern that omits
this (as a first draft naturally would, going only from the adoc/YAML's prose) matches nothing and times
out rather than failing fast — same class of surprise as `TC-IDM-2.1`'s `AttributePathIB` hex-case
mismatch, only derivable from a real capture.

## Multi-controller wiring (`TC-CADMIN-1.17`), first real exercise

`certTest()`'s `controllers` option (`{roleName: "dut" | "helper"}`) existed structurally since Task 6
but had never been exercised with more than one controller. `TC-CADMIN-1.17` is the first TC to declare
three (`{dut: "dut", th_cr2: "helper", th_cr3: "helper"}`), all commissioning the *same* `CertDevice`
(TH_CE). It worked as-is — `WiredCertTest.#buildContext` (`cert-dsl.ts`) already iterates
`Object.keys(controllerRoles)` and constructs one `InProcessControllerAdapter` per name, each with its
own `Environment`/`CommissioningController`/storage (see `InProcessControllerAdapter`'s class doc) — no
cert-dsl.ts changes were needed. The `"dut" | "helper"` role *kind* itself is still inert (nothing reads
it; only the role *name* is used as the adapter id and as the per-controller `adminFabricLabel`) — worth
knowing if a future TC's design assumes the kind changes behavior.

**Each controller's fabric gets the device's own `Label` field set to its role name**, because
`ControllerCommissioningFlow`'s `#updateFabricLabel()` step sends `label: this.fabric.label`, and
`FabricAuthority.createFabric` sets `this.fabric.label` from `adminFabricLabel` (which
`InProcessControllerAdapter`'s constructor sets to the adapter's own `id`, e.g. `"th_cr2"`). This makes a
label-based lookup in a non-fabric-filtered Fabrics read (see below) a reliable way to find *which*
fabric belongs to which controller role, without hardcoding a `FabricIndex` — the pattern this TC uses
in step 6 to find `th_cr2`'s real fabric index before removing it in step 7, rather than trusting the
plan's own literal `FabricIndex = 2`. (It happened to equal 2 in every run here, since fabric indices are
allocated sequentially and this TC always commissions dut→th_cr2→th_cr3 in that order — but deriving it
is one line and removes a hidden assumption a differently-ordered TC would silently violate.)

## Framework fix: `readFabrics()` was fabric-filtered, defeating its own purpose

`InProcessCertNodeApi.readFabrics()` used to call `node.getStateOf(OperationalCredentialsClient,
["fabrics"])` — a convenience wrapper that, like every attribute read in this codebase and in
`chip-tool`, defaults to `isFabricFiltered: true`. Since the `Fabrics` attribute has FabricSensitive
quality (Matter Core § 7.14.2.2), a fabric-filtered read *by design* returns only the *reading*
controller's own entry — running `th_cr2.node(ref).readFabrics()` returned a one-element list containing
only `th_cr2`'s own fabric, never `dut`'s or `th_cr3`'s. This went unnoticed until `TC-CADMIN-1.17`
because every prior TC's `readFabrics()` caller only had one fabric on the device at all, so
fabric-filtered and non-filtered reads were indistinguishable. This TC's step 6 (`DUT_CR1 reads the list
of Fabrics`) — which the plan itself qualifies as "a non-fabric-filtered read" in the analogous generic
composite-table version of this step — is exactly the case that exposes it: with 3 fabrics
commissioned, a fabric-filtered read returns 1, silently wrong rather than obviously broken.

Fixed in `InProcessControllerAdapter.ts`: `readFabrics()` now calls
`InteractionClient.getMultipleAttributesAndStatus` directly (the same low-level call `readAttribute` and
`writeAttribute` already use) with `isFabricFiltered: false` explicit, bypassing `getStateOf`'s
fabric-filtered default entirely. This is a behavior change for every existing/future `readFabrics()`
caller, but only visible once more than one fabric exists on the device — the spec-correct behavior
`chip-tool`'s own `--fabric-filtered 0` flag (used in this TC's own YAML capture) exists to select.

## Pairing-code commissioning (`TC-CADMIN-1.17`)

A step commissioning through an *already-open* enhanced commissioning window (`OpenCommissioningWindow`
with `enhanced: true`) cannot reuse the device's original `discriminator`/`passcode` —
`openEnhancedCommissioningWindow` (`PairedNode.ts`) generates a **fresh random discriminator and PAKE
passcode per window**, deliberately different from the device's setup code, and returns only the encoded
`manualPairingCode`/`qrPairingCode` — never the raw values. `ControllerAdapter.commission()` needed a way
to accept that encoded string directly rather than making every step decode it by hand.

`CommissioningTarget` (`packages/testing/src/chip/cert/controller-adapter.ts`) gained an optional
`manualPairingCode?: string` field; `passcode`/`discriminator` became optional alongside it (exactly one
of the two paths must be usable — enforced at the adapter, not the type, since `packages/testing` cannot
depend on the pairing-code codec, which lives in matter.js). `InProcessControllerAdapter.commission()`
(the only implementation today) decodes it via `ManualPairingCodeCodec.decode()` (`@matter/main/types`)
into `{shortDiscriminator, passcode}`, then discovers by `{shortDiscriminator}` instead of
`{longDiscriminator}` — a manual pairing code only ever carries the 4-bit short form (§ 5.1.4.1), which
`CommissionableDeviceIdentifiers`/`CommissionableMdnsScanner` already support as a first-class discovery
identifier, so no scanner change was needed. A step passing neither `manualPairingCode` nor a complete
`passcode`+`discriminator` pair gets an `ImplementationError` from the adapter, not a confusing
downstream discovery timeout.

## Bounded negative checks (`TC-CADMIN-1.17`)

A step asserting "this call must fail" (step 8: TH_CR2's read/write must fail once its fabric is
removed) cannot just `await` the call inside a `try`/`catch` — if the implementation under test never
resolves *or* rejects it (e.g. an implementation that doesn't detect the lost session and just retries
transport-level acks forever), the step hangs until the whole test's mocha timeout, which is unhelpful as
either evidence or a fast local failure. This TC's `expectRejection` races the call's own
settlement against a fixed timeout (`Time.sleep`, 25s) and reports `"fail"` for either an unexpected
success *or* a timeout, `"pass"` only for an actual rejection, with the elapsed time in the evidence
detail either way. In every run captured here (both flavors), matter.js's own controller detected the
lost session and rejected within ~0ms — see TESTPLAN-FEEDBACK's Task 10 entry 2 for why the plan's own
wording assumes a slower, network-observable failure instead.

## `expectMdns`'s `operationalInstanceName` now also accepts an array (`TC-CADMIN-1.17`)

Step 10 needs "exactly 2 of {dut's, th_cr3's} operational advertisements are live" — a genuinely
different check from the single-fabric "is this one instance present, 0 or 1" the option was built for
in Task 7/8. `expectMdns`'s `options.operationalInstanceName` (`mdns-check.ts`) now accepts
`string | string[]`; internally it's always normalized to an array, and `checkOperationalRecords` counts
how many of the given names currently carry a live SRV record and compares that count to
`expectations.operationalRecords`. A single-name call is unchanged in behavior (a 1-element array's count
is still 0 or 1). Obtaining each name is unchanged — one `ControllerAdapter.node(ref)
.operationalMdnsInstanceName()` call per fabric whose presence should count.

## Python-wrapped mode (`TC-SC-3.5`)

Some CHIP python test scripts don't fit the per-step, TS-driven `certTest()` DSL at all: they drive
their own multi-party scenario internally and only prompt for a single out-of-band action (`self.step`
markers still show up, but a step's actual work happens inside the script, not inside our `run`
callback). `TC-SC-3.5` (CASE error handling, DUT-as-commissioner) is the first of this family:
`TC_SC_3_5.py` commissions a TH_SERVER app *it spawns itself*, then repeatedly calls
`wait_for_user_input()` asking a human to commission DUT_Commissioner to TH_SERVER — once with a clean
Sigma2, four more times (steps 2c/3c/4c/5c) after injecting a different Sigma2 corruption via the
FaultInjection cluster each time.

**New framework piece, not `certTest()`.** `packages/testing/src/chip/cert/prompt-driven-python-test.ts`
adds `PromptHandler`/`PromptDrivenPythonTest` — a `PythonTest` subclass that keeps the container exec's
stdin open and, for each output line, runs the first `PromptHandler` whose `pattern` matches (via
`Array.prototype.find`, so declaration order is a priority order, not a queue — nothing removes a
handler after it fires). A matched handler's returned string is written straight to the script's stdin.
This TC is registered as a **bare `describe`/`it`**, not a `certTest()`, because there's no `CertDevice`
in the picture at all — TH_SERVER lives entirely inside the container, spawned by the script itself, and
the thing under test is `InProcessControllerAdapter`'s own commissioning stack acting as DUT_Commissioner
against it. Building a `CertStepContext` by hand (`{controllers: {dut: new InProcessControllerAdapter("dut")}, devices: {}, recorder}`)
and calling `PromptDrivenPythonTest.invoke()` directly was simpler and more honest than forcing this
shape through `certTest()`'s device-flavor machinery just to obtain a `Subject` it doesn't need.

**Finding what a prompt looks like.** `MatterBaseTest.wait_for_user_input()`
(`matter_testing_infrastructure/matter/testing/matter_testing.py`) logs two lines
(`========= USER PROMPT ... =========` then `>>> <prompt_msg> (press enter to confirm)`) and blocks on a
bare `input()` — *any* text, or none, followed by Enter satisfies it; the return value is discarded by
`TC_SC_3_5.py`. Don't go looking for a specific expected answer string; a `PromptHandler` can always
return `"\n"`. Since `prompt_msg` is itself multi-line (embedded `\n`s) and the container's line-oriented
terminal splits on raw bytes regardless of how many `logging` calls produced them, the safest anchor for
a handler's `pattern` is the single physical line that carries everything you need in one place — here,
the `Manual Pairing Code: <code>  (chip-tool: pairing onnetwork <n> <passcode>)` line, which carries the
chip-tool passcode hint directly. Don't try to correlate an earlier "please commission" line with a
later "Manual Pairing Code" line across two separate handler invocations — `PromptHandler.action` only
ever sees the one line that matched.

**The passcode is not a `setup_class` constant, only the discriminator is.** `setup_class` fixes
`th_server_discriminator = 1234` for every `OpenCommissioningWindow` call the script makes, but
`th_server_passcode = 20202021` is only ever used for the *precondition* step — TH_CLIENT's own initial
commissioning of TH_SERVER, done entirely inside the container before any prompt exists. Every window
DUT_Commissioner actually joins (steps 1b, 2c, 3c, 4c/skipped, 5c) is opened via `OpenCommissioningWindow`,
which mints a **fresh random passcode per call**; the prompt's own chip-tool hint is the only place that
value is ever exposed outside the container. A handler that hardcodes 20202021 for anything past the
precondition step will discover by nothing (auth failure) that it's DUT_Commissioner talking to a
completely different, unrelated PAKE verifier.

**Expected-failure counting, not hardcoded positions.** Steps 2c/3c/4c/5c all expect DUT commissioning
to *fail* (a Sigma2 fault was injected right before each), but step 4c (responderICAC corruption) is
skipped entirely — no prompt appears at all — if step 1c determined DUT_Commissioner has no ICAC in its
NOC chain (a runtime fact, not something knowable ahead of a live run). `TC-SC-3.5.test.ts`'s handler
tracks *occurrence count* in closure state (`state.attempts`), not step name: attempt 0 (step 1b) expects
success, every attempt after that expects failure, whether there end up being 3 or 4 of them. Don't
build a lookup keyed by the literal chip-tool node id in the prompt (`pairing onnetwork <n> ...`) — that
`n` is just an incrementing suggestion for a human operator to avoid reusing a stale chip-tool node id,
not a stable identifier for which script step is prompting.

**Bounding a commissioning attempt that's supposed to fail.** A DUT that hangs instead of promptly
rejecting a corrupted Sigma2 must not stall the whole run for the outer mocha timeout — same
"`expectRejection`-style" concern as `TC-CADMIN-1.17`'s bounded negative checks (see above), applied here
to `commission()` itself rather than a post-commissioning read/write. `TC-SC-3.5.test.ts` races
`dut.commission(...)` against a fixed timeout (`COMMISSION_TIMEOUT_MS`, 60s) and records a `"fail"`
check either way (unexpected success, or neither settling) — a real rejection is what actually proves the
behavior; the timeout is only a backstop. Not live-verified against a real DUT/TH_SERVER handshake (see
the prerequisite gap below), so this bound is a design choice informed by other TCs' precedent, not a
number tuned against an observed real commissioning latency.

**Framework fix reused by every python-wrapped/python test, not just this one:** `parseStep`
(`chip-test-common.ts`) matched `Test Step \d+` — plain numbers only. `TC_SC_3_5.py`'s own steps are
named `"1a"`/`"1b"`/`"1c"`/… (`MatterBaseTest.print_step` logs `***** Test Step %s : %s` with the exact
string a TC's own `steps_TC_SC_3_5()` gives it, alphanumeric or not). Broadened to `Test Step \S+`; this
only affects step-marker line recoloring and the `step()` progress callback, never pass/fail parsing,
and every existing plain-numeric-step TC still matches the same way.

**Framework fix reused by every python-wrapped/python test, part 2:** `PicsSource.install()`/`.save()`
used to reach through the *global* `State.container` singleton (`pics/source.ts` importing `state.ts`)
instead of taking a `Container` parameter. `PromptDrivenPythonTest` needed to reuse `PythonTest`'s own
`createCommand()` (per this repo's "reuse, don't fork" rule), and `createCommand` calls
`PicsSource.install()` — that reachability edge, followed all the way through `state.ts` → `runner.ts` →
`nodejs.ts`, is what first exposed two more latent, pre-existing bugs no prior test had ever triggered:
`extendApi(Mocha)` is called unconditionally from both `global-definitions.ts` and `nodejs.ts` with no
guard against running twice in one process (crashes `Object.defineProperty` the second time — fixed with
a `WeakSet<typeof Mocha>` idempotency guard in `mocha.ts`), and the web test bundle can't statically
resolve `@nacho-iot/js-tools` (pulled in for `pics/source.ts`'s local-file-path resolution, unused by any
python/yaml test's actual `--PICS`-via-container path) — fixed by building that import's specifier at
runtime instead of writing it as a literal, so esbuild can't trace and inline it. `PicsSource.load`/
`.save`/`.install` all now take an explicit `Container` argument; every caller (`state.ts`,
`python-test.ts`, `yaml-test.ts`, `RvcTestInstance.ts`) was updated to pass its own container instead of
reaching for the global.

**This TC's own test file is also gated `typeof window === "undefined"` + dynamic import**, mirroring
`chip-app-subject.test.ts`: `prompt-driven-python-test.ts` statically imports `python-test.ts`, which
statically imports `docker/terminal.ts`/`docker/container.ts` (dockerode, `node:util`, …) — a *static*
import's top-level code always runs the instant the importing module loads, so nothing short of moving
the import itself behind a runtime-skipped dynamic `import()` keeps those requires from executing (and
crashing, since the browser has no `require`) during a web test run.

## Prerequisite gap: no fault-injection-capable TH_SERVER binary available (`TC-SC-3.5`)

`TC_SC_3_5.py` spawns TH_SERVER itself as a **container-side** subprocess (`--string-arg
th_server_app_path:<path>`), and needs the `FaultInjection` cluster's `FailAtFault` command to actually
do something (`CHIP_WITH_NLFAULTINJECTION` compiled in) rather than return `UnsupportedCommand`. Checked
both parts:

- **Fault injection itself is likely already fine by default.** `CHIP_WITH_NLFAULTINJECTION` is driven
  by the GN arg `chip_with_nlfaultinjection`, which defaults to `chip_build_tools || chip_build_tests`
  (`build/chip/tests.gni`), and `chip_build_tools` defaults `true` on Linux (`build/chip/tools.gni`) —
  `support/chip/support/build-one` never overrides either. A `chip-all-clusters-app` built by this
  repo's own `build-one` script, with no changes, would very likely already have fault injection
  compiled in. Not verified by an actual build (see below).
- **There is no all-clusters-app binary reachable from the running container at all**, fault-injection
  or otherwise. `ghcr.io/matter-js/chip:latest` (the base image `MATTER_CHIP_IMAGE` pulls, and the only
  one confirmed present locally) ships `chip-tool` and the python/yaml test scripts, but no app binary,
  and has no CHIP source/GN/ninja toolchain left in it (that's stage-4-only, stripped before the final
  `chip`/`chip-app` stages — see `support/chip/Dockerfile`). `chip-docker`'s own per-app image convention
  (`ghcr.io/matter-js/chip-<app>:latest`, `chip-app-subject.ts`'s `ChipDockerDevice`) would supply one,
  but `ghcr.io/matter-js/chip-all-clusters` returns `denied` on both `docker pull` and
  `docker manifest inspect` — consistent with every prior pilot's note that `chip-docker` has never
  actually been exercised (no per-app images published yet). `chip-local`'s own `MATTER_CERT_APP_DIR`
  convention needs a *host-native* binary (e.g. `darwin-arm64`), which can't run inside the Linux
  container this script needs (`th_server_app_path` is resolved by the container's own `python3`
  subprocess).

**What would unblock a live run:** either build+push a `ghcr.io/matter-js/chip-all-clusters` image
(exercising `chip-docker` for the first time in this series) and extract/mount its binary into the
`chip` container's filesystem at a path passed via `MATTER_CERT_TH_SERVER_APP_PATH`, or extend the base
`chip`/`chip-app` image to bundle a Linux all-clusters-app binary directly. Either is a docker-image
change, out of scope for this task per its own instructions (report the gap, don't build one
unprompted). `TC-SC-3.5.test.ts`'s single test checks `env.MATTER_CERT_TH_SERVER_APP_PATH` and calls
`this.skip()` when unset, so the cert suite stays green without the binary; once it's set to a real
in-container path, the test should run for real with no code changes.
