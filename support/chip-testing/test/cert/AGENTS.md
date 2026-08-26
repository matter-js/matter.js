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
- **Every device-log check supplies a `chip:` pattern, and a `matterjs:` pattern wherever
  matter.js's own log carries the same claim.** The two logs are shaped differently rather than one
  being poorer: chip prints a structured `CHIP:DMG:` decode dump spanning a dozen lines where
  matter.js names a whole interaction, and every path it carried, on one line. So a matterjs pattern
  is a separate authoring job, not a translation of the chip one — which is why
  `expectAdjacentLines`/`expectSequence` take a `{chip, matterjs}` pair of sequences whose lengths
  differ. A check with no pattern for the running flavor resolves `"unverified"`, which leaves that
  step's device-side claim resting on nothing observed — so the step's verdict becomes
  `"unverified"` and the run fails over it. Write the missing pattern; where this run genuinely cannot
  observe the claim, say why in the check's own `accepted: "<why>"`, which keeps its step at `"pass"`.
  That field is for a claim no pattern could ever match here — the app has no such cluster, the
  controller has no such callback — not for a pattern nobody has written yet, and it belongs on the one
  check that cannot be settled rather than on the step, so a second gap in the same step still fails
  the run. `RunRecord.unverifiedChecks` counts every unverified check, accepted or not, so a bundle
  says how much of the run rests on nothing observed. As of this writing every device-log check in this
  directory carries both flavors' patterns, and the whole matterjs leg reports one unverified check,
  accepted: TC-IDM-2.1 step 21's "matter.js's all-clusters app defines no manufacturer-specific
  cluster".

  Two things bite when writing the matterjs half:

  - **What chip spreads over a block of lines, matter.js often puts on one.** A second check about
    the same message therefore cannot start searching after the line the first one matched, or it
    reads the next message instead — `sameMessageFrom(flavor, earlier, mark)` is that rule.
  - **What matter.js spreads over several lines, it interleaves with its own work.** Where a claim
    needs more than one of its lines (a subscribe's flags, its paths, the intervals it accepted),
    pass `matterjs: { ordered: [...] }` rather than a plain array: a plain array demands
    consecutive lines, which is right for chip's dump and wrong here.
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
- **Every flavor has a real `PicsFile`.** `matterjs` gets it from the underlying `NodeTestInstance`,
  the chip subjects from the harness container's own certification file (`chip.defaultPics`), so the
  per-step gate is live everywhere. `stepPicsMet` still treats an unavailable file as "met", but that
  only happens before the container is up.
- **A key naming the client side describes the controller, not the TH.** The container's file
  describes a device, so it answers 0 for `ACT.C.C00.Tx` and for `MCORE.ROLE.COMMISSIONER` — the
  capabilities the DUT of those steps needs are the *controller's*, and each adapter declares them
  (`MATTERJS_CONTROLLER_PICS`/`CHIP_TOOL_CONTROLLER_PICS`, overlaid by `controllerPicsOverridesFor`).
  Gating a step on a `.C` key the adapter has not declared is how a step comes to skip on every leg
  without anyone noticing, so declare it there rather than expecting the device file to carry it.
  The overlay is for what the *controller* is, never for what the TH advertises: `certPicsFile()` feeds
  every cert test's report, so a device-scoped key declared there would make every run's evidence claim
  something about its TH that the TH never said. `MCORE.DD.DISCOVERY_BLE`/`DISCOVERY_PAF` are the
  device's, and a test in `controller-adapter.test.ts` holds the adapters to it.
- **`RunRecord.picsSkips` counts what the gate excluded**, which is the instrument for exactly that
  mistake: a count that moves without the plan moving means a PICS value is wrong, not that the run
  had less to test.

## Running these tests locally

The root `npm test` does **not** cover this package: `support/chip-testing/package.json` sets
`nacho.test: false`, because the app legs need Docker and chip binaries, and the opt-out is per
package rather than per spec. The hermetic tests under `test/cert-framework/**` are dropped with
them. A cert change therefore needs its own command:

```bash
# what CI runs (esm and cjs legs)
npm --prefix support/chip-testing run test-cert-framework -- --no-pull

# one leg, for iteration
MATTER_TEST_SHUTDOWN_TIMEOUT_MS=15000 npx matter-test esm -p support/chip-testing \
    --spec "./test/cert-framework/*.test.ts"
```

`--prefix` rather than a `cd`, so a second command still resolves against the repository root.
`--no-pull` because `pull` defaults to true, and CI pulls the image once itself and passes the same
flag.

Docker is required either way, and no flag avoids it: the specs themselves use fakes, but
`test/test.config.ts` awaits `chip.initialize()` at module scope, so every leg starts the harness
containers before any spec runs.

The second form sets `MATTER_TEST_SHUTDOWN_TIMEOUT_MS` by hand because it bypasses the npm script
that would have set it — without it a run can end in exit 101 during normal cleanup (see
"Resolved: exit-101 flake after decommission-of-self" below).

What not to reach for: `npm test -- -p support/chip-testing` looks like the same thing and is not. The
root script is `matter-test -w`, so `-w` arrives with it and queues web tests for a package that has
none.

CI runs these as the `test-cert-framework` gate that `test-cert` depends on
(`.github/workflows/chip-cert-tests.yml`). Note what triggers that workflow: a daily schedule,
`workflow_dispatch`, a release, and a **push** whose changed paths match its `prepare` filter (or
whose head commit message carries `[execute-certtests]`) — there is no `pull_request` trigger, and
`prepare` is gated on `github.repository == 'matter-js/matter.js'`. So an in-repo branch push runs
it; a fork PR does not, and the paths filter diffs against `main` rather than the PR base. A
root-level "suite green" says nothing about this directory either way.

## Evidence expectations

Every run writes one `result.json` (`EvidenceRecorder.flush` writes it, `concludeRun` settles its
verdict; shape: `RunRecord` in `evidence.ts`) plus one `<name>.log` per `attachLog` call (`device-<role>.log`, `controller-<name>.log`) to
`${MATTER_CERT_EVIDENCE_DIR}/<timestamp>-<tc>/`. A step's own evidence lives in `RunRecord.steps[]`
as `{ step, text, expected, checks: CheckRecord[], verdict, skipReason? }`; `CheckRecord` is
`{ type: "response" | "device-log" | "network", verdict: "pass" | "fail" | "unverified", detail?,
pattern?, matched?, logLine?, accepted? }`.

What a check's `type` should be:

- **`"response"`** — the controller-observed outcome (an attribute value, an invoke status, a
  read/write success or rejection). This is the check that actually proves matter.js's controller
  behavior; it should be present on essentially every step and should resolve `"pass"`/`"fail"`, not
  `"unverified"`, on every flavor including `matterjs`.
- **`"device-log"`** — a pattern match against the TH's own stdout (via `LogFollower.expect`,
  usually wrapped so a timeout/close error becomes a recorded `"fail"` rather than propagating
  uncaught — see `TC-ACT-3.2`'s `recordInvokeStatus`/adversarial-review fix below for why an
  uncaught log-check error is a real evidence gap, not just noise). `"unverified"` means no pattern
  was supplied for the running flavor (see "Flavor policy" above) — an evidence gap that fails the
  run until the pattern is written or the check states why it cannot be settled here, rather than a
  claim about the device.
- **`"network"`** — `expectMdns`'s own check kind (mDNS record presence/absence).

A step passing means its `run` callback didn't throw *and* every check it recorded was settled — a
`"fail"` check is recorded rather than acted on, so a check that must gate the step still has to
throw (see "Shape of a cert test" above; this is the single easiest mistake to make writing a new
step), while an `"unverified"` check that did not state why makes the step `"unverified"` on its own.
`RunRecord.verdict` is computed by `EvidenceRecorder`, not hand-set: until `concludeRun` runs ⇒
`"incomplete"`; then `deviceExit`/`finalizationError`/`teardownError`/`evidenceError` set, the run's
own reported failure (`runError`) where that failure is not merely an unverified step, or any step
`"fail"`/`"aborted"` ⇒ `"fail"`; else any step `"unverified"` ⇒ `"unverified"`, which fails the run;
else any step `"pass"` ⇒ `"pass"`; else (every step skipped, or zero steps ran, e.g. `TC-ACT-3.2`
under `matterjs` or `TC-SC-3.5` when its prerequisite is missing) ⇒ `"skipped"`.

A `"skipped"` run-level verdict is a legitimate, expected outcome for a flavor-gapped or
prerequisite-blocked TC — it is not the same as `"fail"`, and shouldn't be treated as a failure when
triaging a run. `"incomplete"` is the opposite: the run never got far enough to state a verdict, so
treat it as a failed run whose cause is outside the record.

Every attached `.log` also carries a step-boundary banner (chip python/yaml style) at the point a
step starts and again when it ends (`<tc> — Test Step <number>: <text>` / `<tc> — Test Step
<number>: PASS|FAIL|UNVERIFIED|SKIPPED|ABORTED`, each between a rule of dashes). `CertTest.invoke()`
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
        record(cx, { type: "...", verdict: "pass" | "fail", detail: "..." }, "what this check is");
    });
```

- `cx.recorder.check(...)` only records evidence; it does **not** fail the step. A step fails by
  throwing from `run`. So a check that should gate the step goes through `record(cx, check, what)`
  (`tc-support.ts`), which records it and throws `CertCheckFailedError` on `"fail"` — hand-rolling
  the `if (verdict === "fail") throw` after a `check()` is how one such gate came to be missing.
  `"unverified"` passes through rather than throwing: that is what a log check reports on a flavor
  nobody wrote a pattern for, and the engine turns it into the step's verdict instead.
  Use `cx.recorder.check` directly only for a record that is provenance rather than a gate — the
  unconditional "this is what the DUT answered" line beside an `await` that would have thrown.
- Never throw a plain `Error` from a step: `CertCheckFailedError` is the step-assertion type, and
  `InternalError` is for a harness invariant that cannot hold.
- A budget in this directory is a `Duration` (`Seconds(15)`, not `15_000`). The framework underneath
  takes plain numbers, since `@matter/testing` carries no dependency on the library; a `Duration` is
  milliseconds, so it crosses that boundary as a value — `{ flavor, timeoutMs: timeout, from }`.
- Two log budgets, and they are not interchangeable. `LOG_TIMEOUT` (`tc-support.ts`, 15 s) bounds a
  wait for a line the step has already caused — the device writes it while answering the interaction
  the step drove, so the budget only covers the write and the follower's pump. It absorbed
  TC-IDM-4.1's old ack budget, which had the same value and the same argument.
  `COMMISSIONING_LOG_TIMEOUT` (`tc-dd-support.ts`, 30 s) bounds a line a device prints as it comes
  up or is commissioned, with discovery, PASE, CASE and the commissioning exchanges in between.
- A step whose only job is to produce something the next step consumes — a substituted QR payload, a
  manual pairing code — still has a checkable claim: that the artifact carries the substitution the
  plan asked for. Read it back (`checkGeneratedPayload`/`checkGeneratedManualCode` in
  `tc-dd-support.ts`) instead of recording a hard-coded `"pass"` whose `detail` asserts a property
  nobody looked at. Know what this is worth: the artifact is produced and read back in-process, so
  the check catches a wiring or generator bug in the step, **not** anything the DUT or the TH did —
  it is not interop evidence, and the `.b` step that feeds the artifact to the DUT is what carries
  that. A step generating several artifacts records them through `recordAll` (`tc-support.ts`), which
  puts every one in the evidence before failing; `record` in a loop stops at the first bad one.
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

**A TC owing more than one cleanup uses `runCleanups`, not a `try`/`finally`.** `finally` runs both
but reports only the last one's failure, and the two name different state the next run inherits — an
outstanding commissioning attempt is not a substitute for a fabric left on the TH. `runCleanups` runs
each in order, rethrows a lone failure unchanged so its own type survives, and joins several into one
`CertCleanupErrors` — a `MatterAggregateError` whose message names every failure, because the message
is all the engine keeps of a finalization failure, with the originals as its causes:

```ts
    .finalize(cx => runCleanups(() => refusals.settle(cx), () => commissioned.decommissionAll(cx)));
```

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
- **Every path check in this TC now carries both flavors' patterns.** chip's is the decode-dump
  sequence above; matter.js names the read and every path it carried on one line, which
  `expectAttributePathIB` matches through `matterjsPath` (see the flavor policy above). The response
  checks still carry the behavioral claim on either flavor — the device-log check is the TH-side
  corroboration of it.
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
- **`pics: "ACT.C.C0x.Tx"` on every step of this TC is a live gate on every flavor**, and it passes
  only because both controller adapters declare those commands: the container's certification file
  answers 0 for them, since it describes a device and a device is no Actions client. Adding a step here
  gated on a client-side key means adding that key to the adapters too (see "PICS handling").

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
`expectMessageWithPath(log, flavor, "write", path, from, timeout)` (`tc-support.ts`) to confirm the
request the TH received carries this path. Against chip that is the message name plus the request's
`AttributePathIB` as a consecutive block after the mark — the same anchor-then-walk
`expectAttributePathIB` does for reads (see "Wildcard path idioms" above), anchored on
`WRITE_REQUEST_MESSAGE` first; against matter.js it is the one line naming the write and its paths.
The third argument is the interaction kind, not a pattern, because each kind names a different line
in either log: `TC-IDM-4.1` passes `"subscribe"` for its own priming subscribe (see below). A
command's fields aren't an `AttributePathIB`, so an invoke still needs `expectCommandInvoke`.

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

An early draft of `subscribeAndModify` took one `log.count(STATUS_RESPONSE_SUCCESS, from)`
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
calls therefore fails on the chip-tool controller leg. Both device flavors' logs carry the id, which
is what the helper matches on (`expectSubscriptionId`); the in-order subsequence is what confirms the
reports themselves.

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

`expectSubscriptionId`/`expectReportAck` (with their private exchange-id helpers, and with an ack
budget of their own that is now the shared `LOG_TIMEOUT`) were TC-IDM-4.1-local until TC-IDM-6.4 needed the same "did the DUT ack *this* subscription's
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

Both adapters route the value through `timedInteractionTimeoutOf` (`src/cert/timed-interaction.ts`),
which refuses anything but an integer in the `uint16` range the wire carries: matter.js's TLV layer
checks bounds but not integrality, so without it a fractional timeout would reach one controller as a
truncated integer and the other as a chip-tool usage error.

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

## A cert test's PICS is the controller's, overlaid on the device's

A cert test's DUT is the **controller**, so a `MCORE.IDM.C.*` capability is the controller's to claim —
but the PICS file a run loads is CHIP's `ci-pics-values`, which describes a *device*. Rather than keep a
whole PICS file per controller, each adapter declares only what differs
(`MATTERJS_CONTROLLER_PICS`, `CHIP_TOOL_CONTROLLER_PICS`), and the run evaluates
`chip.defaultPics.with(those)`. Everything the controller says nothing about still comes from the
device's file.

Two gates use it, both before the device starts:

- **Test level** — `certTest()`'s own `pics` now actually gates the test. It did not before: the PICS
  filter (`TestDescriptor.filter`) only covers tests registered through `chip.include()` globs, and
  `certTest()` registers its mocha test directly, so a declared PICS only ever tinted the report's
  label. A test whose expression is unmet is now pending, with no device started and no evidence
  directory — the same shape a PICS-gated yaml test has.
- **Step level** — unchanged in mechanism, but the file it evaluates against now carries the overlay
  too, so a step and its test agree about what the controller can do.

`UnsupportedByControllerError` stays for what PICS cannot express: a capability a controller has in
general but not for the shape a particular step needs.

`certTest()` also takes test-level `flavors`, decided at declaration time (the flavor comes from the
environment, not the container). A test whose device cannot exist on a flavor — an app variant only
`chip-local` can spawn — skips before activation instead of failing in it.

## Batched invoke (`TC-IDM-1.3`)

`CertNodeApi.invokeBatch(commands)` sends several commands in one `InvokeRequestMessage`, each with its
own `CommandRef`, and returns one result per answer **in arrival order**, naming the request position it
answers. The order is the evidence: the TH answers this TC's batches in reverse for one step and drops an
answer entirely for another, and a result list keyed by request position would erase exactly that. A
command the device never answers still yields a result, carrying `NoCommandResponse` (0xcc) —
`ClientInteraction` synthesises it for every unanswered `CommandRef` once the response ends.

chip-tool has no batch invoke at all (its `command-by-id` takes one command path and sends no
`CommandRef`). It declares that in its own PICS, so a chiptool leg skips this TC outright rather than
running its commissioning steps and reporting the rest unsupported. The adapter still refuses the call
itself, which is what a controller whose declaration outran its implementation would run into.

The interaction layer splits a batch the peer cannot take in one message into separate single-command
exchanges. That is right for an ordinary caller and wrong here — the test would prove nothing about
batching, and CHIP's fault path aborts the TH on a single-command invoke — so `invokeBatch` refuses when
the peer's negotiated `MaxPathsPerInvoke` is below the batch size.

## The TH must be an `nlfaultinject` build (`TC-IDM-1.3`)

The faults this TC arms exist only in an app built with `CHIP_WITH_NLFAULTINJECTION`, which CHIP builds
as a separate binary beside the plain one. `certTest`'s `appVariant` names that suffix
(`chip-all-clusters-app` becomes `chip-all-clusters-app-nlfaultinject`), which only the `chip-local`
flavor can spawn: a chip-docker per-app image runs its own binary as `ENTRYPOINT`, and a matterjs device
has no `FaultInjection` cluster to arm at all. Hence `flavors: ["chip-local"]` on every step.

The binary is already in the harness image and the workflow already extracts it —
`chip-cert-tests.yml` passes its path as `th-server-app-path` for TC-SC-3.5's own TH_SERVER.

## `FaultInjection` is declared as a custom cluster, not added to the model (`TC-IDM-1.3`)

Cluster 0xfff1fc06 is CHIP's own test cluster and is in no Matter specification, so the shipped model
must not carry it. `fault-injection.ts` declares it with the model annotations (`@cluster`, `@command`,
`@field`) and `registerCertCustomCluster` makes both adapters resolve it — the standard model always
wins, and registering an id it already defines throws. Field ids are explicit: an annotated field
without one is internal to matter.js and never reaches the wire.

## The fault counters only work out because arming is itself invoking (`TC-IDM-1.3`)

Every `OnInvokeCommandRequest` checks faults 12, 13 and 14 in that order and the first armed one to fire
returns early (`InteractionModelEngine.cpp`). An unarmed fault decrements nothing. The plan's
`NumCallsToSkip` values (12: 3, 13: 2, 14: 1) are therefore calibrated for the three `FailAtFault`
commands consuming their own skips:

| invoke at TH | 12 | 13 | 14 | TH behaviour |
| --- | --- | --- | --- | --- |
| arm 12 | unarmed | — | — | normal |
| arm 13 | 3 → 2 | unarmed | — | normal |
| arm 14 | 2 → 1 | 2 → 1 | unarmed | normal |
| step 1 batch | 1 → 0 | 1 → 0 | 1 → 0 | normal, both answers in one message |
| step 2 batch | fires | — | — | separate response messages |
| step 3 batch | spent | fires | — | separate, reverse order |
| step 4 batch | spent | spent | fires | second answer dropped |
| step 5 single | — | — | — | normal |

Two consequences the TC enforces rather than trusts:

- **Arm in the order 12, 13, 14, one invoke each.** Any other order shifts which fault fires when.
- **No other invoke may reach the TH between arming and the last step.** Reads and writes are free —
  only invokes reach the fault site — but one stray invoke moves every later step onto the wrong fault.
  `expectInvokeCount` therefore records the TH's own invoke count per step, so a drifting counter fails
  the step that caused it instead of the one that inherits it. This is the plan's "no other commands are
  allowed to be sent" precondition, made checkable.

The arming step also sends a batch *before* arming anything. That probe is what makes a controller
without batch invoke skip the arming (and with it every step that consumes a fault) rather than leave a
fault primed for the run's own decommissioning — and, faults being unarmed at that point, it disturbs no
counter.

## The fault path aborts the TH on anything but a two-command batch (`TC-IDM-1.3`)

`TestOnlyInvokeCommandRequestWithFaultsInjected` is written with `VerifyOrDieWithMsg`, so once a fault
fires the TH *crashes* unless the request carries exactly two commands, a matching `TimedRequest` flag, a
mandatory `suppressResponse`, and valid contents. This TC's batch is two commands for that reason, not
for the plan's convenience, and it is why a fault must never be left armed for a single-command invoke
such as a `RemoveFabric` at teardown.

The same code is the TC's own TH-side evidence: it announces every injected response with
`Response to InvokeRequestMessage overridden by fault injection` followed by
`Injecting the following response:<description>`, and the three descriptions distinguish which fault
fired. The device never pretty-prints its own outgoing `InvokeResponseMessage`, so these two lines — plus
the arrival order the controller itself observed — are the whole of the response-shape evidence.

## Commissioning from an onboarding payload (`TC-DD-1.8`)

`CommissioningTarget.qrPairingCode` was declared but decoded by neither adapter; both read it now, and
a target is resolved in the order `qrPairingCode` → `manualPairingCode` → `passcode`+`discriminator`.
A QR payload carries the full 12-bit discriminator, so it discovers by the long form where a manual
code's 4-bit short form does not (§ 5.1.4.1); chip-tool takes either through the same `pairing code`
command. A concatenated payload (several devices joined by `*`) is refused rather than pairing with
whichever of them answers first.

**Where a step gets the TH's payload.** A matterjs subject reports it as
`subject.commissioning.qrPairingCode`; a chip subject reports an empty string there, because rendering
one needs the base38 encoder that `packages/testing` may not depend on — but the app prints it, once
per commissioning flow, as `SetupQRCode: [MT:…]`, standard flow first. A TC needing a payload on both
flavors therefore falls back to the device log.

**PICS.** `MCORE.DD.SCAN_QR_CODE` asks whether the commissioner takes the *scanned* payload — the
`MT:…` form — rather than only the digits of a manual pairing code. Both controllers do, so both
declare it; it is not a question about owning a camera. `MCORE.ROLE.COMMISSIONER`,
`MCORE.DD.QR_COMMISSIONING` and `MCORE.DD.MANUAL_PC_COMMISSIONING` come from the overlay too: CHIP's
`ci-pics-values` describes a device and answers 0 to all three, so without it every DUT-as-commissioner
test would be filtered out. `MCORE.DD.CTRL_CONCATENATED_QR_CODE_1` is declared 0 — neither controller
splits a concatenated payload, which is the one piece of § 5.1.6 missing here.
`CTRL_CONCATENATED_QR_CODE_2` (does the commissioner *tell the user* to commission the devices
individually) is deliberately left to the device's file: the adapters' own refusal says exactly that,
but nothing here proves a user ever sees it.

**The plan's 255-character payload is the specification's own maximum.** § 5.1.3.2: a single product's
onboarding payload "SHALL NOT exceed 255 characters", yielding 1208 bits and "1120 bits (140 octets) of
TLV payload". That arithmetic only works with the `MT:` prefix counted — 252 base38 characters are 151
bytes, of which the fixed structure takes 11 — so the TC's payload is 255 characters including the
prefix and carries the full 140 TLV octets.

`QrPairingCodeCodec.encode` refuses anything longer (`MATTER_QR_CODE_SINGLE_PAYLOAD_MAX_LENGTH`,
`PairingCodeSchema.ts`) — it used to measure that against the base38 characters alone and so admitted
three characters over the limit, which this TC's own arithmetic exposed. Decoding bounds nothing at
all, which is what lets `Test_TC_DD_1_8.yaml`'s own (older, larger) 1000-byte TLV example still parse.
The TC asserts the length it built rather than trusting the arithmetic, since a filler byte count that
misses lands on a payload the plan did not ask for.

**Onboarding the same TH twice: factory reset it between attempts.** A chip TH does not return to
commissioning mode when its last fabric goes — after `RemoveFabric succeeds` its log stops there, and
the next commissioning fails as `No device could be commissioned (1 of 1 started attempt(s) failed, 1
discovered)` against a stale advertisement. The plans cover this with a precondition ("place the TH
back into commissioning mode using the TH manufacturer's means"), and for a TC that drives everything
itself that means asking the device for a factory reset:

```ts
await cx.controllers.dut.node(ref).decommission();
if (th.flavor !== "matterjs") {
    const from = th.log.mark();
    await th.backchannel({ name: "factoryReset" });
    // wait for the restarted app's own SetupQRCode line before any mDNS check
}
```

Three things about that shape are load-bearing. The fabric comes off first, so the controller never
holds a peer for a fabric the device has forgotten — a later `decommissionAll` against a wiped device
fails. The matterjs leg is excluded because it is already back in commissioning mode, and erasing it
would restart a TH that needs nothing. And the wait for the restarted app matters because
`ChipLocalDevice.start()` returns when the *process* is up, not when the app is, while
`checkCommissionable` primes from the DNS-SD names already cached — so without it the check can be
answered by an advertisement the generation that just died had published.

Earlier revisions instead opened a *basic* commissioning window and then removed the fabric, which
works on paper but publishes `_matterc._udp` twice inside about 15 ms; avahi calls that a name
collision and withdraws the service, so the TH ends up advertising nothing. That was an intermittent
failure of this helper on the own-built leg, root-caused from the TH's own log in the evidence bundle
and filed upstream.

**A factory reset is not the same operation on every flavor**, which is why it is the *device* that
implements it, behind one `BackchannelCommand`:

| Flavor | `factoryReset` | `reboot` |
| --- | --- | --- |
| `chip-local` | stop, drop the storage directory holding `chip_kvs`, start | stop, start (store kept) |
| `chip-docker` | stop, start — the store lives in the container's own filesystem, which the composition discards | refused: it cannot keep the store, so a caller wanting one must use `chip-local` |
| `matterjs` | `Node.erase()`, which goes offline, resets storage and comes back | close, reinitialize, start |

**A stop the harness asked for is not a crash.** `CertDevice.exit` settles only for an exit nobody
asked for, so `cert-test.ts`'s exit watch survives a step restarting a device and still fails the run
if the device does not come back. This is what makes a restart from inside a step possible at all;
TC-DD-3.20's "manufacturer's means" precondition needs nothing further.

**On a developer host, limit mDNS to one interface.** With VPN tunnels up (`utun*`), a local run of the
whole cert suite floods `UDP send timeout`/`EMSGSIZE` on every extra interface, stretches a 1m 40s run to
12–20 minutes, and turns timing-sensitive steps in unrelated TCs into failures — including the
harness's own "process did not exit cleanly" check. `MATTER_MDNS_NETWORKINTERFACE=en0` (matter.js's
`mdns.networkInterface` variable) is what makes a local run representative; CI runners have one
interface and need nothing.

**And an mDNS gate after the removal.** `decommission()` returns as soon as the TH answers
`RemoveFabric`; the TH re-advertises itself commissionable a moment later, and a discovery started
before that finds only devices this run is not looking for — every cert TH in the process uses
discriminator 3840, which is all discovery matches on. `expectMdns(th, { commissionable: true })`
before the next attempt closes that race and records the wait as the step's own network evidence.

## The commissioning-flow block shares one support module (`TC-DD-3.21`)

Everything the DD plans repeat — reading the TH's own payload, recording what the DUT parsed out of
it, waiting for the commissionable advertisement, and onboarding from a payload — lives in
`tc-dd-support.ts`, on the same "a second TC needs the same shape" trigger every other promotion in
this file followed. `record` (record a check, throw if it failed) moved to `tc-support.ts` at the same
time, since three TCs had their own copy.

**Read the TH's endpoint topology, don't assume it.** TC-DD-3.21 needs every endpoint implementing the
On/Off light device type. Both flavors happen to put one on endpoints 1 and 2, but that is a
requirement the plan states of the *TH*, so the TC walks `Descriptor.partsList` and each endpoint's
`Descriptor.deviceTypeList` for device type 0x0100 instead of naming endpoints. A TH that stops
satisfying the precondition then fails the step that says so, rather than silently proving less: the
step also asserts the plan's own "at least 2".

## A refusal must be the controller's own (`TC-DD-3.14`)

The negative payload plans all read "DUT parses the code and terminates the commissioning process".
The only way to record that is to hand the payload to `commission()` and require a rejection — and
that only proves something about the DUT if the DUT is what refused, for the reason under test.

`ChipToolControllerAdapter.commission` used to run every payload through matter.js's own codec first
(`singleQrPayload`), so on a chip-tool leg matter.js refused before chip-tool ever saw the code, and
the evidence would have carried matter.js's message under chip-tool's name. It now calls
`assertSingleQrPayload`, which refuses a **concatenated** code and judges nothing else: that one is
the harness's to refuse, because chip-tool told to pair one device from such a code silently pairs
whichever answers first. Everything else reaches chip-tool, which rejects it in
`SetupPayload::FromStringRepresentation` — captured in this TC's own evidence as
`src/setup_payload/SetupPayload.cpp:361: CHIP Error 0x0000002F: Invalid argument` for an unsupported
version and each forbidden passcode, and as `ManualSetupPayloadParser.cpp:46: CHIP Error 0x00000013:
Integrity check failed` for a prefix that is not `MT:` (chip-tool treats a non-`MT:` code as a manual
one). matter.js rejects the same three in `QrPairingCodeCodec`, inside a millisecond.

**"It failed" is not the assertion; "it refused this payload" is.** `expectRejection` takes an
`accept` predicate, and `CommissioningRefusals` accepts only `OnboardingPayloadRefusedError`. Without
a predicate the steps pass on a controller that crashed, timed out or was never asked —
`ChipToolClient.execute` alone has a 3-minute budget whose expiry is a rejection like any other, and
both adapters refuse these payloads before touching the network, so the steps would also pass with no
TH running at all.

**Neither controller's own error types are enough, and this is the subtle part — it caught two
rounds of review.** chip-tool funnels discovery, PASE, attestation, CASE, timeout and argument-parse
failures into one `ChipToolCommandError`; matter.js raises `UnexpectedDataError` from the
commissioning flow as well (`ControllerCommissioningFlow.ts`'s "Invalid response from device", for
one). Accepting either type means a commissioner that *took* a forbidden passcode and only then
failed its handshake is recorded as having refused the code — the exact false pass this TC exists to
prevent, reintroduced through the check meant to prevent it.

So the refusal is marked **where it happens**, never recognised by type afterwards.
`OnboardingPayloadRefusedError` (`onboarding-payload.ts`) is the one marker, raised by both adapters:

- matter.js — `refusalOf()` wraps the codec call in `singleQrPayload` and in the manual-code branch of
  `resolveCommissioningTarget`, so only the codec's own rejection carries it.
- chip-tool — `commission()` matches `Run command failure: src/setup_payload/` in the command's logs.
  `SetupPayload::FromStringRepresentation` is where chip-tool applies § 5.1's payload rules and it
  names its own source location; that location is the only discriminator chip-tool offers.

Real evidence from all four legs: `chip-tool refused the onboarding payload for node 4097: Run command
failure: src/setup_payload/SetupPayload.cpp:361: CHIP Error 0x0000002F: Invalid argument`, and
`Refused onboarding payload MT:034J042C00KA0648G00: Unsupported onboarding payload version 2`.

**A negative check needs a bound and a cleanup path.** `expectRejection` (promoted from
`TC-CADMIN-1.17` to `tc-support.ts`, now taking its own timeout) reports `"fail"` for a call that
neither resolved nor rejected — verified by deleting matter.js's passcode validation, where step 5.b
turned into "neither resolved nor rejected" rather than hanging the run. `CommissioningRefusals`
keeps every attempt it started and `settle()` decommissions the fabric of any that succeeded after
its own budget expired; it owns those refs rather than writing them into the TC's `CommissionedRefs`,
which holds one ref per role and would collapse two stray fabrics into one. Its budget is under
`CertTest`'s own 2-minute finalization timeout, and deliberately does not try to outwait a chip-tool
command stuck in its 3-minute one — a controller stuck that long has left the TH in a state this run
cannot report on, which is what the `CertCleanupError` says.

**Building a payload the encoder refuses to write.** Every value these plans substitute — a non-zero
version, the twelve trivial passcodes — is exactly what `QrPairingCodeCodec.encode` validates
against, so `qrPayloadWith` writes the bits into the decoded structure directly (§ 5.1.3.1 Table 59's
own offsets) and re-encodes base38, carrying any appended TLV data through untouched. The plan prints
its own expected payload for each substitution against its example code; `tc-dd-support.test.ts`
asserts all thirteen of them, which is what caught the first version of the bit writer setting bits
without clearing them.

**Steps 3 and 4 substitute the discovery bitmask — they are not skippable.** They read as a
precondition on the TH ("ensure the TH's Discovery Capability bit string is NOT set to BLE"), but for
a TC that drives everything itself that is one more substitution, and `qrPayloadWith` takes
`discoveryCapabilities` for it. It is load-bearing rather than cosmetic: `chip-all-clusters-app`
publishes a **BLE-only** bitmask (`0b00000010`), so on that TH the precondition does not hold at all
and an unsubstituted step 3.a fails. With the OnNetwork form both steps commission for real and
record the DUT onboarding the TH over IP, which is the plan's own expected outcome.

Their `pics` (`MCORE.DD.DISCOVERY_BLE`, `MCORE.DD.DISCOVERY_PAF`) gates on every flavor, and every
flavor answers it from the same file: CHIP's `ci-pics-values` says `DISCOVERY_PAF=0`, so step 4 is a
PICS skip everywhere and the run reports `picsSkips: 2`. Do **not** answer these from a controller
overlay to force a skip — a test asserts that neither adapter declares them, because `certPicsFile()`
feeds every cert test's report, so a device-scoped key set there makes every other run's evidence claim
something false about its TH. And note `notApplicable` is evaluated *before* both the `flavors` and
the PICS gate in `cert-test.ts`, so a step carrying both never evaluates its PICS on any flavor —
combining them documents nothing and hides the gate that would otherwise fire.

## The manual-code block (`TC-DD-3.17`)

**No subject publishes a 21-digit manual code.** A device on the standard commissioning flow prints
the 11-digit form, and §5.1.4.1 Table 64's longer form is what these plans test. `thManualPairingCode`
renders the TH's own identity — the same discriminator and passcode — in the longer form, which is
what the plan's own preconditions describe. On the harness devices that produces *exactly* the codes
the plan prints, because they share its example identity (discriminator 0xF00, passcode 20202021,
vendor 0xFFF1, product 0x8001). `manualPairingCode` lays the digits out against Table 62 rather than
encoding, since every negative case substitutes a value `ManualPairingCodeCodec` refuses to write, and
`tc-dd-support.test.ts` asserts all 22 codes the plan prints against it.

Two of those printed codes corrected the first implementation, and both are easy to get wrong again:

- **A reserved version is a first digit of 8**, not a bit set beside the other fields. A decimal digit
  holds 0-9, so the marker displaces the discriminator bits and `VID_PID_PRESENT`; CHIP only ever
  checks `chunk1 == 8 || chunk1 == 9`. Hence `futureFormat`, not a numeric version.
- **`VID_PID_PRESENT` and the identity digits must be settable independently.** A code where they
  disagree is precisely what step 3 tests, so a builder that drops the tail when the bit is clear
  cannot express it.

**"Terminates commissioning" is two different claims, and they need two different checks.** Steps 2,
3, 5, 7 and 8 are payload refusals — `requireRefusal`, accepting only `OnboardingPayloadRefusedError`.
Step 4 hands over a well-formed code naming a device that is not there, so the DUT fails for lack of a
commissionee; `requireNoCommissioning` accepts any failure there and only a *success* fails the step.
The evidence keeps them apart: on chip-tool, steps 3/7/8 record `Run command failure:
src/setup_payload/…` while step 4 records a bare command failure.

**Step 4 needs a discovery bound, not a longer wait.** matter.js looks for a commissionable device for
the specification's 3-minute minimum commissioning window (`CommissioningDiscovery` defaults
`timeout` to `Minutes(3)`), so a step budget under that reports "neither resolved nor rejected" — as
it did until `CommissioningTarget.giveUpAfterMs` was added. matter.js maps it to that discovery
timeout; chip-tool cannot be bounded and says so, stopping on its own after ~30s, so the step's own
budget has to outlast chip-tool rather than matter.js.

**Step 6: a manual code's vendor id is not informational, and both controllers act on it.** The
obvious reading — "no commissioner matches a code's vendor id against the device it found" — is false
for chip-tool: `SetUpCodePairer::NodeMatchesCurrentFilter` (`src/controller/SetUpCodePairer.cpp`)
skips a discovered device whose advertised vendor or product id disagrees with the code's, so a code
naming another vendor finds nothing and chip-tool gives up after its 30s discovery budget. It is
false for matter.js too: `resolveCommissioningTarget` hands the code's `vendorId`/`productId` to
`peers.commission`, whose discovery passes over a device whose advertisement disagrees, and the attempt
ends in `DiscoveryError` after `giveUpAfterMs`. **The plan's expected outcome admits both
outcomes** — terminate, "unless the user is made fully aware of the security risks" — so the step
records which happened instead of asserting one.

Two things the step's evidence has to say, and did not until it was made to. A `DiscoveryError` or a
chip-tool command failure is what termination looks like, but so is a TH that stopped advertising, so
`recordVendorOutcome` proves the TH is advertising commissionable immediately before each attempt (the
`restoreCommissioningMode` that precedes it only does so for a code that follows an onboarding). And
one of `TEST_VENDOR_IDS` is the vendor id a harness TH advertises for itself, so that code is step 1's
code and its outcome says nothing about a substituted id — the detail now says which of the two the
attempt was.

**All four codes go to the DUT, which needs the TH restored between them.** The plan says "provide
each", and an attempt that onboards leaves the TH out of commissioning mode for the next one — so
`recordVendorOutcome` runs the same open-window-then-remove dance `commissionByTarget` does, hoisted
into `restoreCommissioningMode`. A first version handed over only two of the four codes; a reviewer
caught it.

Two traps behind that, both of which a green run hid at first:

- **Substituting the TH's own vendor id substitutes nothing.** `thCodeParts` reads VID/PID back from
  the TH, so `0xFFF1` on a harness device reproduces step 1's code byte for byte and the step
  commissions from an unmodified code while claiming to test a substitution. A reviewer caught that.
- **Fixing it turned the chip legs red**, which is what exposed the vendor-matching behaviour above.
  Do not "fix" a failure there by reverting to the matching id — that restores a step that proves
  nothing.

**`requireNoCommissioning` must refuse a payload refusal.** Without the complementary predicate every
outcome that satisfies `requireRefusal` also satisfies it, so a malformed generated code would make
step 4 pass at ~1ms having never reached discovery. The two checks are only a partition because the
predicate says so.

## chip-tool delivers one result per async report and discards the rest

`step 4: write 1/3 … produced no subscription report carrying "tc-idm-4-1-a" within 30s`,
intermittently, on the chip-tool controller against a matterjs device — about half of full-suite runs
locally, once in CI.

**Root cause**, readable in chip-tool's own source and corroborated by a traced reproduction (add a log
line to `ChipToolClient`'s frame handler and `ChipToolControllerAdapter.#dispatchReports`, then run the
whole suite with `MATTER_CERT_CONTROLLER=chip-tool` until a run fails — roughly one in two): while no
command runs, the client parks an async-report frame (`ChipToolClient`). chip-tool's
`InteractiveServerCommand::LogJSON` (`examples/chip-tool/commands/interactive/InteractiveCommands.cpp`)
sends the reply and calls `Reset()` on the **first** result recorded in that mode, and `Reset()` clears
`mEnabled`, after which `MaybeAddResult` drops the rest. One parked frame yields exactly one attribute;
a numeric park does not batch, its timer only logs a timeout error. matter.js reports every changed
attribute of a cluster in one `ReportData`, and writing `nodeLabel` bumps the whole `BasicInformation`
data version, so step 3's still-live subscription on `localConfigDisabled` rides along and can win the
race. Nothing on the client side recovers the dropped result.

**What the plan actually asks for is the TH's own view**: "verify on the TH that the status response
received from the DUT for every report data sent is a Success". So the fix is to read that from the
device, as the chip flavors already did, rather than from a controller callback. `expectSubscriptionId`
and `expectReportAck` now have matterjs branches:

- `Message » for: I/SubscribeResponse sub#: <id>` names the subscription.
- `Message » for: I/ReportData sub#: <id> attr: N` (or `ev: N`) is a report carrying data; the
  keepalive an idle subscription sends at its maximum interval is marked `empty` and must not stand in
  for one. chip draws the same line differently: a report prints `AttributeReportIBs` (or
  `EventReportIBs`) right after its subscription id, where a keepalive prints
  `InteractionModelRevision`, so `expectReportAck` requires that data line on both flavors. A
  chip-local TC-IDM-4.1 run's device log carries six keepalives on the subscriptions the steps use, so
  this is a window that really opens, not a theoretical one.
- `Message « for: I/StatusResponse … acked: <that report's counter> … payload: 152400 00` is the DUT's
  answer to **that** report — matter.js names the acked message counter, which is a tighter correlation
  than the chip path's exchange id — and the byte after `152400` is the status, `00` being Success.

Two traps in those lines. matter.js renders a subscription id through `Subscription.idStrOf`, which is
`hex.fixed(id, 8)` — an id built with a plain `toString(16)` matches no line at all whenever the id has
fewer than eight significant digits. And an event report says `ev:` where an attribute report says
`attr:`, which TC-IDM-6.4 needs.

With the device's own log carrying every write, `subscribeAndModify` does not fail a step outright when
the controller's `onUpdate` callbacks come up short — it records that as `"unverified"` with the
counts, and states the gap as `accepted` only under chip-tool, whose interactive server is known to
hand over just the first result of a batch. On any other controller the shortfall is that controller's
own defect, so the check stands unaccepted and fails the run. A report carrying a value nobody wrote is
still a failure. What this gives up: a controller that delivered the values out of order is no longer
caught, which the plan never asked about anyway.
