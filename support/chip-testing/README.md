# Chip Tool Testing

This package allows to run Chip tool certification tests and Python REPL tests against matter.js to validate the interoperability of
the implementation. This is done by providing comparable "Apps" - currently a limited "All-Clusters-App" and a "Bridge-App" like the examples used in the Matter-SDK.

The Available Tests in Chip tool are listed in the [Chip tool test catalog](https://github.com/project-chip/connectedhomeip/tree/master/src/app/tests/suites/certification).

## Prerequisites

In order to execute the tests you need to have used the connectedhomeip repository and have build a "chip-tool" binary. This binary and a lot more from the matter SDK is needed to execute the tests. This is because we use the same Python based test runner and framework.

Currently the tests are designed to work with a chip-tool and test framework compiled from the "master" of the connectedhomeip repository. This is needed because only this version includes all needed features and fixes. But this also means that the YAML files and PICS file used in master branch is not compliant with matter.js for now (unless we update to Matter 1.2+).

Please follow these steps to setup all this locally:

-   [Checkout Matter-SDK](https://github.com/project-chip/connectedhomeip/blob/master/docs/guides/BUILDING.md#checking-out-the-matter-code)
-   [Prepare for building](https://github.com/project-chip/connectedhomeip/blob/master/docs/guides/BUILDING.md#prepare-for-building)
-   Build chip-tool in an activated environment `./scripts/build/build_examples.py --target=linux-x64-chip-tool build` (replace linux by darwin if you run on macOs.)
-   Build Python Environment in an activated environment `./scripts/build_python.sh --install_virtual_env out/venv`
-   Copy the patched yaml files from support/chip-testing/patched-test-files to src/app/tests/suites/ (in connectedhomeip directory)
-   build matter.js so that the test binaries are also built

## Execution

### Executing YAML based tests locally

You can execute tests starting from the connectedhomeip directory (without activating the sdk environment) by using:

`scripts/run_in_build_env.sh 'scripts/tests/run_test_suite.py --runner chip_tool_python --log-level info --target-glob "{...tests...}" run --app-path all-clusters:<path-to-matter.js>/support/chip-testing/dist/esm/AllClustersTestApp.js --app-path bridge:<path-to-matter.js>/support/chip-testing/dist/esm/BridgeTestApp.js'`

Replace the "<path-to-matter.js>" placeholder with the local path to your matter.js repository.

Running all tests available right now (End january 2024) the normal "...tests..." would be
`--target-glob {Test_AddNewFabricFromExistingFabric,Test_TC_BINFO*,Test_TC_BRBINFO*,Test_TC_CADMIN*,Test_TC_CGEN*,Test_TC_CNET*,Test_TC_DESC*,Test_TC_?LABEL*,Test_TC_OO*,Test_TC_OPCREDS*,TestArmFailSafe,TestBasicInformation,TestCASERecovery,TestCommandsById,TestCommissioningWindow,TestFabricRemovalWhileSubscribed,TestGeneralCommissioning,TestMultiAdmin,TestOperationalCredentialsCluster,TestSelfFabricRemoval,TestSubscribe_*,TestUserLabelCluster*,TestDiscovery}`

Additionally, some manual (long running) tests can be executed by using these parameters

`--target-glob "{Test_TC_CADMIN_1_3,Test_TC_CADMIN_1_4,Test_TC_CADMIN_1_5,Test_TC_CADMIN_1_6,Test_TC_CADMIN_1_9,Test_TC_CADMIN_1_10,Test_TC_CADMIN_1_16,Test_TC_CADMIN_1_23,Test_TC_CADMIN_1_24}" --include-tags MANUAL`

The tests Test_TC_CADMIN_1_21 and Test_TC_CADMIN_1_22 cannot be executed because of an issue of the yaml test runner.

### Executing python REPL tests locally

The python tests are located inside the connectedhomeip repository as single python scripts. there is no runner or such. They are executed as needed by e.g. (for test CGEN_2_4)

`scripts/run_in_python_env.sh out/venv './scripts/tests/run_python_test.py --app <path-to-matter.js>/support/chip-testing/dist/esm/TestDeviceNode.js --factoryreset --app-args "--discriminator 1234 --KVS /tmp/kvs" --script "src/python_testing/TC_CGEN_2_4.py" --script-args "--storage-path admin_storage.json --manual-code 10054912339 --PICS src/app/tests/suites/certification/ci-pics-values --commissioning-method on-network"'`

The list of available test and their relevant parameters can be seen in the project-chip repository github test, e.g. https://github.com/project-chip/connectedhomeip/blob/160ed14cae009de51e5117dbf4abc2c6af6a6f53/.github/workflows/tests.yaml#L452 (this is a static link, make sure to check the latest master version!)

## Executing via CI

These tests are executed against the main branch of matter.js at the following conditions:

-   every night by schedule
-   can also be triggered on the main branch by using the "Chip Tool tests" workflow on GitHub.
-   When files are changed in some relevant folders (clusters, tlv) or in the chip-testing directory itself

Additionally, the tests can be triggered when the commit contains special keywords in the commit message. The following keywords are supported:

-   `[execute-chiptests]` to execute the tests on the current branch
-   `[execute-chiptests-long]` to execute the tests on the current branch including the long running tests
-   `[rebuild-chip]` to rebuild the chip-tool executable from the connectedhomeip repository used by the CI (Attention: this needs morre time!) The chip binaries are cached and only built once a day.

## Choosing a CHIP binary source

By default, every CHIP binary a test run touches — the `chip-tool` the classic yaml/python tests
above drive, and the `chip-<app>-app` DUT binaries `test/cert/`'s `chip-local` flavor spawns — comes
from matter.js's own build (`ghcr.io/matter-js/chip*`, or a directory you built yourself). Setting
`MATTER_CHIP_BINS_SOURCE=cert-bins` switches both to project-chip's official
[`connectedhomeip/chip-cert-bins`](https://hub.docker.com/r/connectedhomeip/chip-cert-bins) image —
the same binaries the official Matter Test Harness certifies against — instead.

| Variable                 | Meaning                                                                                    | Default                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `MATTER_CHIP_BINS_SOURCE` | Binary source: `matterjs` (unchanged default) or `cert-bins`.                                | `matterjs`                                     |
| `MATTER_CHIP_BINS_TAG`    | `chip-cert-bins` tag to use — every tag is a connectedhomeip commit SHA; `latest` resolves the newest SHA via the Docker Hub tags API at run time (a live network call, so not the default). | a maintainer-vetted pinned SHA |
| `MATTER_CHIP_BINS_DIR`    | Host base directory binaries are extracted into. Each tag gets its own subdirectory below it (`<MATTER_CHIP_BINS_DIR>/<tag>`), cached in and keyed by a stamp file recording the extracted tag. | `<tmpdir>/matter-js-chip-cert-bins`            |

Extraction (`docker pull` + a short-lived `docker run -v ... cp -a`, mirroring the official Test
Harness's own `update-sample-apps.sh`) is lazy and cached: it runs once per distinct tag and is a
no-op on every subsequent run against that tag's subdirectory. Scoping by tag this way means two
tags sharing one `MATTER_CHIP_BINS_DIR` can never clobber each other's files or stamp. It always
requests `linux/arm64` — `chip-cert-bins` has never published any other platform — regardless of host
architecture; on a non-arm64 host Docker runs the (harmless, `cp`-only) extraction step under
emulation.

Extraction has no cross-process lock: two runs racing to extract the *same* tag into the same
`MATTER_CHIP_BINS_DIR` at once can still interleave their `rm -rf`/`cp -a`/stamp-write. Don't point
concurrent test runs that might resolve to the same tag at one `MATTER_CHIP_BINS_DIR` — give each its
own directory (or its own `MATTER_CHIP_BINS_TAG`) if they run at the same time.

Running the extracted binaries afterwards is a different story per consumer, since architecture and
OS constraints differ by how each one executes them:

| Consumer                                   | How it runs the binary                          | Works on darwin-arm64 (this repo's dev host)?                                       | Works on Linux (amd64 CI, arm64 CI/Pi)?                                                        |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Classic yaml/python tests (`chip/state.ts`) | bind-mounted into the harness `chip` **container** | No — matter.js's own harness image is amd64-only; the mismatch is caught up front (see below), not left to fail deep inside a run | Only if the harness `chip` container itself also runs `linux/arm64` (an amd64 host needs a published or self-built arm64 harness image — not published today) |
| `chip-local` cert-test subjects             | spawned directly as a **host** process, no container | No — the extracted binaries are Linux ELF; macOS can't execute them at all              | Yes on arm64 natively; on amd64 only if the host has `binfmt_misc`/qemu-user-static registered for aarch64 |
| `chip-docker` cert-test subjects            | not wired to `cert-bins` — unaffected by this source selector; see the Flavors section below | n/a                                                                                    | n/a                                                                                                 |

Both mismatch cases above are checked directly (not just documented): `configureContainer()`
(`chip/state.ts`) rejects a platform mismatch before spending time on extraction, and
`resolveChipLocalAppDir()` (`chip/cert/chip-app-subject.ts`) rejects a non-Linux host before
spawning. Either way you get an explicit, actionable error rather than a binary that silently fails
to start.

A cert-bins-sourced `chip-local` run's evidence `chipRef` (see "Evidence" below) is populated
automatically from the extraction's own stamp file — no separate wiring needed.

## Certification controller tests (`test/cert/`)

The tests above all drive chip-tool/python against matter.js acting as the **device**. `test/cert/`
is the reverse: matter.js's own controller stack (an in-process `CommissioningController`) is the
DUT, and each `TC-*.test.ts` drives a real certification test plan's steps against a **TH**
(test harness) implementation — either a real `chip-<app>-app` binary or a matter.js test app,
depending on flavor. This validates matter.js as a **controller**, not just as a device.

### Flavors

Which TH implementation a run uses is chosen by `MATTER_CERT_DEVICE`:

-   **`matterjs`** — TH is an in-process matter.js `TestInstance` (e.g. `AllClustersTestInstance`).
    No Docker, no external binary; the fastest loop for iterating on a TC's own step logic. Not a
    certification claim by itself — see `test/cert/AGENTS.md`'s "Flavor policy" section.
-   **`chip-local`** — TH is a real `chip-<app>-app` binary, spawned as a local child process.
    Needs `MATTER_CERT_APP_DIR` pointed at a directory containing the binaries (built from a
    connectedhomeip checkout, e.g. `.../out/darwin-arm64-all-clusters/chip-all-clusters-app`). This
    is the flavor that actually produces chip-side evidence today. Set
    `MATTER_CHIP_BINS_SOURCE=cert-bins` (see "Choosing a CHIP binary source" above) to use the
    official `connectedhomeip/chip-cert-bins` binaries instead of a directory you built yourself —
    on a supported host this needs no other configuration; `MATTER_CERT_APP_DIR` is ignored in that
    mode.
-   **`chip-docker`** — TH runs in a Docker container, `ghcr.io/matter-js/chip-<app>:latest`. **Not
    functional end-to-end right now**: only the shared `ghcr.io/matter-js/chip:latest` harness image
    (used by the YAML/python tests above) is published; no per-app image
    (`ghcr.io/matter-js/chip-all-clusters`, `chip-bridge`, …) exists yet, so starting this flavor
    fails immediately with `No such image: ghcr.io/matter-js/chip-all-clusters:latest (404)`. The
    other blocker — `ChipDockerDevice` starting a duplicate `dbus`/`mdns` sidecar pair instead of
    reusing `chip/state.ts`'s harness sidecars — is resolved; publishing the per-app images is what
    remains.

`MATTER_CERT_DEVICE` unset defaults to `matterjs` (`resolveDeviceFlavor` in
`packages/testing/src/chip/cert/device-config.ts`) — the only flavor that works without further
configuration; the other two need `MATTER_CERT_APP_DIR`/`MATTER_CHIP_BINS_SOURCE` (`chip-local`)
or per-app images that aren't published yet (`chip-docker`). So a plain run exercises the
matterjs TH:

```
npm run test-cert
```

For real chip-side evidence, build the app(s) a TC needs from a connectedhomeip checkout (see
"Prerequisites" above) and point at the output directory:

```
MATTER_CERT_DEVICE=chip-local MATTER_CERT_APP_DIR=/path/to/connectedhomeip/out/darwin-arm64-all-clusters npm run test-cert
```

A single `MATTER_CERT_APP_DIR` only supplies one directory's worth of binaries; a full `test-cert`
run spans TCs needing different apps (`all-clusters`, `bridge`, …), so running the whole suite
against `chip-local` needs a directory containing every app binary the suite's TCs use (e.g. a
directory of symlinks to each app's own build output).

### Environment variables

| Variable                     | Meaning                                                                                   | Default                        |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| `MATTER_CERT_DEVICE`          | Flavor: `matterjs`, `chip-local`, or `chip-docker`.                                        | `matterjs`                      |
| `MATTER_CERT_APP_DIR`         | Directory containing `chip-<app>-app` binaries (`chip-local` only, ignored when `MATTER_CHIP_BINS_SOURCE=cert-bins` — see "Choosing a CHIP binary source" above). | none (required for `chip-local`) |
| `MATTER_CERT_CHIP_IMAGE_BASE` | Docker image base name for `chip-docker` (image pulled is `<base>-<app>:latest`).          | `ghcr.io/matter-js/chip`        |
| `MATTER_CERT_EVIDENCE_DIR`    | Where `result.json`/`*.log` evidence bundles are written.                                  | `<package cwd>/cert-evidence`   |
| `MATTER_CERT_TH_SERVER_APP_PATH` | Container-side path to a TH_SERVER binary for python-wrapped TCs (e.g. `TC-SC-3.5`); unset means the TC self-skips. | none |

### Running

```
npm run test-cert                                                                            # matter-test --spec=test/cert/**/*.test.ts --report
MATTER_TEST_SHUTDOWN_TIMEOUT_MS=15000 npx matter-test --spec="test/cert/TC-IDM-2.1.test.ts"  # a single TC
```

Both need the shared dbus/mdns/chip harness containers, so Docker still has to be running even for
the `matterjs` flavor.

`test-cert` sets `MATTER_TEST_SHUTDOWN_TIMEOUT_MS=15000` itself, giving decommissioning fabrics more
than `matter-test`'s 5s package-wide default to finish closing (see `test/cert/AGENTS.md`'s "Resolved:
exit-101 flake" section for why). A single-TC run via `npx matter-test --spec=...` bypasses that
script, so set the same variable yourself, as in the example above.

### Continuous integration

The [`Chip Certification Controller Tests`](../../.github/workflows/chip-cert-tests.yml) workflow
runs this suite in CI:

-   **Daily**, on a schedule.
-   **On demand**, via the workflow's `workflow_dispatch` trigger — inputs let you pick a ref,
    choose which `chip-local` binary source(s) to exercise (`cert-bins`, `own-built`, or `both`),
    and override the `chip-cert-bins` tag.
-   **After every published release** (official or nightly dev), checked out at that release's
    exact tag.
-   **On push**, when the head commit message contains `[execute-certtests]`.

Every run also exercises the cheap `matterjs` flavor (no Docker app binaries needed) alongside
whichever `chip-local` binary source(s) were selected. Evidence bundles
(`support/chip-testing/build/cert-evidence/**`, including attached device/controller logs) are
uploaded as job artifacts on every run, pass or fail, one per flavor/binary-source combination.

### Evidence

Each run writes `${MATTER_CERT_EVIDENCE_DIR}/<timestamp>-<tc>/result.json` plus one `<name>.log` per
attached log stream (`device-<role>.log`, `controller-<name>.log`). Sketch of `result.json`:

```json
{
    "tc": "TC-IDM-2.1",
    "plan": "interactiondatamodel.adoc",
    "run": {
        "timestamp": "2026-08-08T07:37:17.811Z",
        "controller": "dut",
        "device": "chip-local:all-clusters",
        "matterJsCommit": "25dd21a01533bd9434b0e8a42e6f96d9ba1ad878",
        "chipRef": "..."
    },
    "steps": [
        {
            "step": 1,
            "text": "...",
            "expected": "...",
            "checks": [{ "type": "response", "verdict": "pass", "detail": "VendorID = 65521" }],
            "verdict": "pass"
        }
    ],
    "verdict": "pass"
}
```

A run-level `verdict` is one of `"pass" | "fail" | "unverified" | "skipped" | "incomplete"`; a step's
is `"pass" | "fail" | "unverified" | "skipped" | "aborted"` (`"aborted"` for a step never reached
after an earlier one failed). A run-level `"skipped"` means every step was skipped (a flavor or PICS
gap) — not a failure.

`"unverified"` means the step ran without failing but one of its checks could not be evaluated, so it
observed less than it claims; the test itself then fails, and the run reads `"unverified"` unless
something stronger — a device that exited, cleanup or teardown that threw, evidence that could not be
assembled, another step that failed — makes it `"fail"`. A gap in what was observed must not read as
proof. A check whose claim the run genuinely cannot observe states why in its own `accepted` field,
which keeps its step at `"pass"`.

`"incomplete"` means the run never reached the point where its verdict is settled: a teardown that
hung, a process killed mid-run, a volume that stopped accepting writes. Treat it as a failure of the
run, not a statement about the device.

Alongside `verdict`, every run the harness reported as failed — `"unverified"` runs included — carries
`runError` (how the run's own runner reported the failure)
and, where they apply, `deviceExit`, `finalizationError` (cleanup threw), `teardownError` (a
controller or device would not close) and `evidenceError` (evidence the checks cite could not be
assembled). `unverifiedChecks` counts checks whose claim could not be evaluated at all, those that
stated a reason in `accepted` included, so it says how much the run left unobserved whatever the
verdicts say; `controllerUnsupportedSkips` counts steps the controller could not express, a gap in
what a passing run proved rather than a failure.

Every attached `.log` file also carries a step-boundary banner (chip python/yaml style) at the point
a step starts and again when it ends, e.g.:

```
----------------------------------------------------------------------
TC-IDM-2.1 — Test Step 1: Commission the DUT and read VendorID
----------------------------------------------------------------------
...real device/controller log lines for the step...
----------------------------------------------------------------------
TC-IDM-2.1 — Test Step 1: PASS
----------------------------------------------------------------------
```

These are synthetic lines the engine injects (`LogFollower.annotate`), not real device/controller
output — a step's own `log.expect()` never matches one, even against a catch-all pattern.
`result.json`'s shape is unaffected.

### Authoring a new `TC-*.test.ts`

See `test/cert/AGENTS.md` — source-lookup flow for translating a plan document, the DSL, the app
mapping table, PICS/flavor policy, and evidence expectations, with the four existing pilots
(`TC-IDM-2.1`, `TC-ACT-3.2`, `TC-CADMIN-1.17`, `TC-SC-3.5`) as worked examples. Report any test-plan
document discrepancy found along the way to the maintainer (todo/issue flow) rather than logging it
in-repo.

### Framework self-tests (`test/cert-framework/`)

`test/cert/` holds only real certification test plan translations — `test-cert`'s
`test/cert/**/*.test.ts` glob never runs anything else. Tests that exercise the cert framework
itself (the DSL, `LogFollower`, `EvidenceRecorder`, the chip-local/chip-docker device flavors, the
python-wrapped-test seam, …) live in the sibling `test/cert-framework/` directory instead, with
`npm run test-cert-framework`. Their ids are deliberately not `TC-*` (e.g. `FRAMEWORK-SMOKE`,
`FRAMEWORK-MDNS-CHECK`) so a reader never mistakes a framework self-test for a real certification
claim. CI runs `test-cert-framework` before `test-cert` in every flavor's job — the framework tests
are the prerequisite proof that the engine itself works before trusting what it reports for a real
TC.
