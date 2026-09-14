/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Seconds } from "@matter/main";
import { StreamUsage } from "@matter/main/types";
import type {
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CertStepDefinition,
    ControllerAdapter,
    PromptHandler,
    StepVerdict,
    Subject,
    WebRtcRequestorApi,
} from "@matter/testing";
import {
    chip,
    createControllerAdapter,
    EvidenceRecorder,
    PromptDrivenPythonTest,
    resolveControllerImplementation,
} from "@matter/testing";
import { join } from "node:path";
import { env } from "node:process";
import { CertCheckFailedError, CertCleanupError, settleWithin } from "./tc-support.js";

const DESCRIPTOR = {
    kind: "py" as const,
    name: "TC-WEBRTCR-2.1",
    path: "/src/python_testing/TC_WEBRTCR_2_1.py",
    subpath: "test_TC_WebRTCR_2_1",
};

/** Endpoint of TH_SERVER's camera clusters, which `chip-camera-app` fixes at 1. */
const PROVIDER_ENDPOINT = 1;

/**
 * The video stream TH_SERVER allocates for the session, stated as `chip-camera-controller` states it
 * (`examples/camera-controller/device-manager/AVStreamManagement.cpp`) so the provider is asked for a
 * stream it is known to grant. Nothing in this case depends on the stream's parameters beyond that.
 */
const VIDEO_STREAM = {
    streamUsage: StreamUsage.Recording,
    videoCodec: 0,
    minFrameRate: 30,
    maxFrameRate: 120,
    minResolution: { width: 640, height: 480 },
    maxResolution: { width: 1920, height: 1080 },
    minBitRate: 10000,
    maxBitRate: 10000,
    keyFrameInterval: 4000,
    watermarkEnabled: false,
    osdEnabled: false,
};

/**
 * How long the provider gets to answer the solicitation with its (fault-corrupted) Offer. The script
 * itself allows 90 seconds for the same exchange.
 */
const REFUSAL_TIMEOUT = Seconds(90);

/** Bounds an invoke TH_SERVER may never answer. */
const INVOKE_TIMEOUT = Seconds(60);

/** Bounds the commissioning the script's third step asks of the DUT. */
const COMMISSION_TIMEOUT = Seconds(120);

/**
 * Container-side path to `chip-camera-app`, which the script spawns as TH_SERVER. Named apart from
 * `MATTER_CERT_TH_SERVER_APP_PATH` because that one names an all-clusters build for the CASE cases;
 * a TH_SERVER is only ever the app its own case needs.
 */
function cameraAppPath(): string | undefined {
    return env.MATTER_CERT_CAMERA_APP_PATH;
}

function evidenceOutDir(): string {
    return env.MATTER_CERT_EVIDENCE_DIR || join(process.cwd(), "build/cert-evidence");
}

/**
 * Extracts the manual pairing code from the prompt line `TC_WEBRTCR_2_1.py` prints for its third
 * step. The window is opened by `OpenCommissioningWindow`, which mints a fresh passcode per call, so
 * the prompt is the only place the code is ever exposed to us.
 */
function extractManualCode(promptText: string): string {
    const match = promptText.match(/manual code='(\d+)'/);
    if (!match) {
        throw new InternalError(`Prompt line carried no manual pairing code: ${promptText}`);
    }
    return match[1];
}

/**
 * Answers the script's commissioning prompt by commissioning TH_SERVER through the DUT's own
 * controller.
 *
 * Matches only the prompt's first line: its later lines repeat the same action as chip-tool and
 * camera-controller hints, and a handler matching one of those would write a second answer into the
 * script's stdin, which the *next* prompt's `input()` would consume.
 */
function commissionHandler(state: { ref?: CertNodeRef }): PromptHandler {
    return {
        pattern: /Please commission the server app from DUT: manual code='\d+'/,
        async action(cx: CertStepContext, promptText: string) {
            const stepDef: CertStepDefinition = { number: "3", text: promptText, run: async () => {} };
            cx.recorder.beginStep(stepDef);

            const manualPairingCode = extractManualCode(promptText);
            let verdict: StepVerdict;
            let answer: string;
            try {
                state.ref = await cx.controllers.dut.commission({
                    manualPairingCode,
                    giveUpAfterMs: COMMISSION_TIMEOUT,
                });
                verdict = "pass";
                answer = "Y\n";
                cx.recorder.check({
                    type: "response",
                    verdict,
                    detail: `DUT commissioned TH_SERVER (ref ${state.ref})`,
                });
            } catch (e) {
                verdict = "fail";
                answer = "N\n";
                cx.recorder.check({
                    type: "response",
                    verdict,
                    detail: `DUT could not commission TH_SERVER: ${errorMessage(e)}`,
                });
            }

            cx.recorder.endStep(stepDef, verdict);

            // The script asserts on the answer itself, so a failure here surfaces as its own verdict
            // rather than as a throw that would leave it blocked on stdin.
            return answer;
        },
    };
}

/**
 * Answers the script's signaling prompt by soliciting an offer from TH_SERVER, whose fault injection
 * is armed to corrupt the session id of the Offer it sends back.
 *
 * Judges the refusal from the DUT's own requestor cluster rather than from TH_SERVER's log: the
 * provider states only the status it received (`NOT_FOUND`), where the requestor's record names the
 * session id it was asked about — which is what distinguishes the corrupted id from the registered
 * one. The script's output cannot serve here anyway, since the loop reading it is suspended for as
 * long as this handler runs.
 */
function solicitOfferHandler(state: { ref?: CertNodeRef; requestor: WebRtcRequestorApi }): PromptHandler {
    return {
        pattern: /Send 'SolicitOffer' command to the server app from DUT:/,
        async action(cx: CertStepContext, promptText: string) {
            const stepDef: CertStepDefinition = { number: "5", text: promptText, run: async () => {} };
            cx.recorder.beginStep(stepDef);

            let verdict: StepVerdict = "fail";
            try {
                verdict = await proveOfferRefused(cx, state);
            } finally {
                // The recorder drops a step that never ends, so a throw from an invoke here would take
                // the whole step — and every check it recorded — out of the bundle.
                cx.recorder.endStep(stepDef, verdict);
            }

            return verdict === "pass" ? "Y\n" : "N\n";
        },
    };
}

async function proveOfferRefused(
    cx: CertStepContext,
    state: { ref?: CertNodeRef; requestor: WebRtcRequestorApi },
): Promise<StepVerdict> {
    const { ref, requestor } = state;
    if (ref === undefined) {
        throw new InternalError("The script asked for signaling before the DUT commissioned TH_SERVER");
    }

    const node = cx.controllers.dut.node(ref);
    const videoStreamId = await allocateVideoStream(node);

    const faulted = await solicitSession(node, requestor, videoStreamId, ref);
    const refusal = await requestor.nextSignal(
        signal => signal.kind === "offer" && signal.outcome === "refused",
        REFUSAL_TIMEOUT,
    );

    if (refusal === undefined) {
        cx.recorder.check({
            type: "response",
            verdict: "fail",
            detail:
                `the DUT's requestor refused no Offer within ${Duration.format(REFUSAL_TIMEOUT)} of soliciting ` +
                `session ${faulted}, so it either accepted the corrupted session id or was never signaled`,
        });
        return "fail";
    }

    const refusedForeignId = refusal.sessionId !== faulted;
    cx.recorder.check({
        type: "response",
        verdict: refusedForeignId ? "pass" : "fail",
        detail: refusedForeignId
            ? `the DUT refused an Offer naming session ${refusal.sessionId}, which is not the session ` +
              `${faulted} it holds with TH_SERVER`
            : `the DUT refused an Offer naming session ${faulted}, the very session it registered, so the ` +
              "refusal rests on something other than the corrupted id",
    });

    const tracked = await requestor.sessions();
    const keptSession = tracked.some(session => session.id === faulted);
    cx.recorder.check({
        type: "response",
        verdict: keptSession ? "pass" : "fail",
        detail: keptSession
            ? `the DUT still tracks session ${faulted}, so the Offer was judged against a session that existed`
            : `the DUT tracks sessions ${tracked.map(session => session.id).join(", ") || "(none)"}, not the ` +
              `session ${faulted} it solicited`,
    });

    const accepted = requestor.signals().filter(signal => signal.kind === "offer" && signal.outcome === "accepted");
    cx.recorder.check({
        type: "response",
        verdict: accepted.length === 0 ? "pass" : "fail",
        detail:
            accepted.length === 0
                ? "the DUT accepted no Offer while the fault was armed"
                : `the DUT accepted an Offer for session(s) ${accepted.map(signal => signal.sessionId).join(", ")}`,
    });

    const control = await proveOfferAccepted(cx, node, requestor, videoStreamId, ref, faulted);

    return refusedForeignId && keptSession && accepted.length === 0 && control ? "pass" : "fail";
}

/**
 * Solicits a second session once the fault has been consumed — it is armed for one call — and requires
 * the Offer for it to be accepted.
 *
 * Beyond the plan's five steps, and the only thing that makes the refusal above evidence: a requestor
 * that answers NotFound to everything, having looked at nothing, satisfies every check the plan itself
 * asks for.
 *
 * Registers the id the provider is about to mint *before* soliciting, because the provider invokes
 * `Offer` from within its own handling of the solicitation: where controller and provider share a
 * host, that Offer arrives before the solicitation's response has been read, and a registration made
 * after the response is always too late. Session ids are minted in sequence
 * (`WebRTCTransportProviderCluster::GenerateSessionId`), so the next one follows the session already
 * held; the solicitation's answer then confirms which id the provider actually chose.
 */
async function proveOfferAccepted(
    cx: CertStepContext,
    node: CertNodeApi,
    requestor: WebRtcRequestorApi,
    videoStreamId: number,
    ref: CertNodeRef,
    held: number,
): Promise<boolean> {
    const expected = held + 1;
    await registerSession(requestor, expected, videoStreamId, ref);

    const control = await solicitSession(node, requestor, videoStreamId, ref);
    if (control !== expected) {
        await requestor.removeSession(expected);
    }

    const accepted = await requestor.nextSignal(
        signal => signal.kind === "offer" && signal.outcome === "accepted" && signal.sessionId === control,
        REFUSAL_TIMEOUT,
    );

    cx.recorder.check({
        type: "response",
        verdict: accepted === undefined ? "fail" : "pass",
        detail:
            accepted === undefined
                ? `the DUT accepted no Offer for session ${control}, solicited with the fault spent, so its refusal ` +
                  `of the corrupted id says nothing about the id` +
                  (control === expected
                      ? ""
                      : ` (the provider minted ${control} where ${expected} was registered ahead of it, so its Offer ` +
                        "may have arrived before the registration)")
                : `the DUT accepted the Offer for session ${control}, so it refuses by session id rather than ` +
                  "refusing every Offer",
    });

    return accepted !== undefined;
}

/** Allocates the video stream a solicitation names, as `chip-camera-controller` does before soliciting. */
async function allocateVideoStream(node: CertNodeApi): Promise<number> {
    const allocation = await settled(
        "TC-WEBRTCR-2.1 VideoStreamAllocate",
        node.invoke("CameraAvStreamManagement", "videoStreamAllocate", VIDEO_STREAM, PROVIDER_ENDPOINT),
    );
    return numberField(allocation, "videoStreamId", "VideoStreamAllocateResponse");
}

/**
 * Solicits an offer and registers the session the provider minted, so the provider's signaling for that
 * id is accepted.
 */
async function solicitSession(
    node: CertNodeApi,
    requestor: WebRtcRequestorApi,
    videoStreamId: number,
    ref: CertNodeRef,
): Promise<number> {
    const solicitation = await settled(
        "TC-WEBRTCR-2.1 SolicitOffer",
        node.invoke(
            "WebRtcTransportProvider",
            "solicitOffer",
            {
                streamUsage: StreamUsage.Recording,
                originatingEndpointId: requestor.endpoint,
                videoStreamId,
            },
            PROVIDER_ENDPOINT,
        ),
    );
    const webRtcSessionId = numberField(solicitation, "webRtcSessionId", "SolicitOfferResponse");

    await registerSession(requestor, webRtcSessionId, videoStreamId, ref);

    return webRtcSessionId;
}

async function registerSession(
    requestor: WebRtcRequestorApi,
    id: number,
    videoStreamId: number,
    ref: CertNodeRef,
): Promise<void> {
    await requestor.upsertSession({
        id,
        peer: ref,
        peerEndpointId: PROVIDER_ENDPOINT,
        streamUsage: StreamUsage.Recording,
        videoStreamId,
    });
}

/**
 * Bounds an interaction the provider may never answer, so the step fails with its evidence written
 * rather than being aborted by the mocha timeout with the bundle still unflushed.
 */
async function settled<T>(label: string, op: Promise<T>): Promise<T> {
    const outcome = await settleWithin(label, op, INVOKE_TIMEOUT);
    switch (outcome.kind) {
        case "resolved":
            return outcome.value;
        case "rejected":
            throw outcome.error instanceof Error ? outcome.error : new CertCheckFailedError(String(outcome.error));
        case "timeout":
            throw new CertCheckFailedError(
                `${label} neither resolved nor rejected within ${Duration.format(INVOKE_TIMEOUT)}`,
            );
    }
}

function numberField(response: unknown, field: string, what: string): number {
    if (typeof response !== "object" || response === null || !(field in response)) {
        throw new CertCheckFailedError(`${what} carried no ${field}: ${JSON.stringify(response)}`);
    }
    const value: unknown = Reflect.get(response, field);
    if (typeof value !== "number") {
        throw new CertCheckFailedError(`${what}'s ${field} is not a number: ${JSON.stringify(response)}`);
    }
    return value;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Where `PICS_SDK_CI_ONLY` is set, `TC_WEBRTCR_2_1.py` drives the DUT itself: it commissions and
 * signals by writing to chip's own camera-controller over that app's interactive socket, which is not
 * a controller we can be. At 0 it prompts for both instead, which is what lets the DUT be ours.
 */
function promptDrivenPics() {
    const pics = chip.defaultPics.with({ PICS_SDK_CI_ONLY: 0 });
    if (pics.values.PICS_SDK_CI_ONLY !== 0) {
        throw new InternalError(
            "Overriding PICS_SDK_CI_ONLY to 0 did not take effect, so TC_WEBRTCR_2_1.py would drive TH_SERVER itself " +
                "instead of prompting the DUT",
        );
    }
    return pics;
}

function stubSubject(): Subject {
    return {
        id: "TC-WEBRTCR-2.1",
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

function requestorOf(dut: ControllerAdapter): WebRtcRequestorApi {
    if (dut.webRtcRequestor === undefined) {
        throw new InternalError(
            "The DUT controller hosts no WebRTC transport requestor cluster, so TH_SERVER's Offer would have nowhere " +
                "to land",
        );
    }
    return dut.webRtcRequestor;
}

describe("TC-WEBRTCR-2.1", () => {
    it("[TC-WEBRTCR-2.1] Validate Offer command with invalid session id [DUT_Requestor]", async function () {
        const appPath = cameraAppPath();
        if (!appPath) {
            this.skip();
        }

        // Only a controller that is itself a node can host the requestor cluster the provider signals
        // against; chip-tool's adapter refuses the option rather than pretending to.
        if (resolveControllerImplementation() !== "matterjs") {
            this.skip();
        }

        this.timeout(10 * 60_000);

        const state: { ref?: CertNodeRef } = {};
        let bodyFailure: unknown;
        let flushFailure: unknown;
        let closeFailure: unknown;
        let concludeFailure: unknown;
        // Every signaling command here carries the specification's Large Message quality, which requires
        // a TCP session (Matter Core, "Large Message Quality"); a controller with no TCP client cannot
        // send one at all.
        const dut = createControllerAdapter("dut", { webRtcRequestor: true, transport: "tcp" });

        const recorder = new EvidenceRecorder(evidenceOutDir(), {
            tc: "TC-WEBRTCR-2.1",
            plan: "camera.adoc",
            timestamp: new Date().toISOString(),
            controller: "dut",
            controllerImplementation: resolveControllerImplementation(),
            device: `python-wrapped:${DESCRIPTOR.path}`,
            matterJsCommit: "(not recorded)",
        });

        const cx: CertStepContext = { controllers: { dut }, devices: {}, recorder };

        let test: PromptDrivenPythonTest | undefined;

        try {
            await dut.start();

            const handlers = [
                commissionHandler(state),
                solicitOfferHandler({
                    get ref() {
                        return state.ref;
                    },
                    requestor: requestorOf(dut),
                }),
            ];
            test = new PromptDrivenPythonTest(DESCRIPTOR, chip.container, handlers, cx);

            await test.invoke(stubSubject(), () => {}, ["--string-arg", `th_server_app_path:${appPath}`], false);

            if (state.ref === undefined) {
                throw new InternalError(
                    "TC_WEBRTCR_2_1.py reported success without ever prompting for commissioning, so the DUT was " +
                        "never the party its Offer was put to",
                );
            }
        } catch (e) {
            bodyFailure = e;
            throw e;
        } finally {
            recorder.attachLog("controller-dut", dut.log.lines);
            if (test !== undefined) {
                recorder.attachLog("device-python", test.logLines);
            }

            try {
                await recorder.flush();
            } catch (e) {
                console.warn("TC-WEBRTCR-2.1 could not write its evidence bundle:", e);
                flushFailure = e;
            }
            try {
                await dut.close();
            } catch (e) {
                console.warn("TC-WEBRTCR-2.1 could not close its dut adapter:", e);
                closeFailure = e;
            }

            if (closeFailure !== undefined) {
                recorder.teardownFailed(`TC-WEBRTCR-2.1's dut adapter would not close: ${closeFailure}`);
            }

            const failure = bodyFailure ?? flushFailure ?? closeFailure;
            try {
                await recorder.concludeRun({
                    failed: failure !== undefined,
                    detail: failure === undefined ? undefined : `${failure}`,
                });
            } catch (e) {
                console.warn("TC-WEBRTCR-2.1 could not settle its evidence record:", e);
                concludeFailure = e;
            }
        }

        if (flushFailure !== undefined) {
            throw flushFailure;
        }
        if (closeFailure !== undefined) {
            throw new CertCleanupError(
                `TC-WEBRTCR-2.1's dut adapter would not close, so its fabric may remain on TH_SERVER: ${closeFailure}`,
            );
        }
        if (concludeFailure !== undefined) {
            throw concludeFailure;
        }
    });
});
