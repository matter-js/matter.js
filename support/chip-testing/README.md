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
    is the flavor that actually produces chip-side evidence today.
-   **`chip-docker`** — TH runs in a Docker container, `ghcr.io/matter-js/chip-<app>:latest`. **Not
    functional end-to-end right now**, for two independent reasons: only the shared
    `ghcr.io/matter-js/chip:latest` harness image (used by the YAML/python tests above) is
    published; no per-app image (`ghcr.io/matter-js/chip-all-clusters`, `chip-bridge`, …) exists
    yet, so starting this flavor fails immediately with
    `No such image: ghcr.io/matter-js/chip-all-clusters:latest (404)`. Separately, even once a
    per-app image exists, `ChipDockerDevice` (`chip-app-subject.ts`) starts its own `dbus`/`mdns`
    sidecar containers bound to the same `matter.js-mdns` Docker volume that `chip/state.ts`'s
    harness composition already starts its own `dbus`/`mdns` sidecars on for the whole test run —
    two `dbus-daemon`s contending for the same `/run/dbus` socket path needs de-duplication (e.g.
    reusing the harness's existing sidecars instead of starting a second pair) before this flavor
    can work. Unblocking it means both publishing those per-app images and de-duplicating the
    sidecars — neither implemented as part of this work.

`MATTER_CERT_DEVICE` unset defaults to `chip-docker` (`resolveDeviceFlavor` in
`packages/testing/src/chip/cert/device-config.ts`), which — until per-app images are published —
means an unset run fails rather than silently falling back. For a local, no-Docker-image loop, set
it explicitly:

```
MATTER_CERT_DEVICE=matterjs npm run test-cert
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
| `MATTER_CERT_DEVICE`          | Flavor: `matterjs`, `chip-local`, or `chip-docker`.                                        | `chip-docker`                   |
| `MATTER_CERT_APP_DIR`         | Directory containing `chip-<app>-app` binaries (`chip-local` only).                        | none (required for `chip-local`) |
| `MATTER_CERT_CHIP_IMAGE_BASE` | Docker image base name for `chip-docker` (image pulled is `<base>-<app>:latest`).          | `ghcr.io/matter-js/chip`        |
| `MATTER_CERT_EVIDENCE_DIR`    | Where `result.json`/`*.log` evidence bundles are written.                                  | `<package cwd>/cert-evidence`   |
| `MATTER_CERT_TH_SERVER_APP_PATH` | Container-side path to a TH_SERVER binary for python-wrapped TCs (e.g. `TC-SC-3.5`); unset means the TC self-skips. | none |

### Running

```
npm run test-cert                                    # matter-test --spec=test/cert/**/*.test.ts --report
npx matter-test --spec="test/cert/TC-IDM-2.1.test.ts" # a single TC
```

Both need the shared dbus/mdns/chip harness containers, so Docker still has to be running even for
the `matterjs` flavor.

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

`verdict` (both run-level and per-step) is one of `"pass" | "fail" | "skipped"` (steps also have
`"aborted"`, for a step never reached after an earlier one failed). A run-level `"skipped"` means
every step was skipped (a flavor or PICS gap) — not a failure.

### Authoring a new `TC-*.test.ts`

See `test/cert/AGENTS.md` — source-lookup flow for translating a plan document, the DSL, the app
mapping table, PICS/flavor policy, and evidence expectations, with the four existing pilots
(`TC-IDM-2.1`, `TC-ACT-3.2`, `TC-CADMIN-1.17`, `TC-SC-3.5`) as worked examples. Log any test-plan
document discrepancy found along the way in `test/cert/TESTPLAN-FEEDBACK.md`.
