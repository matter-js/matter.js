/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Time } from "@matter/main";
import type { CertStepContext, PromptHandler, Subject } from "@matter/testing";
import { chip, EvidenceRecorder, PromptDrivenPythonTest } from "@matter/testing";
import { join } from "node:path";
import { env } from "node:process";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";

// setup_class's th_server_discriminator — fixed for every OpenCommissioningWindow call in the script.
// The passcode is NOT fixed the same way: only the initial precondition commission (TH_CLIENT pairing
// TH_SERVER, done entirely inside the container before any prompt) uses setup_class's th_server_passcode
// (20202021). Every later window (the ones DUT_Commissioner actually joins) is opened via
// OpenCommissioningWindow, which mints a fresh random passcode per call — the prompt text is the only
// place that passcode is ever exposed to us.
const TH_SERVER_DISCRIMINATOR = 1234;

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
const COMMISSION_TIMEOUT_MS = 60_000;

type SettleOutcome = { kind: "resolved"; ref: string } | { kind: "rejected"; error: unknown } | { kind: "timeout" };

function settled(promise: Promise<string>): Promise<SettleOutcome> {
    return promise.then(
        (ref): SettleOutcome => ({ kind: "resolved", ref }),
        (error: unknown): SettleOutcome => ({ kind: "rejected", error }),
    );
}

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

            const timeout = Time.sleep("TC-SC-3.5 commission timeout", Millis(COMMISSION_TIMEOUT_MS));
            let outcome: SettleOutcome;
            try {
                outcome = await Promise.race([
                    settled(dut.commission({ passcode, discriminator: TH_SERVER_DISCRIMINATOR })),
                    timeout.then((): SettleOutcome => ({ kind: "timeout" })),
                ]);
            } finally {
                // A lost race leaves the sleep armed for its full duration, keeping the process alive past teardown
                timeout.cancel();
            }

            switch (outcome.kind) {
                case "resolved":
                    cx.recorder.check({
                        type: "response",
                        verdict: expectSuccess ? "pass" : "fail",
                        detail: `commission() resolved on attempt ${attempt} (ref ${outcome.ref})`,
                    });
                    if (!expectSuccess) {
                        await dut
                            .node(outcome.ref)
                            .decommission()
                            .catch(() => {});
                        throw new Error(
                            `DUT commissioning unexpectedly succeeded on attempt ${attempt} against a ` +
                                "Sigma2-fault-injected TH_SERVER",
                        );
                    }
                    break;

                case "rejected":
                    cx.recorder.check({
                        type: "response",
                        verdict: expectSuccess ? "fail" : "pass",
                        detail: `commission() rejected on attempt ${attempt}: ${errorMessage(outcome.error)}`,
                    });
                    if (expectSuccess) {
                        throw outcome.error instanceof Error ? outcome.error : new Error(errorMessage(outcome.error));
                    }
                    break;

                case "timeout":
                    cx.recorder.check({
                        type: "response",
                        verdict: "fail",
                        detail:
                            `commission() neither resolved nor rejected on attempt ${attempt} within ` +
                            Duration.format(Millis(COMMISSION_TIMEOUT_MS)),
                    });
                    throw new Error(`DUT commissioning attempt ${attempt} timed out`);
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

function stubSubject(): Subject {
    return {
        id: "TC-SC-3.5",
        app: "",
        commissioning: { kind: "on-network", passcode: 0, discriminator: 0, qrPairingCode: "" },
        pics: chip.defaultPics,
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
        const dut = new InProcessControllerAdapter("dut");

        const recorder = new EvidenceRecorder(evidenceOutDir(), {
            tc: "TC-SC-3.5",
            plan: "securechannel.adoc",
            timestamp: new Date().toISOString(),
            controller: "dut",
            device: `python-wrapped:${DESCRIPTOR.path}`,
            matterJsCommit: "(not recorded)",
        });

        const cx: CertStepContext = { controllers: { dut }, devices: {}, recorder };

        try {
            await dut.start();

            const test = new PromptDrivenPythonTest(DESCRIPTOR, chip.container, [manualPairingCodeHandler(state)], cx);

            await test.invoke(stubSubject(), () => {}, ["--string-arg", `th_server_app_path:${appPath}`], false);
        } finally {
            recorder.attachLog("controller-dut", dut.log.lines);
            await recorder.flush().catch(e => console.warn("Failed to flush TC-SC-3.5 evidence:", e));
            try {
                await dut.close();
            } catch (e) {
                console.warn("Failed to close TC-SC-3.5 dut adapter:", e);
            }
        }
    });
});
