# Authoring cert tests in this directory

Guidance for whoever (human or agent) writes the next `TC-*.test.ts` here. Update this file in the
same commit as the test case that produced the insight. Report every test-plan-document discrepancy
you find (wrong field type, unmatchable log quote, an unimplementable step, …) to the maintainer
through their own todo/issue flow — this is not logged in a committed file.

## What a cert test is, and where the worked examples live

A `TC-*.test.ts` here drives one certification test plan's steps against matter.js acting as
**controller** (DUT), with a `CertDevice` (a real `chip-<app>-app` or a matter.js `TestInstance`) as
the **TH** it's proving interop against — the reverse of this package's other test kinds
(`test/app-fast`, `test/core`, …), which drive chip-tool/python against matter.js acting as
**device**. Five pilots exist; each is the reference example for a different mechanic, not just
another TC:

- **`FRAMEWORK-SMOKE`** (`test/cert-framework/smoke.test.ts`) — the minimal shape: one device, one
  controller, a response check and a device-log check, plus the evidence-writing test right after
  it. Lives outside this directory (its id is deliberately not `TC-*`: it's a framework self-test,
  not a translation of a real certification test plan) but is still the reference to start with
  before reading anything else here.
- **`TC-IDM-2.1`** (all-clusters) — single-controller/single-device read requests: wildcard vs.
  concrete `AttributePathIB` reads, line-adjacency log matching, the adoc→YAML→regex source-lookup
  flow. See "Translating a real test plan" and "Wildcard path idioms" below.
- **`TC-ACT-3.2`** (bridge) — invoking commands (not just reading), a device-flavor capability gap
  (`flavors` option) for a cluster matterjs's test app doesn't have, and tolerating an
  implementation-specific non-success response as valid evidence rather than a step failure. See
  "Declaring a device-flavor capability gap" and "Invoke-only TCs" below.
- **`TC-IDM-1.1`** (all-clusters) — a smaller invoke-only TC than `TC-ACT-3.2`: a mandatory,
  no-field command (`OnOff.on`/`.off`) that must always succeed on every flavor (no `flavors`
  restriction, no tolerated-failure response), and the first use of `CertStepOptions.notApplicable`
  for a plan step the real certification harness itself marks "Out of Scope". See "A step the plan
  itself calls out of scope" and "Promoting the command-path log check" below.
- **`TC-CADMIN-1.17`** (all-clusters) — multiple controllers against one device, pairing-code
  (rather than passcode/discriminator) commissioning, non-fabric-filtered reads, and a bounded
  "this must fail" check. See "Multi-controller wiring" and "Bounded negative checks" below.
- **`TC-SC-3.5`** (python-wrapped, currently live-blocked) — a script that drives its own scenario
  and only needs a human-in-the-loop (here, an automated `PromptHandler`) to react to prompts; not
  built on `certTest()` at all. See "Python-wrapped mode" below. Read this one last — it is the
  exception to almost everything above it.

Each pilot's own section further down is written chronologically (what was found while building
that TC), which is also a reasonable reading order: source lookup → single-device reads → invoking
commands → a smaller invoke-only variant → multi-controller → the python-wrapped escape hatch.

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
exist (verify with `MATTER_CERT_APP_DIR`/an app-specific image, or `MATTER_CHIP_BINS_SOURCE=cert-bins`
for the official binaries — see the root `README.md`'s "Choosing a CHIP binary source"), same as any
pilot. They're blocked
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
`EvidenceRecorder`, not hand-set: `deviceExit` or `finalizationError` set ⇒ `"fail"`; any step `"fail"`/`"aborted"` ⇒
`"fail"`; else any step `"pass"` ⇒ `"pass"`; else (every step skipped, or zero steps ran, e.g.
`TC-ACT-3.2` under `matterjs` or `TC-SC-3.5` when its prerequisite is missing) ⇒ `"skipped"`. A
`"skipped"` run-level verdict is a legitimate, expected outcome for a flavor-gapped or
prerequisite-blocked TC — it is not the same as `"fail"`, and shouldn't be treated as a failure when
triaging a run.

Every attached `.log` also carries a step-boundary banner (chip python/yaml style) at the point a
step starts and again when it ends (`<tc> — Test Step <number>: <text>` / `<tc> — Test Step
<number>: PASS|FAIL|SKIPPED|ABORTED`, each between a rule of dashes). `CertTest.invoke()`
(`cert-test.ts`) injects these via `LogFollower.annotate()` into every device's and controller's log
buffer; they're flagged synthetic so a step's own `log.expect()` never matches one, even against a
catch-all pattern. This is purely for log readability — it doesn't change `RunRecord`'s shape.

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
one test can stall a *different* test's commissioning/decommissioning later in the same run.

**Cleanup belongs in `certTest(...).finalize(...)`, never in a step.** The engine runs the finalizer
once after the last step whatever happened to the steps — passed, failed, aborted, or skipped by a
`pics`/`flavors`/`notApplicable` gate — and before the evidence is flushed, so the decommission
traffic still lands in the attached logs. A step's own body cannot own cleanup, because that step is
skippable: `TC-IDM-4.1`'s cleanup rode on a step gated on
`MCORE.IDM.C.SubscribeRequest.Attribute.DataType_UnsignedInteger`, so an unmet PICS would have ended
the run with the node still commissioned and its subscriptions live.

```ts
const commissioned = new CommissionedRefs();

certTest("TC-XXX-0.0", { ... })
    .step(1, "...", async cx => {
        commissioned.set("dut", await cx.controllers.dut.commission({ ... }));
        // ... checks ...
    })
    .step(2, "...", commissioned.withRef("dut", async (cx, ref) => { /* ... */ }))
    .finalize(cx => commissioned.decommissionAll(cx));
```

`decommissionAll` **throws** (`CertCleanupError`) when a node stays commissioned; the engine records
that as `RunRecord.finalizationError`, which makes the run's verdict `"fail"` on its own. It does not
displace an earlier step failure — that stays the run's outcome, with the cleanup failure alongside
it in the evidence. A cleanup failure this suite swallowed into a `console.warn` once already went
unnoticed across passing runs, which is why it is loud now.

`CommissionedRefs.withRef(role, run)` only requires the role's ref up front and threads it in; the
old `guarded()` wrapper, which decommissioned on a step's own failure, is gone — the finalizer covers
that case, and a cleanup failure raised from inside a step's `catch` would have masked the step's own
error.

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
- Both `ControllerAdapter` implementations report `operationalMdnsInstanceName()`, and they agree:
  `ChipToolControllerAdapter` reads the accessing fabric's own `RootPublicKey` and `FabricId` from a
  fabric-filtered `OperationalCredentials.Fabrics` read on that node, computes the compressed fabric id
  from those, then feeds the same `getOperationalDeviceQname`. Do not reintroduce a derivation from
  chip-tool's `--commissioner-name`: that argument is per command and defaults to `alpha`, so a
  launch-time value does not describe the fabric a later command actually runs on — every role but one
  then computes a name the node never advertises, which is a failure the mDNS check reports as a
  missing record rather than as a wrong name.

## Framework gotcha: `Boot.init`, not a one-time guard, for anything touching `Logger.destinations`

`beforeEachFile()` (`packages/testing/src/mocha.ts`) calls `Boot.reboot()` before **every spec file**,
and `Logger.ts` registers a `Boot.init` that replaces `Logger.destinations` with a fresh object on
every reboot. A module-level "install once" boolean guard around a `Logger.destinations[...] = ...`
assignment (the original pattern in both `index.ts`'s device log capture and
`InProcessControllerAdapter.ts`'s adapter log capture) only ever runs during the *first* spec file in
the process — every subsequent cert-test file's log lines silently go nowhere, because the guard skips
re-registering into the fresh `destinations` object. This was invisible until a second
cert-test file alongside `smoke.test.ts`; it will resurface for any *new* module-level registration
against `Logger.destinations` (or anything else `Boot.reboot()`-resettable) unless it's wrapped in
`Boot.init(() => { ... })` instead of a boolean guard.

## Resolved: exit-101 flake after decommission-of-self ("process did not exit cleanly")

Closing a `CommissioningController` (e.g. `InProcessControllerAdapter.close()`) after a
decommission-of-self used to fail the test runner's clean-exit check (`Error: Tests passed but
process did not exit cleanly after 5s.`, exit code 101) roughly ~75% of the time, even though every
mocha assertion passed.

**Root cause (verified via `MatterHooks.generateDiagnostics()`'s Lifetime dump and a
`SHUTDOWN_TIMEOUT_MS` diagnostic bump):** decommissioning your own fabric runs `Fabric.leave()`
(`packages/protocol/src/fabric/Fabric.ts`), which flushes every subscription on the session being
torn down (`closeSubscriptions(true)`) before closing it. The legacy `CommissioningController`
auto-subscribes to the whole node on commission (`PairedNode`'s default `autoSubscribe`), so there is
always a live `ServerSubscription` (`packages/node/src/node/server/ServerSubscription.ts`) to flush.
That flush sends one final data report on the about-to-close session and then closes its exchange
gracefully (no `cause`), which makes `MessageExchange.close()`
(`packages/protocol/src/protocol/MessageExchange.ts:1102-1124`) wait out a full MRP resubmission
budget (`MRP.MAX_TRANSMISSIONS`-many backoff intervals, several seconds by design, per Matter Core §
4.12.2.1) for that flush's ack before the exchange — and with it the subscription's `closing`
lifetime, then the session, then the session manager — can finish disposing. This is correct,
spec-compliant MRP behavior, not a leak; it just routinely takes longer than the test harness's fixed
5s post-test grace period. Confirmed by raising that grace period alone (no other change): the same
`InProcessControllerAdapter` test went from ~75% exit-101 to 0/8 clean exits, each finishing well
under 20s.

**Fix, in scope for this framework (not core matter.js):** `packages/testing/src/cli.ts`'s shutdown
grace period is now overridable via `MATTER_TEST_SHUTDOWN_TIMEOUT_MS` (default unchanged at 5s for
every other package). `support/chip-testing`'s own `test-cert` npm script sets it to 15s, so
`npm run test-cert` is resolved. A run that bypasses that script — a direct
`npx matter-test --spec=test/cert/...` invocation of a single TC — still needs the variable set by
hand (see the root `README.md`'s "Running" section for the exact form); it is not resolved for that
path, and there is no package-wide default that covers it (a `.matter-test.json` `env` override would
work, but that file is gitignored/personal-only, so it can't be the checked-in fix). If a future TC
adds its own decommission-of-self and still intermittently hits exit 101 despite the variable being
set, that's new evidence, not a repeat of this one — re-diagnose rather than assuming it's the same
bounded wait.

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
   (reads TC-IDM-2.2's captures, not this TC's). Cross-check a YAML capture's own prose against the
   adoc's step text for the *same* TC before trusting it; report a mismatch to the maintainer rather
   than silently working around it in code.

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
  See `tc-support.ts`'s `expectAttributePathIB`/`attributePathIBSequence`, promoted there once
  TC-IDM-3.1/TC-IDM-4.1 needed the same shape of check as this TC.
- **Every log check in this TC supplies only a `chip` pattern, never a `matterjs` one** — matter.js's own
  logger doesn't emit an equivalent decode dump, so every log check against the matterjs flavor resolves to
  `"unverified"` by design (see `LogExpectPatterns`/the flavor-pattern policy already documented above).
  That's the intended dual-flavor split: response-shape assertions (`recorder.check({type: "response", ...})`)
  are what actually prove behavior on matterjs; the chip-side log check is additional protocol-level
  evidence only available for the chip flavor.
- **Never leave the DUT commissioned.** With ~21 steps sharing one commissioned node, the step engine aborts
  (skips, doesn't run) every step after the one that threw — see `cert-test.ts`'s `invoke()` — except a
  step that throws `UnsupportedByControllerError`, which is recorded `"skipped"` and lets later steps run.
  Either way a decommission written into any single step is unreliable. `.finalize()` owns it instead (see
  "Commission/decommission lifecycle" above).

## Declaring a device-flavor capability gap (`TC-ACT-3.2`)

A TC's TH app can exist for some flavors but not support the cluster/commands the plan needs on others
— `TC-ACT-3.2` needs an Actions cluster on the bridge app, which the real `chip-bridge-app` has (even if
most of its commands aren't implemented) but matter.js's own `BridgeTestInstance` doesn't have at all. The DSL had no way to express "this step/TC only makes sense on
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

## What a step can and cannot ask of the chip-tool controller

`MATTER_CERT_CONTROLLER=chip-tool` swaps `InProcessControllerAdapter` for
`ChipToolControllerAdapter`, and the two are not interchangeable in every direction. A step asking for
something chip-tool cannot express gets `UnsupportedByControllerError` — recorded `"skipped"`, later
steps still run — rather than a wrong answer, and today that means:

- **A `writeAttributes` mixing versioned and unversioned entries** — chip-tool takes `--data-version`
  once per command, applying to all its paths or none, so a request where only some entries carry a
  `dataVersion` cannot be expressed as one write.
- **A wildcard-endpoint `writeAttributes`** (`TC-IDM-3.1` step 2) — chip-tool's `WriteAttribute`
  callback records a JSON result only for a path the device *rejected*, so successfully written
  endpoints are invisible and the per-endpoint statuses the method contracts to return cannot be
  reconstructed. Concrete-endpoint writes are fine: absence of a status *is* the success signal, since
  Matter Core § 8.9.2.8 requires one per concrete path.
- **A value whose encoded form contains `;`** — chip-tool splits its `attribute-values` argument on it.
- **More than 64 paths in one read or write** — chip-tool's own `kMaxAllowedPaths`.

Multi-cluster reads and multi-attribute writes *are* supported: chip-tool zips its cluster/attribute/
endpoint id lists element-wise when their lengths match (`InteractionModelConfig::GetAttributePaths`),
so equal-length lists express an arbitrary path set — it is not one cluster per command.

## Invoke-only TCs and expected-failure responses (`TC-ACT-3.2`)

A "DUT issues command X to TH" step (as opposed to a read) has two independent things to verify: the
*outgoing* command's shape (what `TC-ACT-3.2` checks via the TH log's `CommandDataIB`/`CommandFields`,
mirroring `expectAttributePathIB`'s discipline for reads) and the *response status* the TH sent back. Per
the brief, a non-success response is tolerated evidence, not a step failure, whenever the TH's own
implementation is the reason (missing command support, an action ID it doesn't recognize, etc.) — only a
response that never arrives at all (anything that isn't a `StatusResponseError`, e.g. a real timeout) is a
genuine step failure. `TC-ACT-3.2`'s `recordInvokeStatus` catches exactly `StatusResponseError` and
records its `.code` as a `"response"` check with verdict `"pass"` either way; anything else rethrows.
Eleven of this TC's twelve steps come back `UnsupportedCommand` (0x81) against the real chip-bridge-app,
and that's the expected shape of a passing run, not a bug in the TC.

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
reliably (step 3's check matching step 2's response echo) before the fix. `commandPathIBSequence`
anchors on the request-side `CommandDataIB =` wrapper specifically (not just `CommandPathIB`) to rule
this out; a command with a genuine data response (unlike TC-ACT-3.2/TC-IDM-1.1's status-only
commands) would need a different anchor, so this fix lives in `tc-support.ts` alongside its
read-side sibling matcher, not generalized into `log-follower.ts` itself.

## Known limitations carried forward from `TC-ACT-3.2`, not yet fixed

An adversarial review of this TC surfaced a few items judged real but out of this pilot's scope — noted
here rather than silently dropped, for whoever picks up the next cert TC or a framework promotion pass:

- **`commandPathIBSequence`'s adjacency chain only rules out a lagging *response* echo, not a
  theoretically lagging *previous request*.** Now shared via `tc-support.ts` (see "Promoting the
  command-path log check" below), so this limitation applies to every caller, not just this TC. The
  fix above (anchoring on `CommandDataIB =`) is verified
  against a real reproduction (step 3 matching step 2's response echo, before the fix). A previous step's
  own *request*-side log line landing after the next step's `log.mark()` would need the same kind of lag
  on the request side, which — unlike the response side — is written before chip can process and answer,
  so it should be causally impossible; this is inferred, not reproduced. If a future run hits a spurious
  `"expected line N, matched line M"` failure with no lag-inducing change nearby, this is the first place
  to look; the general fix is restarting the whole chain from `anchor.index + 1` on a mismatch instead of
  failing immediately, bounded by the same deadline.
- **A device that exits mid-step (`cert-test.ts`'s `raceAgainstDeviceExit`) leaves the step's own promise
  running detached** (pre-existing, shared by every cert TC, not introduced here): if that orphaned promise
  later rejects, it's an unhandled rejection. Combined with a module-level `CommissionedRefs`, a second
  invocation of the same test file's steps in one process (a mocha retry) could read a stale ref left over
  from an aborted run — the `.finalize()` cleanup clears every ref it visits, so this needs a run that never
  reached its own finalizer.
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

## A step the plan itself calls out of scope (`TC-IDM-1.1`)

`Test_TC_IDM_1_1.yaml`'s own step-2 `verification:` text is the single word "Out of Scope" — CHIP's
own certification harness declares this step (a wildcarded-endpoint invoke) untestable, not merely
untested by this translation. `CertStepOptions.notApplicable` (added in an earlier task for exactly
this case) is the right declaration: `.step(2, "...", async () => {}, { notApplicable: "Out of Scope
in CHIP's certification harness" })`. The engine records the step `"skipped"` with the reason before
ever calling `run` (`cert-test.ts`'s `invoke()` checks `notApplicable` first — ahead of the abort
state an earlier step's failure sets, and ahead of `flavors` and per-step PICS), so the empty async
body is never reached — it exists only because `.step()` requires a `run` callback. The ordering
against the abort state is what keeps the declared reason in the evidence: a step that could never
have run is not "aborted by step 3", and recording it that way loses the only thing it had to say. Don't reach for `flavors: []` or a `pics` expression that's always false to express
this: both would still call `run` in a run configuration nobody expects, and neither carries a reason
into the evidence bundle the way `notApplicable` does.

## Promoting the command-path log check (`TC-IDM-1.1`)

`TC-ACT-3.2`'s `commandPathIBSequence`/`expectCommandInvoke` (checking a `CommandDataIB`/`CommandPathIB`
block for an invoked command, the write-side counterpart to `expectAttributePathIB`'s read-side check)
were TC-local when only one TC needed them. `TC-IDM-1.1` needs the exact same shape of check — a
different cluster (`OnOff` vs. `Actions`), a different endpoint constant, and no fields at all — which
is the same "a second TC needs the same shape" trigger `TC-IDM-2.1`'s `attributePathIBSequence` was
promoted on (see "Wildcard path idioms" above). Both helpers, plus a shared `requireId` and a renamed
`CommandFieldValue` (was `FieldValue`), moved to `tc-support.ts`, parameterized on `endpoint`/`cluster`
instead of reading TC-ACT-3.2's own module-level constants; `TC-ACT-3.2.test.ts` was updated to call the
promoted versions rather than keep a second copy. Behavior is unchanged for `TC-ACT-3.2` — same sequence,
same per-field pattern, same returned `CheckRecord` shape — only the call site gained two parameters
(`endpoint`, `cluster`) it used to read from module scope.

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

## Fabric-filtered reads: the `fabricFiltered: false` trap

The `Fabrics` attribute has FabricSensitive quality (Matter Core § 7.14.2.2), so a default
(fabric-filtered) read *by design* returns only the *reading* controller's own entry — with 3 fabrics
commissioned, `th_cr2`'s read returns a one-element list containing only `th_cr2`'s own fabric, never
`dut`'s or `th_cr3`'s. This is silently wrong rather than obviously broken as long as only one fabric
exists on the device, and only a multi-controller TC like `TC-CADMIN-1.17` exposes it (its step 6 is
"a non-fabric-filtered read" per the plan's own generic composite-table variant).

`CertNodeApi` therefore has no dedicated fabrics helper: read fabrics via
`readAttribute({endpoint: 0, cluster: <OperationalCredentials>, attribute: <fabrics>}, { fabricFiltered: false })`
(see `TC-CADMIN-1.17.test.ts`'s `readFabrics` helper) — the spec-correct behavior `chip-tool`'s own
`--fabric-filtered 0` flag (used in this TC's YAML capture) exists to select. Removing a fabric is the
plain generic command: `invoke("OperationalCredentials", "removeFabric", { fabricIndex })`.

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
lost session and rejected within ~0ms. The plan's own wording assumes a slower, network-observable
failure instead — chip-tool's captured evidence for the same scenario shows a CASE-resumption error
(`CHIP Error 0x000000C9: No shared trusted root`), i.e. chip-tool actually reaches out over the network
and gets rejected there. Both are legitimate ways to satisfy "verify read/write commands fail as
expected"; `expectRejection` accepts either rather than asserting a specific failure latency or error
identity.

## `expectMdns`'s `operationalInstanceName` now also accepts an array (`TC-CADMIN-1.17`)

Step 10 needs "exactly 2 of {dut's, th_cr3's} operational advertisements are live" — a genuinely
different check from the single-fabric "is this one instance present, 0 or 1" the option was built for
for `FRAMEWORK-MDNS-CHECK`/`TC-IDM-2.1`. `expectMdns`'s `options.operationalInstanceName` (`mdns-check.ts`) now accepts
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
- **The published base image now carries the app binaries.** `ghcr.io/matter-js/chip:latest` ships
  `chip-all-clusters-app`, `chip-all-clusters-app-nlfaultinject` and `chip-bridge-app` alongside
  `chip-tool` (`support/chip/Dockerfile`), published as a multi-arch amd64+arm64 manifest. Earlier
  notes in this file describing the image as app-binary-free predate that. `chip-docker`'s own
  per-app image convention (`ghcr.io/matter-js/chip-<app>:latest`, `chip-app-subject.ts`'s
  `ChipDockerDevice`) is still unusable — nothing publishes those images and the bake targets that
  named them have been removed — so `chip-docker` remains unexercised.

**How a live run is unblocked:** the base image bundles the binaries, so
`MATTER_CERT_TH_SERVER_APP_PATH=/bin/chip-all-clusters-app-nlfaultinject` names a real in-container
path (`chip-cert-tests.yml`'s own-built job) and the official `chip-cert-bins` image supplies the same
binary at `/official-chip-bins/` for the cert-bins job. `TC-SC-3.5.test.ts`'s single test checks
`env.MATTER_CERT_TH_SERVER_APP_PATH` and calls `this.skip()` when unset, so the matterjs flavor —
which does not set it — stays green without a TH_SERVER binary.

## `PICS_SDK_CI_ONLY` turns a prompt-driven script into a self-test (`TC-SC-3.5`)

A script that prompts for out-of-band action usually has a second code path for CHIP's own CI, gated
on the `PICS_SDK_CI_ONLY` PICS. `TC_SC_3_5.py` gates all five of its `wait_for_user_input` calls that
way: with the PICS set it creates a second python controller, commissions TH_SERVER with it, and
reports PASS — validating the script, with no DUT involved at all.

`chip.defaultPics` composes CHIP's own `ci-pics-values`, which sets `PICS_SDK_CI_ONLY=1`, so any
prompt-driven TC has to turn it off explicitly: `chip.defaultPics.with({ PICS_SDK_CI_ONLY: 0 })`.
Override PICS that way and never with `PicsFile.patch`, which modifies its target in place — the
`chip.defaultPics` instance is shared by every other test in the run.

The failure this produces is silent: the run reports a pass, and the only tell is evidence with no
steps in it and a controller log that ends before any commissioning. Two checks catch it.
`PromptDrivenPythonTest` fails a run in which none of its declared handlers ever fired, and names
`PICS_SDK_CI_ONLY` in the message — that is the floor, and it fires whether the script passed or
failed. It is deliberately weak: `handled` is one counter across all handlers, so a script that
prompts once and then diverges still satisfies it. A TC whose prompt count is known therefore asserts
that count itself, as `TC-SC-3.5.test.ts` does against `MINIMUM_PROMPTS`. Keep both — nothing else
notices a prompt-driven TC that stopped driving anything.

## A commissioner that retries turns a one-shot fault into a pass (`TC-SC-3.5`)

`TC_SC_3_5.py` starts TH_SERVER once, in `setup_class`, and never restarts it. Each negative step only
revokes and reopens the commissioning window and arms `FailAtFault` with `numCallsToFail=1`, so the
*first* Sigma2 of that window is corrupt and every later one is clean. A commissioner that retries the
handshake therefore commissions successfully on its second attempt, and the step the script means as
"the DUT must reject this" passes.

matter.js retries deliberately — real devices sometimes need more than one chance — so the harness has
to bound the attempt instead. A step sets `CommissioningTarget.singleHandshakeAttempt`, which
`InProcessControllerAdapter` turns into a `caseConnectionTimeout` (10s) below every retry interval
commissioning's operational connection uses, so commissioning ends on the first handshake outcome. The
production default (4m15s) keeps the retries.

**Set it only on a step that expects a refusal.** The same short budget removes the recovery a healthy
commissioning legitimately needs — a second candidate address (`delayBeforeNextAddress`, 15s), a device
answering the first handshake with `NoSharedTrustRoots` (15s), a transient network error (15s) — so a
step that expects to succeed must leave it alone. TC-SC-3.5 sets it for every attempt but its first.

**It reports a budget, not the device's answer.** `Peer.connect`'s `connectionTimeout` bounds the caller's
wait rather than the handshake — the two are orthogonal to cancellation by its own documentation — but
commissioning's failure path then deletes the peer, and `Peer.close()` aborts the connection process, so
nothing keeps handshaking behind our back. What the rejection cannot tell you is *why* the handshake did
not finish: a device that merely answered slowly produces the same error as one that refused. TC-SC-3.5's
step evidence says only "did not complete" for that reason, and the device's own answer is read from the
attached controller log and from the script's. What no timeout cancels is the device-side commissioning
state — the failsafe there still has to expire on its own — which is why an abort reaching past PASE is
still worth having.

Two things obscured this while it was being diagnosed. The script's prompt says "Input anything once
commissioning has *started*", and a human answering there lets the script check `WindowStatus` and
revoke the window long before matter.js's next attempt — so a manual run passes even without the
timeout. And a CI runner with both `eth0` and `docker0` link-local addresses reaches the retry after
~15s (the next-address delay) rather than the 2 min a single-address host waits, which is what brought
the retry inside the handler's own budget.

## The write-path idiom (`writeAndCheck`, `TC-IDM-3.1`)

A "DUT writes an attribute on the TH" step needs the same two-sided proof a read does: the
*response* (`ControllerAdapter.node(ref).writeAttribute(path, value)` resolving or rejecting) and
the *TH's own log* showing chip received this specific `WriteRequestMessage`, not some other step's.
`writeAndCheck` (`TC-IDM-3.1.test.ts`) is the shape every executable write step in this TC shares:
mark the log, `writeAttribute`, record a `"response"` check either way, then call
`expectMessageWithPath(log, flavor, WRITE_REQUEST_MESSAGE, path, from, timeoutMs)` (`tc-support.ts`)
to confirm the message name and the request's `AttributePathIB` appear as a consecutive block after
the mark — the same anchor-then-walk `expectAttributePathIB` does for reads (see "Wildcard path
idioms" above), just anchored on `WRITE_REQUEST_MESSAGE` first. `expectMessageWithPath` is the
write/subscribe-shared promotion of that pattern: `TC-IDM-4.1` reuses it verbatim with
`SUBSCRIBE_REQUEST_MESSAGE` for its own priming subscribe (see below). `INVOKE_REQUEST_MESSAGE`'s
`CommandDataIB` shape still needs `expectCommandInvoke` instead — a command's fields aren't an
`AttributePathIB`.

## No capability gap for `ThermostatUserInterfaceConfiguration`/`ColorControl` (`TC-IDM-3.1`)

Before writing this TC, both clusters looked like plausible candidates for the device-flavor
capability gap `TC-ACT-3.2` established (see "Declaring a device-flavor capability gap" above) —
worth checking rather than assuming, since a `flavors` restriction is easy to reach for reflexively.
`AllClustersTestInstance.ts` registers `ThermostatUserInterfaceConfigurationServer` and
`ColorControlServer.with(...)` on endpoint 1, and both TC-IDM-3.1 steps that write into them
(`temperatureDisplayMode`, `options`) passed under the `matterjs` flavor without any restriction.
Don't assume a capability gap from a brief's own note without running the step first — the actual
run is cheap and authoritative; the brief's caution here turned out to be unfounded.

## Steps the plan defers to vendor discretion, with no worked capture at all (`TC-IDM-3.1`)

Unlike `TC-IDM-1.1`'s step 2 (`Test_TC_IDM_1_1.yaml`'s own verification text is the single word
"Out of Scope"), `Test_TC_IDM_3_1.yaml`'s steps 6-10 (signed integer, floating point, octet string,
struct, list) read "DUT implementation required... If the Vendor DUT doesn't implement/supported
this attribute, Please mark the test step as Not Applicable" — conditional on vendor capability, not
a blanket "Out of Scope". `ci-pics-values` sets every `MCORE.IDM.C.WriteRequest.Attribute.DataType_*`
key to `1`, including these five, which could be read as "CHIP considers this supported". That file
is not curated per-TC evidence, though: it blanket-enables every `MCORE.IDM` PICS key (read, write,
subscribe, client and server, all ten data types) uniformly, the same way it enables everything else
in the file — it does not indicate a concrete demonstrated write. What's actually distinctive about
steps 6-10 is the *absence* of a captured `./chip-tool ... write-by-id` command and log block, which
steps 1/3/4/5/11/12 (and step 13, reusing step 4's own example) all have. `notApplicable` for these
five records that absence ("CHIP's certification harness names no <type> attribute for this step"),
not a claim that no vendor could ever demonstrate it. A future TC revisiting this: implementing these
as executable writes would mean picking an attribute *matter.js itself* chooses as writable on the TH
for each type — which conflicts with this series' own "mirror CHIP's attribute choices exactly, don't
invent one" rule (see the task brief this TC was built from), since CHIP's own harness names none to
mirror.

## `CertNodeApi.subscribe` cannot carry more than one path (`TC-IDM-4.1`)

`Test_TC_IDM_4_1.yaml`'s step 10 needs one `SubscribeRequestMessage` carrying three concrete
`AttributePathIB`s. `CertNodeApi.subscribe(path: AttributePathSpec, opts: SubscribeOptions)`
(`packages/testing/src/chip/cert/controller-adapter.ts`) only accepts one path, and
`InProcessCertNodeApi.subscribe` (`InProcessControllerAdapter.ts`) hardcodes a one-element
`attributes: [...]` array into `client.subscribeMultipleAttributesAndEvents` — even though that
underlying matter.js call already accepts several. Sending three separate `subscribe()` calls
instead would put three `SubscribeRequestMessage`s on the wire, not the one the step needs, so
step 10 is `notApplicable` rather than faked. A real fix needs, at minimum: `subscribe(paths:
AttributePathSpec | AttributePathSpec[], opts)`, an `InProcessCertNodeApi.subscribe` that passes
every path through instead of one, a multi-path return shape, and an `onUpdate` that can attribute
a report to *which* path it was for (today's `onUpdate?: (value: unknown) => void` can't) — a
design decision for the maintainer, not something to improvise from inside a step.

## Deterministic per-write report/ack evidence, not a snapshot count (`TC-IDM-4.1`)

An early draft of `subscribeAndModify` took one `countMatches(STATUS_RESPONSE_SUCCESS, from)`
snapshot after all of a step's writes had completed and asserted `>= values.length`. An
independent review caught that this count is genuinely nondeterministic across otherwise-identical
runs (it can read 2, 3, or 4 for three correct writes): whether the priming report's own ack falls
inside the window is a race against exactly where `from` landed, and whether the *last* write's ack
has been pumped into the log buffer yet is a race against `LogFollower`'s own async delivery — the
two errors happened to cancel out in the runs that were checked by hand, which is exactly the kind
of test that looks solid until it isn't. The fix: await each write's own ack individually via
`log.expect`, chaining the next wait's `from` to the previous match's own line index + 1, the same
"anchor and advance" discipline `expectAttributePathIB`'s field-by-field walk already uses — never
take a synchronous snapshot count of something that arrives asynchronously.

## Anchor a subscription ack on its own subscription id, not on a cursor (`TC-IDM-4.1`)

Advancing a cursor is not enough once more than one subscription is live. Every step here subscribes
with `keepSubscriptions: true` and a max interval (80s) shorter than the whole run, so from step 3
onward the TH is periodically reporting on step 1's and step 2's subscriptions as well — and a
`StatusResponse` waited for at "anywhere after this write" is satisfied by the DUT acking one of
*those*, even if the write's own report was never acknowledged at all. The step passes on another
subscription's evidence.

`expectReportAck` closes that by anchoring on the report itself: chip's `ReportDataMessage` decode
dump carries `SubscriptionId = 0x<id>,` as the block's first field, and the subscription's own
`SubscribeResponseMessage` (read by `expectSubscriptionId`) is where the id comes from — unique per
subscription, and the only `SubscribeResponse` in the step's own window. The ack search then starts
at that report's line, not at a step boundary. Both blocks' rendering is captured verbatim in
`Test_TC_IDM_4_4.yaml`; that the TH prints them for messages it *sends* follows from the same
`--trace_decode 1` handler that already makes `ReportDataMessage` appear in a chip TH's log (see
`expectChunkedTransfer`), and chip assigns the subscription id while processing the SubscribeRequest
(`ReadHandler::ProcessSubscribeRequest`), before the priming report — so even the priming report
carries the final id. Read from source, not from a chip-flavored run: only CI proves it.

**Fixed** (was: the ack matched was the first Success `StatusResponse` anywhere after this
subscription's report — restoring the automatic node-level subscription made this reachable, not
just theoretical: several subscriptions' report/ack cycles are now genuinely concurrent, and the
gap between a report and its own ack is the full multi-second network/log round trip, not a
microseconds race). There is no subscription id on a `StatusResponseMessage` itself, but chip's own
trace line for an outbound message (printed right before that message's decode dump) names the CHIP
Exchange id it was sent on, and the same capture shows the DUT's ack line naming that identical id —
Matter Core's MRP (§ 4.12) always acks a message on the exchange it arrived on. `expectReportAck` now
reads that id off our own report's trace line and requires the ack to arrive on the same exchange;
a different subscription's report/ack pair carries its own, different exchange id, so it can no
longer stand in for ours. What this does not prove: chip's exchange-id counter is a plain, unbounded
counter with no documented uniqueness guarantee beyond one run's lifetime, and the trace line's exact
wording is chip-version-specific like every other pattern in this file.

## A write that doesn't change the value produces no report — the "values must differ" precondition (`TC-IDM-4.1`)

`subscribeAndModify` (now in `tc-idm-4.1-support.ts`) confirms each write by a report on this step's
own subscription id, and requires `values` to come back from `onUpdate` as an in-order subsequence —
so it tolerates a duplicate report but still needs one report per write. That only holds if every
write actually changes the attribute. `Datasource.#computePostCommitChanges`
(`packages/node/src/behavior/state/managed/Datasource.ts`) short-circuits on
`isDeepEqual(oldValue, newValue)` before any change event fires, so a write whose value equals the
attribute's *current* value produces no subscription report at all — the per-write wait then runs out
its bounded report budget and fails the step, rather than hanging silently. Every `values`
list `subscribeAndModify` is called with (steps 3-5) is chosen so each entry differs from the one
before it, not only from the attribute's initial value — matching the plan's own "modify the
attribute multiple times" wording, since writing the same value again isn't a modification. A
future TC reusing `subscribeAndModify` with a `values` list that repeats a value back-to-back, or
opens with the TH's own current default, will time out on that write rather than fail fast at the
call site — there's no guard for it; the caller is expected to know the TH's starting value.

Why the correlation is by subscription id rather than by counting callbacks: chip-tool accumulates
`ReadClient`s inside one command object, so a TC that subscribed to a path N times sees N reports per
change, and chip-tool's report JSON carries no subscription id to tell them apart. Counting `onUpdate`
calls therefore fails on the chip-tool controller leg. The device log does carry the id, which is what
the helper matches on; where it doesn't (matterjs device flavor, where log checks are `unverified`),
the in-order subsequence is the confirmation.

## Subscription policy: the automatic node-level subscription stays on

`InProcessControllerAdapter` does **not** disable `CommissioningController`'s automatic node-level
wildcard subscription (`autoSubscribe`). That was tried: disabling it stalls every chip-flavor run
at subject activation (chip-local's TH never gets past "activating subject", no step output, for
25+ minutes) with no such symptom on the matterjs flavor — a CI bisection across three runs
narrowed it to that one option (autoSubscribe:false present and hanging vs. absent/reverted and
completing in under 5 minutes). Don't reach for `autoSubscribe: false` again for a chip-flavor
concern; whatever it's meant to fix, it costs the entire chip-local run.

What actually fixes `decommission()` refusing at cleanup (the bug `autoSubscribe: false` was
originally shipped for) is `keepSubscriptions: true` on this TC's own subscribes
(`InProcessCertNodeApi.subscribe`, `InProcessControllerAdapter.ts`) — verified alone, with
`autoSubscribe` left at its default. Root cause: without it, a TC's own first `subscribe()` call
closes the node-level subscription as a same-peer replacement
(`ClientInteraction.subscribe`, packages/protocol/src/action/client/ClientInteraction.ts), which is
terminal — `PairedNode` moves `Connected` → `Reconnecting`
(packages/matter.js/src/device/PairedNode.ts) — and `decommission()` then refuses:

```
Failed to decommission dut while cleaning up: [implementation] This Node 1 is currently in a
reconnect state, decommissioning is not possible.
```

`keepSubscriptions: true` also matches CHIP's own harness capture for this test case
(`Test_TC_IDM_4_1.yaml` uses `--keepSubscriptions true`), which this TC's envelope check asserts on
the wire.

**Consequence: the automatic subscription is live, so its traffic is in every TH log window.** A
step's log check can no longer assume "the next matching line belongs to my request" — a
background `ReportDataMessage`/`StatusResponse` pair from the node-level subscription, or from an
earlier step's own subscription (every step here keeps its subscriptions), can land inside the same
window. Anchor by identity instead: the subscription id from the TH's own `SubscribeResponseMessage`
(see "Anchor a subscription ack on its own subscription id" below), or `KeepSubscriptions = true` in
the envelope itself to pick this TC's subscriptions out from the node-level one (which chip's capture
shows as `KeepSubscriptions = false`). Never anchor on "first match after a mark".

## Reading and subscribing to events (`TC-IDM-6.3`, `TC-IDM-6.4`)

`CertNodeApi` grew `readEvents(paths, options)` and `subscribeEvents(paths, opts)` for these two TCs.
Both take an **array** of `EventPathSpec` rather than the single path `subscribe` takes — an event
report carries its own path, so a multi-path subscription can still attribute an update to the path it
belongs to, which is exactly what stopped `subscribe` from growing the same shape (see
"`CertNodeApi.subscribe` cannot carry more than one path" above). `options.minEventNumber` becomes the
request's `EventFilters`; omitting it sends no filter at all, which is the optional case both plans
describe.

Both adapters implement them. `InProcessControllerAdapter` passes the paths straight to
`Read`/`Subscribe`'s own `events`/`eventFilters` options (`packages/protocol/src/action/request/`);
`ChipToolControllerAdapter` runs `any read-event-by-id <clusters> <events> <node> <endpoints>` and
`any subscribe-event-by-id <clusters> <events> <min> <max> <node> <endpoints>`, whose JSON results
carry `eventId`/`eventNumber` where an attribute's carry `attributeId`/`dataVersion`
(`RemoteDataModelLogger::LogEventAsJSON`) — so a report is demultiplexed to a live event subscription
by event path, in a list of its own beside the attribute subscriptions, and an event chip-tool reports
without an event number is an error rather than a report numbered 0.

A concrete path answered with a status **rejects** in both adapters, matching the attribute side; a
wildcard path's statuses are results of the expansion and are dropped. A node holding no record for a
requested path answers with neither data nor a status, so an **empty result is a successful read** —
neither TC requires the TH to have recorded anything.

## chip renders an `EventPathIB` differently from an `AttributePathIB`

Verified against `EventPathIB.cpp`/`AttributePathIB.cpp`/`ReadRequestMessage.cpp`, not guessed from
the YAML captures (whose event blocks date from 2022):

- The block opens `EventPath =`, not `EventPathIB =`, and **closes `},` with a comma** where an
  `AttributePathIB` closes with a bare `}`. A sequence ending in `/\}\s*$/` therefore never matches an
  event path block.
- Fields print in Node/Endpoint/Cluster/Event order, and the **event id is bare lowercase hex**
  (`0x%PRIx32`) — not the 8-digit underscore-grouped MEI an attribute id gets.
- The list wrapper is `EventPathIBs =` then `[`, and it is adjacent to the first path block, so a
  single-path request's whole envelope — message name, `{`, list wrapper, path block — is one
  consecutive run `expectAdjacentLines` can verify in one call (`eventPathIBSequence` in
  `tc-support.ts` covers the block itself).
- `isFabricFiltered` is **not** adjacent to that run: the list's own closing lines and a blank line sit
  in between, so it needs its own search starting after the block. chip prints it with a trailing
  space (`fabricFilteredPattern`).

## Promoting the subscription-id and report-ack checks (`TC-IDM-6.4`)

`expectSubscriptionId`/`expectReportAck` (with `ACK_WAIT_TIMEOUT_MS` and their private exchange-id
helpers) were TC-IDM-4.1-local until TC-IDM-6.4 needed the same "did the DUT ack *this* subscription's
report" evidence for an event subscription, so they moved to `tc-support.ts` unchanged — same trigger
as `attributePathIBSequence`'s and `commandPathIBSequence`'s own promotions. `expectSequence` (record
an `expectAdjacentLines` result as a `CheckRecord`, turning a timeout into a recorded `"fail"`) came
out of TC-IDM-4.1's own `expectSubscribeEnvelope` at the same time; that TC now calls the shared
helper with its own sequence and label.

## Timed interactions (`TC-IDM-5.1`)

`CertNodeApi.invoke` and `.writeAttribute` take a `TimedInteractionOptions` with a
`timedInteractionTimeoutMs`, which turns the interaction into a timed one (Matter Core § 8.7): the
controller sends a `TimedRequest` carrying that timeout, waits for the device's status response, and
must deliver the interaction itself inside the window. matter.js's own `Invoke`/`Write` builders derive
`timedRequest` from a `timeout`, so the adapter only has to pass one through; chip-tool takes
`--timedInteractionTimeoutMs`, the same option name on `command-by-id` and `write-by-id`.

Do not give the option a default. An absent timeout must stay absent, or every invoke and write in
every TC silently becomes a timed interaction.

What the plan asks to verify, and how each part is evidenced:

- **The timeout the device was asked for** — `TimedRequestMessage =` / `{` / `TimeoutMs = 0xc8,`, all
  consecutive; the field is bare lowercase hex and the block closes with a bare `}`.
- **The message was unicast** — chip's own receive line categorises the session: `(S)` secure unicast,
  `(U)` unencrypted unicast, `(G)` secure groupcast (`src/messaging/README.md`). `expectUnicastReceipt`
  scans *backward* from the decode dump for the nearest `Msg RX from` line, which is this message's own
  since chip logs one message at a time.
- **The follow-up is the one this request opened** — matched by chip's own exchange id, read off both
  messages' receive lines, not by "the next message after the timed request". A retry of this
  interaction, or a second administrator's own timed interaction with the same TH, otherwise stands in
  for it: the check then passes on someone else's evidence, or fails on a span measured between two
  different interactions. This is the same rule the subscription checks follow (see "Anchor a
  subscription ack on its own subscription id"), and it is why `expectUnicastReceipt` and the follow-up
  check share one receive-line lookup.
- **The follow-up carried `timedRequest = true`** — matched by *proximity*, not adjacency: chip prints
  `suppressResponse` before it, and that field is **mandatory on an invoke but optional on a write**
  (`TlvWriteRequest`), which matter.js omits and chip-tool sends. So the check anchors on the message's
  opening brace and requires the flag within two lines; a flag further away belongs to a later message.
- **The follow-up arrived inside the window** — from the two messages' own log timestamps.
  `timestampMsOf` reads chip's `[<seconds>.<fraction>]` prefix and scales by the fraction's digit count:
  the harness image prints milliseconds, the certification YAML captures microseconds.

Step 3 (the device withholds its answer to the timed request) is `notApplicable`: the plan itself says
"might not be testable" and `Test_TC_IDM_5_1.yaml` says "Mark this as not testable /NA. Out of Scope".

## Why the cert adapter shortens its peer-connection timeout

`CERT_PEER_CONNECTION_TIMEOUT` (15s, `InProcessControllerAdapter.ts`) bounds how long a cert step's
own connect attempt can stay pending before `PeerTimingParameters.defaults.defaultConnectionTimeout`
(90s, right for a real user's session) would otherwise still be running — a cert step's own check
(e.g. `TC-CADMIN-1.17` step 8's 25s `expectRejection`) gives up well before 90s, so an attempt that
can't succeed needs to fail inside that budget, not after it. This is a test-ergonomics bound, not a
fix for a specific protocol defect: it is set on the cert controller's own `PeerSet.timing`
(packages/protocol/src/peer/PeerSet.ts) right after `start()`, scoped to each cert controller's own
environment; every other consumer (real users, other tests) keeps the 90s default.

That timeout is also why `TC-CADMIN-1.17` step 8's own recorded evidence
(`writeAttribute(NodeLabel) rejected after 15s: Operation aborted`) proves the *cert adapter's own
bounded wait* elapsed, not that the controller promptly recognized the fabric removal — TH_CE's
own `NoSharedTrustRoots` rejection lands in the log within milliseconds of the write, well before
the 15s mark. Don't read that check as evidence the controller handles fabric removal promptly;
it only proves the cert run's own timeout is short enough to stay inside the step's 25s budget.
