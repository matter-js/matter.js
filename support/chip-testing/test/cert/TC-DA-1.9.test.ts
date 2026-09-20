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
import { CertCheckFailedError, CertCleanupError, settleWithin, statedInPrompt } from "./tc-support.js";

const DESCRIPTOR = {
    kind: "py" as const,
    name: "TC-DA-1.9",
    path: "/src/python_testing/TC_DA_1_9.py",
    subpath: "test_TC_DA_1_9",
};

/** Where the harness image carries the certificates this case is about. */
const REVOKED_CERTIFICATES = "/credentials/test/revoked-attestation-certificates";

/**
 * The vectors the script runs, in the order it runs them. Only the last presents certificates that
 * are not revoked, and it is the one that proves the other six were refused for their revocation
 * rather than for anything else the controller dislikes about a test device.
 */
const VECTORS = [
    "a revoked DAC",
    "a revoked PAI",
    "a revoked DAC and PAI",
    // The revocation set states the same serials for these as for the three above. It is the product
    // of the delegation having been validated, not an input to it, so what the DUT judges here is the
    // serial; the delegated signer is chip's business when it builds the set
    "a DAC the set revokes through a delegated CRL signer",
    "a PAI the set revokes through a delegated CRL signer",
    "a DAC and PAI the set revokes through a delegated CRL signer",
    "a DAC and PAI that are not revoked",
];

/** What a refusal has to name for it to be the refusal this case asked about. */
const REVOKED = "CertificateRevoked";

/**
 * Commissioning a device whose attestation is refused fails at attestation, well before any network
 * timeout; the last vector commissions for real.
 */
const COMMISSION_TIMEOUT = Seconds(60);

/**
 * What the script is given for its whole body, through its own `--timeout`.
 *
 * It declares no `default_timeout` of its own, so it would otherwise run under the ninety seconds
 * `MatterBaseTest` allows — enough for the python controller its CI path drives, and not enough for
 * seven commissioning attempts by a real one. Each refusal costs the discovery and the attestation
 * exchange that precede it.
 */
const SCRIPT_TIMEOUT = Seconds(600);

/**
 * The script starts the test app itself, so the harness only points it at a binary. It is the same
 * all-clusters build TC-SC-3.5 spawns as its TH_SERVER — this case injects no fault, and the
 * fault-injection build serves it just as well.
 */
function testAppPath(): string | undefined {
    return env.MATTER_CERT_TH_SERVER_APP_PATH;
}

function evidenceOutDir(): string {
    return env.MATTER_CERT_EVIDENCE_DIR || join(process.cwd(), "build/cert-evidence");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** What the vectors leave behind for the case to judge once the script has reached its own verdict. */
interface CaseState {
    attempts: number;

    /** Vectors that went the way the script wanted, for a reason that proves nothing. */
    unproven: string[];
}

/**
 * Answers every commissioning prompt the script makes, one per vector.
 *
 * The DUT is told which certificates are revoked before it is asked to commission the device
 * presenting them — the test's own setup step, which a commissioner would ordinarily satisfy from the
 * DCL. This PKI is not published there, in either the production ledger or the test one, so the
 * information comes from the file the prompt names.
 */
function commissioningHandler(state: CaseState, linesSoFar: () => readonly string[]): PromptHandler {
    return {
        pattern: /press enter to confirm/,

        async action(cx: CertStepContext, promptText: string) {
            const attempt = state.attempts++;
            const vector = VECTORS[attempt] ?? `an eighth vector this case does not know about`;
            const expectSuccess = attempt === VECTORS.length - 1;
            const number = `${attempt + 1}`;
            const stepDef: CertStepDefinition = { number, text: promptText, run: async () => {} };
            cx.recorder.beginStep(stepDef);

            let manualPairingCode: string;
            try {
                const lines = [...linesSoFar(), promptText];
                manualPairingCode = statedInPrompt(lines, /Manual Pairing Code: '(\d+)'/, "a pairing code");
                const revocationSetPath = statedInPrompt(lines, /Revocation Set: (\S+)/, "a revocation set");

                const { attestation } = cx.controllers.dut;
                if (attestation === undefined) {
                    throw new InternalError(
                        "The DUT judges attestation against what it was told about revocation, and this controller " +
                            "was not built to judge attestation at all",
                    );
                }
                await attestation.installRevocations(await chip.container.read(revocationSetPath));
            } catch (e) {
                // Recorded before it propagates: a step left open is dropped from the bundle, and the
                // setup this states is the harness's own, not anything the DUT did
                cx.recorder.check({
                    type: "response",
                    verdict: "fail",
                    detail: `vector ${number} was never put to the DUT: ${errorMessage(e)}`,
                });
                cx.recorder.endStep(stepDef, "fail");
                throw e;
            }

            const { dut } = cx.controllers;

            const outcome = await settleWithin(
                `TC-DA-1.9 commissioning with ${vector}`,
                dut.commission({ manualPairingCode }),
                COMMISSION_TIMEOUT,
            );

            let verdict: StepVerdict;
            let answer: string;
            let detail: string;

            switch (outcome.kind) {
                case "resolved":
                    verdict = expectSuccess ? "pass" : "fail";
                    answer = "Y\n";
                    detail = `DUT commissioned the device presenting ${vector} (ref ${outcome.value})`;
                    break;

                case "rejected": {
                    // A refusal for any other reason says nothing about revocation: a controller that
                    // never found the device, or that refused the test certificates themselves,
                    // reaches the same outcome and would otherwise score the same pass
                    const reason = errorMessage(outcome.error);
                    const asRevoked = reason.includes(REVOKED);
                    verdict = expectSuccess || !asRevoked ? "fail" : "pass";
                    answer = "N\n";
                    detail = asRevoked
                        ? `DUT refused the device presenting ${vector} as revoked: ${reason}`
                        : `DUT refused the device presenting ${vector}, but not as revoked: ${reason}`;
                    break;
                }

                case "timeout":
                    verdict = "fail";
                    // The script asserts on whether the device commissioned, and it did not
                    answer = "N\n";
                    detail =
                        `DUT neither commissioned nor refused the device presenting ${vector} within ` +
                        Duration.format(COMMISSION_TIMEOUT);
                    break;
            }

            cx.recorder.check({ type: "response", verdict, detail });

            if (outcome.kind === "resolved") {
                try {
                    await dut.node(outcome.value).decommission();
                } catch (e) {
                    // The script kills the app after every vector, so a fabric left on it dies with the
                    // app; it is the DUT's own view of the peer that has to go, or the next vector
                    // commissions onto a controller that still holds this one
                    verdict = "fail";
                    detail = `the DUT could not drop the device it commissioned: ${errorMessage(e)}`;
                    cx.recorder.check({ type: "response", verdict, detail });
                }
            }

            cx.recorder.endStep(stepDef, verdict);

            // The script asserts on the answer, so it catches a vector answered the wrong way and
            // nothing else. A timeout, a refusal that was not about revocation, and a device the DUT
            // could not drop again all answer what the script wanted to hear, so the case settles
            // those itself once the script has reached its own verdict.
            if (verdict === "fail") {
                state.unproven.push(`vector ${number} (${vector}): ${detail}`);
            }

            return answer;
        },
    };
}

/**
 * The script drives its own device and prompts for every commissioning, but only with
 * `PICS_SDK_CI_ONLY` off: with it on it commissions with a controller of its own and no DUT is asked
 * anything.
 */
function promptDrivenPics() {
    const pics = chip.defaultPics.with({ PICS_SDK_CI_ONLY: 0 });
    if (pics.values.PICS_SDK_CI_ONLY !== 0) {
        throw new InternalError(
            "Overriding PICS_SDK_CI_ONLY to 0 did not take effect, so TC_DA_1_9.py would commission its own device " +
                "instead of prompting the DUT",
        );
    }
    return pics;
}

function stubSubject(): Subject {
    return {
        id: "TC-DA-1.9",
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

describe("TC-DA-1.9", () => {
    it("[TC-DA-1.9] Device Attestation Revocation [DUT-Commissioner]", async function () {
        const appPath = testAppPath();
        if (!appPath) {
            this.skip();
        }

        // Only a controller that judges attestation itself can refuse one; chip-tool reads revocation
        // from a file its process was started with, which a running adapter cannot change.
        if (resolveControllerImplementation() !== "matterjs") {
            this.skip();
        }

        // Above the script's own budget, so its verdict is what this reports
        this.timeout(15 * 60_000);

        const state: CaseState = { attempts: 0, unproven: new Array<string>() };
        let bodyFailure: unknown;
        let flushFailure: unknown;
        let closeFailure: unknown;
        let concludeFailure: unknown;
        const dut = createControllerAdapter("dut", { attestation: true });

        const recorder = new EvidenceRecorder(evidenceOutDir(), {
            tc: "TC-DA-1.9",
            plan: "deviceattestation.adoc",
            timestamp: new Date().toISOString(),
            controller: "dut",
            controllerImplementation: resolveControllerImplementation(),
            devices: [{ role: "th", app: appPath, flavor: "python-wrapped" }],
            matterJsCommit: "(not recorded)",
        });

        const cx: CertStepContext = { controllers: { dut }, devices: {}, recorder };
        let test: PromptDrivenPythonTest | undefined;
        test = new PromptDrivenPythonTest(
            DESCRIPTOR,
            chip.container,
            [commissioningHandler(state, () => test?.logLines.map(line => line.text) ?? [])],
            cx,
        );

        try {
            await dut.start();

            await test.invoke(
                stubSubject(),
                () => {},
                [
                    "--timeout",
                    `${Seconds.of(SCRIPT_TIMEOUT)}`,
                    "--string-arg",
                    `app_path:${appPath}`,
                    "--string-arg",
                    `dac_provider_base_path:${REVOKED_CERTIFICATES}/dac-provider-test-vectors`,
                    "--string-arg",
                    `revocation_set_base_path:${REVOKED_CERTIFICATES}/revocation-sets`,
                ],
                false,
            );

            // The script reaches a verdict of its own whether or not a prompt was answered, so a
            // short count means vectors it ran were never put to the DUT
            if (state.attempts < VECTORS.length) {
                throw new CertCheckFailedError(
                    `TC_DA_1_9.py reported success after only ${state.attempts} of ${VECTORS.length} commissioning ` +
                        "prompts, so certificates it presented were never judged by the DUT",
                );
            }

            if (state.unproven.length) {
                throw new CertCheckFailedError(
                    `TC_DA_1_9.py reported success, but ${state.unproven.length} of its ${VECTORS.length} vectors ` +
                        `proved nothing — ${state.unproven.join("; ")}`,
                );
            }
        } catch (e) {
            bodyFailure = e;
            throw e;
        } finally {
            recorder.attachLog("controller-dut", dut.log.lines);
            recorder.attachLog("device-python", test.logLines);

            try {
                await recorder.flush();
            } catch (e) {
                console.warn("TC-DA-1.9 could not write its evidence bundle:", e);
                flushFailure = e;
            }
            try {
                await dut.close();
            } catch (e) {
                console.warn("TC-DA-1.9 could not close its dut adapter:", e);
                closeFailure = e;
            }

            if (closeFailure !== undefined) {
                recorder.teardownFailed(`TC-DA-1.9's dut adapter would not close: ${closeFailure}`);
            }

            const failure = bodyFailure ?? flushFailure ?? closeFailure;
            try {
                await recorder.concludeRun({
                    failed: failure !== undefined,
                    detail: failure === undefined ? undefined : `${failure}`,
                });
            } catch (e) {
                console.warn("TC-DA-1.9 could not conclude its evidence bundle:", e);
                concludeFailure = e;
            }
        }

        // Reached only where the vectors themselves settled, which is what makes a teardown failure
        // the run's own outcome. A run with no bundle proves nothing, so that goes first; a controller
        // that would not close is state left behind for whatever runs next.
        if (flushFailure !== undefined) {
            throw flushFailure;
        }
        if (closeFailure !== undefined) {
            throw new CertCleanupError(`TC-DA-1.9's dut adapter would not close: ${closeFailure}`);
        }
        if (concludeFailure !== undefined) {
            throw concludeFailure;
        }
    });
});
