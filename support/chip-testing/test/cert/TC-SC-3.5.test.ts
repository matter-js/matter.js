/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Seconds } from "@matter/main";
import type { CertStepDefinition, CertStepWiring, PromptHandler, Subject } from "@matter/testing";
import {
    chip,
    createControllerAdapter,
    EvidenceRecorder,
    PromptDrivenPythonTest,
    resolveControllerSelection,
} from "@matter/testing";
import { join } from "node:path";
import { env } from "node:process";
import { CommissioningAttempts } from "./tc-sc-3.5-support.js";
import { CertCleanupError } from "./tc-support.js";

// setup_class's th_server_discriminator — fixed for every OpenCommissioningWindow call in the script.
// The passcode is NOT fixed the same way: only the initial precondition commission (TH_CLIENT pairing
// TH_SERVER, done entirely inside the container before any prompt) uses setup_class's th_server_passcode
// (20202021). Every later window (the ones DUT_Commissioner actually joins) is opened via
// OpenCommissioningWindow, which mints a fresh random passcode per call — the prompt text is the only
// place that passcode is ever exposed to us.
const TH_SERVER_DISCRIMINATOR = 1234;

/**
 * Bounds discovery of TH_SERVER and, on matter.js, PASE with it: far above both against a TH_SERVER that is present,
 * far below the 3-minute window a commissioner otherwise waits out. An attempt that cannot reach TH_SERVER so ends,
 * and its controller log says why, before the script gives up waiting for it after 90 s.
 */
const ATTEMPT_DISCOVERY_TIMEOUT = Seconds(30);

/** Windows the script opens: steps 1b, 2c, 3c and 5c always, plus 4c where the DUT's NOC chain has an ICAC. */
const MINIMUM_PROMPTS = 4;

const RUN = { tc: "TC-SC-3.5", plan: "securechannel.adoc" } as const;

const DESCRIPTOR = {
    kind: "py" as const,
    name: "TC-SC-3.5",
    path: "/src/python_testing/TC_SC_3_5.py",
    subpath: "test_TC_SC_3_5",
};

// Container-side path to a fault-injection-capable all-clusters-app binary (Linux, matching the
// container's platform) that TC_SC_3_5.py spawns itself as TH_SERVER. See AGENTS.md's "python-wrapped
// mode" section for exactly what the container image is currently missing.
function thServerAppPath(): string | undefined {
    return env.MATTER_CERT_TH_SERVER_APP_PATH;
}

function evidenceOutDir(): string {
    return env.MATTER_CERT_EVIDENCE_DIR || join(process.cwd(), "build/cert-evidence");
}

/**
 * Extracts the passcode from a "Manual Pairing Code" prompt line's own chip-tool hint
 * (`(chip-tool: pairing onnetwork <nodeId> <passcode>)`) — see the module doc comment on
 * {@link TH_SERVER_DISCRIMINATOR} for why this can't be a constant.
 */
function extractPasscode(promptText: string): number {
    const match = promptText.match(/\(chip-tool: pairing onnetwork \d+ (\d+)\)/);
    if (!match) {
        throw new InternalError(`Prompt line did not carry a chip-tool passcode hint: ${promptText}`);
    }
    return Number(match[1]);
}

/**
 * Handles every "Manual Pairing Code" prompt `TC_SC_3_5.py` prints — steps 1b, 2c, 3c, 4c, 5c (4c is skipped, and
 * never prompts, if DUT has no ICAC in its NOC chain). Each prompt starts one commissioning attempt on a fresh DUT
 * controller and answers the prompt without waiting for the attempt's outcome.
 *
 * The script judges each attempt itself, on TH_SERVER's side: step 1b by TH_SERVER completing commissioning, every
 * later step by TH_SERVER receiving the INVALID_PARAMETER status for its corrupted Sigma2 and by its commissioning
 * window still being open. A commissioner that retries the handshake would turn the DUT's own result into a success,
 * because each fault is armed for one handshake only, so the DUT's result is not evidence for the step.
 */
function manualPairingCodeHandler(attempts: CommissioningAttempts, evidence: EvidenceRecorder): PromptHandler {
    return {
        pattern: /Manual Pairing Code:.*\(chip-tool: pairing onnetwork \d+ \d+\)/,
        async action(cx: CertStepWiring, promptText: string) {
            // This file drives cx.recorder directly rather than through certTest()'s step engine, so nothing else
            // calls StepRecorder.beginStep/endStep — EvidenceRecorder.check() requires an active step.
            const stepDef: CertStepDefinition = {
                number: `attempt-${attempts.count}`,
                text: promptText,
                run: async () => {},
            };
            cx.recorder.beginStep(stepDef);

            let started;
            try {
                started = await attempts.start({
                    passcode: extractPasscode(promptText),
                    discriminator: TH_SERVER_DISCRIMINATOR,
                    giveUpAfterMs: ATTEMPT_DISCOVERY_TIMEOUT,
                });
            } catch (e) {
                cx.recorder.endStep(stepDef, "fail");
                throw e;
            }
            evidence.recordControllerBuild(started.build);

            cx.recorder.check({
                type: "response",
                verdict: "unverified",
                detail: `commissioning attempt ${started.index} started on a fresh DUT controller; its outcome is not awaited`,
                accepted:
                    "TC_SC_3_5.py judges the attempt on TH_SERVER's side, from the commissioning it completes or the " +
                    "INVALID_PARAMETER status it receives and from its commissioning window's state",
            });
            cx.recorder.endStep(stepDef, "pass");

            // TC_SC_3_5.py's wait_for_user_input() only blocks on a bare input() read (any text, or
            // none, satisfies it) — see AGENTS.md's "python-wrapped mode" section.
            return "\n";
        },
    };
}

// TC_SC_3_5.py gates every wait_for_user_input on PICS_SDK_CI_ONLY: with it set the script commissions TH_SERVER with
// a second python controller of its own instead of prompting, so no DUT is ever driven. chip.defaultPics composes
// CHIP's ci-pics-values, which sets it.
function promptDrivenPics() {
    const pics = chip.defaultPics.with({ PICS_SDK_CI_ONLY: 0 });
    // A PICS file listing a key twice keeps its trailing occurrence, which would discard this override in the one way
    // that leaves the run looking healthy.
    if (pics.values.PICS_SDK_CI_ONLY !== 0) {
        throw new InternalError(
            "Overriding PICS_SDK_CI_ONLY to 0 did not take effect, so TC_SC_3_5.py would commission TH_SERVER itself " +
                "instead of prompting the DUT",
        );
    }
    return pics;
}

function stubSubject(): Subject {
    return {
        id: "TC-SC-3.5",
        app: "",
        commissioning: { kind: "on-network", passcode: 0, discriminator: 0, qrPairingCode: "" },
        pics: promptDrivenPics(),
        async initialize() {},
        async start() {},
        async stop() {},
        async close() {},
        async snapshot() {
            return {};
        },
        async restore() {},
        async backchannel() {},
    };
}

describe("TC-SC-3.5", () => {
    it("[TC-SC-3.5] CASE Error Handling [DUT_Initiator]", async function () {
        const appPath = thServerAppPath();
        if (!appPath) {
            this.skip();
        }

        // The script's own default_timeout (25 min) is sized for a human operator; automated
        // handlers only need enough headroom for up to 5 controller starts and commissioning attempts.
        this.timeout(10 * 60_000);

        const selection = resolveControllerSelection();
        let bodyFailure: unknown;
        let flushFailure: unknown;
        let closeFailure: unknown;
        let concludeFailure: unknown;
        const attempts = new CommissioningAttempts(() => createControllerAdapter("dut", undefined, "dut", selection));

        const recorder = new EvidenceRecorder(evidenceOutDir(), {
            tc: RUN.tc,
            plan: RUN.plan,
            timestamp: new Date().toISOString(),
            controller: "dut",
            controllerImplementation: selection.dut,
            // The script spawns TH_SERVER itself, so the binary the run was pointed at is the only
            // provenance the harness can state for it.
            devices: [{ role: "th_server", app: appPath, flavor: "python-wrapped" }],
            matterJsCommit: "(not recorded)",
        });

        const cx: CertStepWiring = { controllers: {}, devices: {}, recorder };
        const test = new PromptDrivenPythonTest(
            DESCRIPTOR,
            chip.container,
            [manualPairingCodeHandler(attempts, recorder)],
            cx,
        );

        try {
            await test.invoke(stubSubject(), () => {}, ["--string-arg", `th_server_app_path:${appPath}`], false);

            // The script's own PASS does not depend on its prompts being answered, so a short count means faults it
            // injected were never put to the DUT.
            if (attempts.count < MINIMUM_PROMPTS) {
                throw new InternalError(
                    `TC_SC_3_5.py reported success after only ${attempts.count} of at least ${MINIMUM_PROMPTS} ` +
                        "commissioning prompts, so some of its fault-injected CASE handshakes were never attempted",
                );
            }
        } catch (e) {
            // Kept so the verdict this settles below is the one mocha will report: the steps here are
            // not the only way this test fails, and a failure outside them is invisible to the recorder.
            bodyFailure = e;
            throw e;
        } finally {
            try {
                await attempts.retire();
            } catch (e) {
                console.warn("TC-SC-3.5 could not close its last dut controller:", e);
                closeFailure = e;
            }
            if (closeFailure !== undefined) {
                recorder.teardownFailed(`TC-SC-3.5's last dut controller would not close: ${closeFailure}`);
            }

            for (const { name, lines } of attempts.logs) {
                recorder.attachLog(name, lines);
            }
            recorder.attachLog("device-python", test.logLines);

            // Warned as well as kept: the throw below is unreachable when the body itself threw, and a
            // failure to create the directory or name the record reaches nothing but the console.
            try {
                await recorder.flush();
            } catch (e) {
                console.warn("TC-SC-3.5 could not write its evidence bundle:", e);
                flushFailure = e;
            }

            // This test writes its own bundle instead of going through `CertTest`, so its record states
            // no verdict until it settles one here.
            const failure = bodyFailure ?? flushFailure ?? closeFailure;
            try {
                await recorder.concludeRun({
                    failed: failure !== undefined,
                    detail: failure === undefined ? undefined : `${failure}`,
                });
            } catch (e) {
                console.warn("TC-SC-3.5 could not settle its evidence record:", e);
                concludeFailure = e;
            }
        }

        // Reached only when the steps themselves succeeded, which is what makes these the run's own
        // outcome. Flush first, as `cert-test.ts` orders it: a run with no bundle proves nothing, where
        // a controller that would not close is state left for whatever runs next.
        if (flushFailure !== undefined) {
            throw flushFailure;
        }
        if (closeFailure !== undefined) {
            throw new CertCleanupError(`TC-SC-3.5's last dut controller would not close: ${closeFailure}`);
        }
        if (concludeFailure !== undefined) {
            throw concludeFailure;
        }
    });
});
