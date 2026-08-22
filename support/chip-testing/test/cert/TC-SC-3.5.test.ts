/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Seconds } from "@matter/main";
import type { CertStepContext, CertStepDefinition, PromptHandler, StepVerdict, Subject } from "@matter/testing";
import {
    chip,
    createControllerAdapter,
    EvidenceRecorder,
    PromptDrivenPythonTest,
    resolveControllerImplementation,
} from "@matter/testing";
import { join } from "node:path";
import { env } from "node:process";
import { CertCleanupError, settleWithin } from "./tc-support.js";

// setup_class's th_server_discriminator — fixed for every OpenCommissioningWindow call in the script.
// The passcode is NOT fixed the same way: only the initial precondition commission (TH_CLIENT pairing
// TH_SERVER, done entirely inside the container before any prompt) uses setup_class's th_server_passcode
// (20202021). Every later window (the ones DUT_Commissioner actually joins) is opened via
// OpenCommissioningWindow, which mints a fresh random passcode per call — the prompt text is the only
// place that passcode is ever exposed to us.
const TH_SERVER_DISCRIMINATOR = 1234;

/** Windows the script opens: steps 1b, 2c, 3c and 5c always, plus 4c where the DUT's NOC chain has an ICAC. */
const MINIMUM_PROMPTS = 4;

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

// Corrupted-Sigma2 commissioning failures should surface promptly (an aborted CASE handshake), but a
// DUT that hangs instead of rejecting must not stall this step for the full mocha timeout.
const COMMISSION_TIMEOUT = Seconds(60);

/**
 * Handles every "Manual Pairing Code" prompt `TC_SC_3_5.py` prints — steps 1b, 2c, 3c, 4c, 5c (4c is
 * skipped, and never prompts, if DUT has no ICAC in its NOC chain; see the script's `setup_class`/
 * `test_TC_SC_3_5`). The first occurrence (step 1b, before any fault injection) is the only one the
 * script expects to succeed; DUT commissioning fails from step 1d onward, since the script corrupts
 * TH_SERVER's Sigma2 (via its FaultInjection cluster) before opening every later window.
 *
 * Doesn't hardcode "5 occurrences" (the ICAC-skip case means only 4 may appear) — only the *first* one
 * is treated as the success case; every later one, however many there are, must fail.
 */
function manualPairingCodeHandler(state: { attempts: number }): PromptHandler {
    return {
        pattern: /Manual Pairing Code:.*\(chip-tool: pairing onnetwork \d+ \d+\)/,
        async action(cx: CertStepContext, promptText: string) {
            const attempt = state.attempts++;
            const expectSuccess = attempt === 0;
            const passcode = extractPasscode(promptText);
            const dut = cx.controllers.dut;

            // This file drives cx.recorder directly (see the module doc comment on
            // manualPairingCodeHandler) rather than through certTest()'s step engine, so nothing
            // else calls StepRecorder.beginStep/endStep — EvidenceRecorder.check() requires an
            // active step.
            const stepDef: CertStepDefinition = {
                number: `attempt-${attempt}`,
                text: promptText,
                run: async () => {},
            };
            cx.recorder.beginStep(stepDef);

            const outcome = await settleWithin(
                `TC-SC-3.5 commissioning attempt ${attempt}`,
                dut.commission({
                    passcode,
                    discriminator: TH_SERVER_DISCRIMINATOR,
                    // The script arms each fault for one handshake only, so a commissioner that retries gets a
                    // clean one and commissions successfully. Step 1b injects no fault and must be free to
                    // recover like any healthy commissioning.
                    singleHandshakeAttempt: !expectSuccess,
                }),
                COMMISSION_TIMEOUT,
            );

            let verdict: StepVerdict;
            let failure: Error | undefined;

            switch (outcome.kind) {
                case "resolved":
                    verdict = expectSuccess ? "pass" : "fail";
                    cx.recorder.check({
                        type: "response",
                        verdict,
                        detail: `commission() resolved on attempt ${attempt} (ref ${outcome.value})`,
                    });
                    if (!expectSuccess) {
                        try {
                            await dut.node(outcome.value).decommission();
                        } catch (e) {
                            // Both: whether a fabric was left on TH_SERVER decides whether the *next*
                            // run can be trusted, and the bundle carrying it may itself never be written
                            const detail = `attempt ${attempt}'s fabric could not be removed, so it may remain on TH_SERVER: ${e}`;
                            console.warn(`TC-SC-3.5: ${detail}`);
                            cx.recorder.check({ type: "response", verdict: "fail", detail });
                        }
                        failure = new Error(
                            `DUT commissioning unexpectedly succeeded on attempt ${attempt} against a ` +
                                "Sigma2-fault-injected TH_SERVER, so either it accepted a corrupted Sigma2 or it " +
                                "retried past the one the script corrupted",
                        );
                    }
                    break;

                case "rejected":
                    verdict = expectSuccess ? "fail" : "pass";
                    cx.recorder.check({
                        type: "response",
                        verdict,
                        // Deliberately reports only that commissioning did not complete. What the DUT answered the
                        // corrupted Sigma2 with is in the attached controller log, and TH_SERVER's own view of the
                        // handshake plus its commissioning-window assertion are in the script's.
                        detail: `commission() did not complete on attempt ${attempt}: ${errorMessage(outcome.error)}`,
                    });
                    if (expectSuccess) {
                        failure =
                            outcome.error instanceof Error ? outcome.error : new Error(errorMessage(outcome.error));
                    }
                    break;

                case "timeout":
                    verdict = "fail";
                    cx.recorder.check({
                        type: "response",
                        verdict,
                        detail:
                            `commission() neither resolved nor rejected on attempt ${attempt} within ` +
                            Duration.format(COMMISSION_TIMEOUT),
                    });
                    failure = new Error(`DUT commissioning attempt ${attempt} timed out`);
                    break;
            }

            cx.recorder.endStep(stepDef, verdict);
            if (failure) {
                throw failure;
            }

            // TC_SC_3_5.py's wait_for_user_input() only blocks on a bare input() read (any text, or
            // none, satisfies it) — see AGENTS.md's "python-wrapped mode" section.
            return "\n";
        },
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
        // handlers only need enough headroom for up to 5 real CASE handshake attempts.
        this.timeout(10 * 60_000);

        const state = { attempts: 0 };
        let flushFailure: unknown;
        let closeFailure: unknown;
        const dut = createControllerAdapter("dut");

        const recorder = new EvidenceRecorder(evidenceOutDir(), {
            tc: "TC-SC-3.5",
            plan: "securechannel.adoc",
            timestamp: new Date().toISOString(),
            controller: "dut",
            controllerImplementation: resolveControllerImplementation(),
            device: `python-wrapped:${DESCRIPTOR.path}`,
            matterJsCommit: "(not recorded)",
        });

        const cx: CertStepContext = { controllers: { dut }, devices: {}, recorder };
        const test = new PromptDrivenPythonTest(DESCRIPTOR, chip.container, [manualPairingCodeHandler(state)], cx);

        try {
            await dut.start();

            await test.invoke(stubSubject(), () => {}, ["--string-arg", `th_server_app_path:${appPath}`], false);

            // The script's own PASS does not depend on its prompts being answered, so a short count means faults it
            // injected were never put to the DUT.
            if (state.attempts < MINIMUM_PROMPTS) {
                throw new InternalError(
                    `TC_SC_3_5.py reported success after only ${state.attempts} of at least ${MINIMUM_PROMPTS} ` +
                        "commissioning prompts, so some of its fault-injected CASE handshakes were never attempted",
                );
            }
        } finally {
            recorder.attachLog("controller-dut", dut.log.lines);
            recorder.attachLog("device-python", test.logLines);

            // Warned as well as kept: the throw below is unreachable when the body itself threw, so
            // the console is the only place a flush failure surfaces on that path.
            try {
                await recorder.flush();
            } catch (e) {
                console.warn("TC-SC-3.5 could not write its evidence bundle:", e);
                flushFailure = e;
            }
            try {
                await dut.close();
            } catch (e) {
                console.warn("TC-SC-3.5 could not close its dut adapter:", e);
                closeFailure = e;
            }

            // Here rather than beside the throw below: this test writes its own bundle instead of going
            // through `CertTest`, and a close failure has to reach the record even on the paths that
            // never reach that throw — a step that failed, or a flush that did.
            if (closeFailure !== undefined) {
                recorder.teardownFailed(`TC-SC-3.5's dut adapter would not close: ${closeFailure}`);
                try {
                    await recorder.flushRunRecord();
                } catch (e) {
                    console.warn("TC-SC-3.5 could not republish its run record after a close failure:", e);
                }
            }
        }

        // Reached only when the steps themselves succeeded, which is what makes these the run's own
        // outcome. Flush first, as `cert-test.ts` orders it: a run with no bundle proves nothing, where
        // a controller that would not close is state left for whatever runs next.
        if (flushFailure !== undefined) {
            throw flushFailure;
        }
        if (closeFailure !== undefined) {
            throw new CertCleanupError(
                `TC-SC-3.5's dut adapter would not close, so its fabric may remain on TH_SERVER: ${closeFailure}`,
            );
        }
    });
});
