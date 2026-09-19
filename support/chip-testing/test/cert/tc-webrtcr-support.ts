/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Seconds, Time } from "@matter/main";
import { StreamUsage } from "@matter/main/types";
import type {
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CertStepDefinition,
    PromptHandler,
    StepVerdict,
    Subject,
    WebRtcRequestorApi,
    WebRtcSignalRecord,
} from "@matter/testing";
import {
    CertLogTimeoutError,
    chip,
    createControllerAdapter,
    EvidenceRecorder,
    PromptDrivenPythonTest,
    resolveControllerImplementation,
} from "@matter/testing";
import { join } from "node:path";
import { env } from "node:process";
import { CertCheckFailedError, CertCleanupError, settleWithin } from "./tc-support.js";

/** Endpoint of TH_SERVER's camera clusters, which `chip-camera-app` fixes at 1. */
const PROVIDER_ENDPOINT = 1;

/**
 * What a signaling step may spend in total.
 *
 * The script's own `default_timeout` of three minutes covers its whole test body — setup,
 * commissioning and both prompts — not the single wait a handler is in. A step whose waits only cap
 * each other individually can traverse six of them and outlive that, and mobly then aborts the script
 * while the handler still holds stdin: the case fails as a script timeout rather than as the verdict
 * it had reached. So the waits share one deadline, and what is left of it caps each.
 *
 * The provider answers in milliseconds when it answers at all, so this is headroom, not a target.
 */
const STEP_BUDGET = Seconds(60);

/** Caps on single waits, each further bounded by what is left of {@link STEP_BUDGET}. */
const SIGNAL_TIMEOUT = Seconds(30);
const INVOKE_TIMEOUT = Seconds(30);

/** Bounds the commissioning step, which is a step of its own and has the script's budget to itself. */
const COMMISSION_TIMEOUT = Seconds(60);

/**
 * The video stream a session names, stated as `chip-camera-controller` states it
 * (`examples/camera-controller/device-manager/AVStreamManagement.cpp`) so the provider is asked for a
 * stream it is known to grant. No case here depends on the stream's parameters beyond that.
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
 * The offer a case sends where the plan has the DUT offer rather than solicit.
 *
 * Signaling is all these cases exercise, so this describes a peer connection that is never built: the
 * fingerprint belongs to no certificate and the candidate addresses are the documentation range. The
 * provider checks that an offer carries the session-level lines and the ICE and DTLS attributes
 * (`ValidateSdpFields` in chip's `webrtc-provider-manager.cpp`) and then answers it, which is where
 * every case here does its work. A case that needs a connection established needs a real WebRTC stack
 * instead.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 11.5.6.3
 */
const OFFER_SDP = [
    "v=0",
    "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=mid:0",
    "a=setup:actpass",
    "a=ice-ufrag:sp1k",
    "a=ice-pwd:0123456789abcdef0123456789",
    "a=fingerprint:sha-256 " +
        "46:03:17:FD:8C:6A:C9:6B:70:62:0D:E8:0E:A6:49:90:57:5D:44:5A:BF:43:99:8C:D3:5C:38:5D:DF:70:6B:84",
    "a=sctp-port:5000",
    "",
].join("\r\n");

/**
 * What the DUT's own log carries when it answers `ICECandidates` with `CONSTRAINT_ERROR`. Bound to the
 * cluster and the command, so a refusal of anything else on the same node cannot satisfy a case.
 */
const CONSTRAINT_REFUSAL = /Invoke error .*webRtcTransportRequestor\.iceCandidates: Status=ConstraintError/;

/** One ICE candidate, which is what makes a provider send its own (chip's provider answers candidates with candidates). */
const ICE_CANDIDATE = {
    candidate: "candidate:1 1 UDP 2122252543 192.0.2.1 50000 typ host",
    sdpMid: "0",
    sdpmLineIndex: 0,
};

/**
 * Container-side path to `chip-camera-app`, which these scripts spawn as TH_SERVER. Named apart from
 * `MATTER_CERT_TH_SERVER_APP_PATH` because that one names an all-clusters build for the CASE cases;
 * a TH_SERVER is only ever the app its own case needs.
 */
function cameraAppPath(): string | undefined {
    return env.MATTER_CERT_CAMERA_APP_PATH;
}

function evidenceOutDir(): string {
    return env.MATTER_CERT_EVIDENCE_DIR || join(process.cwd(), "build/cert-evidence");
}

/** What a case's own signaling step works with, once the DUT holds the camera and a video stream. */
export interface CameraSession {
    node: CertNodeApi;
    requestor: WebRtcRequestorApi;
    ref: CertNodeRef;
    videoStreamId: number;

    /** What is left of {@link STEP_BUDGET}, which every wait in the step shares. */
    remaining(): Duration;
}

/** `cap`, or what is left of the step's budget where that is less. */
function within(session: CameraSession, cap: Duration): Duration {
    return Millis(Math.min(cap, session.remaining()));
}

/** A certification case driving `chip-camera-app` through one of its python scripts. */
export interface CameraCase {
    /** e.g. `"TC-WEBRTCR-2.2"`. */
    tc: string;

    /** The script's file name, e.g. `"TC_WEBRTCR_2_2.py"`. */
    script: string;

    /** The script's test method, e.g. `"test_TC_WebRTCR_2_2"`. */
    subpath: string;

    /** Reads after the id in the test's own name. */
    title: string;

    /** First line of the prompt the script prints for the step this case proves something at. */
    signalPrompt: RegExp;

    /** The step number that prompt belongs to, as the plan numbers it. */
    signalStep: string;

    /** Proves what the case is for. Every check it records reaches the evidence bundle. */
    prove(cx: CertStepContext, session: CameraSession): Promise<StepVerdict>;
}

/**
 * Declares a python-wrapped certification case against `chip-camera-app`.
 *
 * The script drives its own scenario and prompts for the actions a DUT must take; this answers those
 * prompts with our own controller. Commissioning is handled here because every case asks for it the
 * same way; `prove` is what differs.
 */
export function certCameraCase(definition: CameraCase) {
    const descriptor = {
        kind: "py" as const,
        name: definition.tc,
        path: `/src/python_testing/${definition.script}`,
        subpath: definition.subpath,
    };

    describe(definition.tc, () => {
        it(`[${definition.tc}] ${definition.title}`, async function () {
            const appPath = cameraAppPath();
            if (!appPath) {
                this.skip();
            }

            // Only a controller that is itself a node can host the requestor cluster the provider
            // signals against; chip-tool's adapter refuses the option rather than pretending to.
            if (resolveControllerImplementation() !== "matterjs") {
                this.skip();
            }

            this.timeout(10 * 60_000);

            const state: { ref?: CertNodeRef; proved?: boolean } = {};
            let bodyFailure: unknown;
            let flushFailure: unknown;
            let closeFailure: unknown;
            let concludeFailure: unknown;

            // Every signaling command carries the specification's Large Message quality, which requires
            // a TCP session; a controller with no TCP client cannot send one at all.
            const dut = createControllerAdapter("dut", { webRtcRequestor: true, transport: "tcp" });

            const recorder = new EvidenceRecorder(evidenceOutDir(), {
                tc: definition.tc,
                plan: "camera.adoc",
                timestamp: new Date().toISOString(),
                controller: "dut",
                controllerImplementation: resolveControllerImplementation(),
                devices: [{ role: "th_server", app: descriptor.path, flavor: "python-wrapped" }],
                matterJsCommit: "(not recorded)",
            });

            const cx: CertStepContext = { controllers: { dut }, devices: {}, recorder };

            let test: PromptDrivenPythonTest | undefined;

            try {
                await dut.start();

                const handlers = [commissionHandler(state), signalHandler(definition, state, requestorOf(dut))];
                test = new PromptDrivenPythonTest(descriptor, chip.container, handlers, cx);

                await test.invoke(
                    stubSubject(definition.tc),
                    () => {},
                    ["--string-arg", `th_server_app_path:${appPath}`],
                    false,
                );

                if (state.ref === undefined) {
                    throw new InternalError(
                        `${definition.script} reported success without ever prompting for commissioning, so the DUT ` +
                            "was never the party its signaling was put to",
                    );
                }

                // A script reaches its own verdict whether or not a prompt was answered, so a prompt this
                // no longer matches leaves the case passing on nothing
                if (state.proved !== true) {
                    throw new InternalError(
                        `${definition.script} never printed a line matching ${definition.signalPrompt}, so nothing ` +
                            "put its signaling to the DUT",
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
                    console.warn(`${definition.tc} could not write its evidence bundle:`, e);
                    flushFailure = e;
                }
                try {
                    await dut.close();
                } catch (e) {
                    console.warn(`${definition.tc} could not close its dut adapter:`, e);
                    closeFailure = e;
                }

                if (closeFailure !== undefined) {
                    recorder.teardownFailed(`${definition.tc}'s dut adapter would not close: ${closeFailure}`);
                }

                const failure = bodyFailure ?? flushFailure ?? closeFailure;
                try {
                    await recorder.concludeRun({
                        failed: failure !== undefined,
                        detail: failure === undefined ? undefined : `${failure}`,
                    });
                } catch (e) {
                    console.warn(`${definition.tc} could not settle its evidence record:`, e);
                    concludeFailure = e;
                }
            }

            if (flushFailure !== undefined) {
                throw flushFailure;
            }
            if (closeFailure !== undefined) {
                throw new CertCleanupError(
                    `${definition.tc}'s dut adapter would not close, so its fabric may remain on TH_SERVER: ` +
                        `${closeFailure}`,
                );
            }
            if (concludeFailure !== undefined) {
                throw concludeFailure;
            }
        });
    });
}

/**
 * Answers a script's commissioning prompt by commissioning TH_SERVER through the DUT's own controller.
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

/** Runs a case's own {@link CameraCase.prove} against the camera the DUT commissioned. */
function signalHandler(
    definition: CameraCase,
    state: { ref?: CertNodeRef; proved?: boolean },
    requestor: WebRtcRequestorApi,
): PromptHandler {
    return {
        pattern: definition.signalPrompt,
        async action(cx: CertStepContext, promptText: string) {
            const stepDef: CertStepDefinition = {
                number: definition.signalStep,
                text: promptText,
                run: async () => {},
            };
            cx.recorder.beginStep(stepDef);

            state.proved = true;

            let verdict: StepVerdict = "fail";
            try {
                const { ref } = state;
                if (ref === undefined) {
                    throw new InternalError("The script asked for signaling before the DUT commissioned TH_SERVER");
                }

                const endsAt = Time.nowUs + STEP_BUDGET;
                const session: CameraSession = {
                    node: cx.controllers.dut.node(ref),
                    requestor,
                    ref,
                    videoStreamId: 0,
                    remaining: () => Millis(Math.max(0, endsAt - Time.nowUs)),
                };

                verdict = await definition.prove(cx, {
                    ...session,
                    videoStreamId: await allocateVideoStream(session),
                });
            } finally {
                // The recorder drops a step that never ends, so a throw from an invoke here would take
                // the whole step — and every check it recorded — out of the bundle.
                cx.recorder.endStep(stepDef, verdict);
            }

            return verdict === "pass" ? "Y\n" : "N\n";
        },
    };
}

/**
 * Asks the provider for an offer, and registers the session it minted.
 *
 * Registration happens once the solicitation is answered, which is too late to decide whether the
 * provider's `Offer` is accepted: the provider sends it from inside its own handling of the
 * solicitation. {@link expectControlAccepted} is what registers an id ahead of establishing a session.
 */
export async function solicitOffer(session: CameraSession): Promise<number> {
    const solicitation = await settled(
        session,
        "SolicitOffer",
        session.node.invoke(
            "WebRtcTransportProvider",
            "solicitOffer",
            {
                streamUsage: StreamUsage.Recording,
                originatingEndpointId: session.requestor.endpoint,
                videoStreamId: session.videoStreamId,
            },
            PROVIDER_ENDPOINT,
        ),
    );

    const webRtcSessionId = numberField(solicitation, "webRtcSessionId", "SolicitOfferResponse");
    await registerSession(session, webRtcSessionId);
    return webRtcSessionId;
}

/**
 * Offers the provider a session, and registers the session it minted. The provider answers an offer it
 * accepts, which is what the plan's `webrtc establish-session` does without `--offer-type`.
 *
 * Carries the same registration timing as {@link solicitOffer}.
 */
export async function provideOffer(session: CameraSession): Promise<number> {
    const provided = await settled(
        session,
        "ProvideOffer",
        session.node.invoke(
            "WebRtcTransportProvider",
            "provideOffer",
            {
                webRtcSessionId: null,
                sdp: OFFER_SDP,
                streamUsage: StreamUsage.Recording,
                originatingEndpointId: session.requestor.endpoint,
                videoStreamId: session.videoStreamId,
            },
            PROVIDER_ENDPOINT,
        ),
    );

    const webRtcSessionId = numberField(provided, "webRtcSessionId", "ProvideOfferResponse");
    await registerSession(session, webRtcSessionId);
    return webRtcSessionId;
}

/**
 * Sends the provider one ICE candidate, which is what makes it send its own: chip's provider gathers
 * and forwards candidates only once the requestor has offered some.
 */
export async function provideIceCandidates(session: CameraSession, webRtcSessionId: number): Promise<void> {
    await settled(
        session,
        "ProvideICECandidates",
        session.node.invoke(
            "WebRtcTransportProvider",
            "provideIceCandidates",
            { webRtcSessionId, iceCandidates: [ICE_CANDIDATE] },
            PROVIDER_ENDPOINT,
        ),
    );
}

/** Registers a session with the DUT's requestor cluster, so the provider's signaling for it is accepted. */
async function registerSession(session: CameraSession, id: number): Promise<void> {
    await session.requestor.upsertSession({
        id,
        peer: session.ref,
        peerEndpointId: PROVIDER_ENDPOINT,
        streamUsage: StreamUsage.Recording,
        videoStreamId: session.videoStreamId,
    });
}

/**
 * Records that the DUT refused the signaling the provider's injected fault corrupted, and that what it
 * refused was the id the fault produced rather than the session the case established.
 *
 * Absence of a refusal is a DUT verdict; anything that stops this from observing one is not, and
 * throws instead.
 */
export async function expectRefusal(
    cx: CertStepContext,
    session: CameraSession,
    kind: WebRtcSignalRecord["kind"],
    held: number,
): Promise<{ passed: boolean; refusedId?: number }> {
    const waited = within(session, SIGNAL_TIMEOUT);
    const refusal = await session.requestor.nextSignal(
        signal => signal.kind === kind && signal.outcome === "refused",
        waited,
    );

    if (refusal === undefined) {
        cx.recorder.check({
            type: "response",
            verdict: "fail",
            detail:
                `the DUT refused no ${signalName(kind)} within ${Duration.format(waited)} of establishing session ` +
                `${held}, so it either accepted what the fault produced or was never signaled`,
        });
        return { passed: false };
    }

    const refusedForeignId = refusal.sessionId !== held;
    cx.recorder.check({
        type: "response",
        verdict: refusedForeignId ? "pass" : "fail",
        detail: refusedForeignId
            ? `the DUT refused the ${signalName(kind)} naming session ${refusal.sessionId}, which is not the ` +
              `session ` +
              `${held} it holds with TH_SERVER`
            : `the DUT refused the ${signalName(kind)} naming session ${held}, the very session it registered, so ` +
              `the ` +
              `refusal rests on something other than the corrupted id`,
    });

    return { passed: refusedForeignId, refusedId: refusal.sessionId };
}

/**
 * Records that the DUT answered the peer's signaling with `CONSTRAINT_ERROR`, read from the
 * controller's own log.
 *
 * Signaling that breaks a field's own constraint is refused by schema validation before the requestor
 * cluster runs, so nothing session-level is recorded for it and no refusal reaches
 * {@link WebRtcRequestorApi.signals}. What the DUT answered still reaches its log.
 *
 * Only the timeout is a DUT verdict. A log that closed, or a follower that failed for its own reasons,
 * says nothing about the DUT and throws rather than recording one.
 */
export async function expectConstraintRefusal(
    cx: CertStepContext,
    session: CameraSession,
    from: number,
    timeout: Duration = SIGNAL_TIMEOUT,
): Promise<boolean> {
    const waited = within(session, timeout);
    let matched: string | undefined;
    try {
        const line = await cx.controllers.dut.log.expectPattern(CONSTRAINT_REFUSAL, { from, timeoutMs: waited });
        matched = line.text;
    } catch (e) {
        if (!(e instanceof CertLogTimeoutError)) {
            throw e;
        }
    }

    cx.recorder.check({
        type: "response",
        verdict: matched === undefined ? "fail" : "pass",
        detail:
            matched === undefined
                ? `the DUT answered no ICECandidates with CONSTRAINT_ERROR within ${Duration.format(waited)}, so ` +
                  `it accepted a candidate list the specification states must hold at least one`
                : `the DUT answered ICECandidates with CONSTRAINT_ERROR: ${matched}`,
    });

    return matched !== undefined;
}

/**
 * Records that the DUT still holds the session the case established with it.
 *
 * States no more than that. Whether the refusal above was judged against a *tracked* session is not
 * something this can witness: the provider signals from inside its own handling of the command that
 * establishes the session, so the registration may land after the refusal. What separates "refuses by
 * session id" from "refuses everything" is {@link expectControlAccepted}.
 */
export async function expectSessionHeld(cx: CertStepContext, session: CameraSession, held: number): Promise<boolean> {
    const tracked = await session.requestor.sessions();
    const keptSession = tracked.some(entry => entry.id === held);

    cx.recorder.check({
        type: "response",
        verdict: keptSession ? "pass" : "fail",
        detail: keptSession
            ? `the DUT holds session ${held}, the one it established with TH_SERVER`
            : `the DUT tracks sessions ${tracked.map(entry => entry.id).join(", ") || "(none)"}, not the session ` +
              `${held} it established`,
    });

    return keptSession;
}

/**
 * Establishes a second session once the injected fault is spent — it is armed for one call — and
 * requires the provider's signaling for that one to be accepted.
 *
 * Beyond the plan's own steps, and the only thing that makes a refusal evidence: a requestor that
 * answers every command with a refusal, having looked at nothing, satisfies every check the plan asks
 * for.
 *
 * Registers the id the provider is about to mint *before* establishing, because the provider signals
 * from within its own handling of that command: where controller and provider share a host, that
 * signaling arrives before the response has been read, and a registration made after the response is
 * always too late. Session ids are minted in sequence
 * (`WebRTCTransportProviderCluster::GenerateSessionId`), so the next one follows the session already
 * held; the response then confirms which id the provider actually chose.
 */
export async function expectControlAccepted(
    cx: CertStepContext,
    session: CameraSession,
    kind: WebRtcSignalRecord["kind"],
    held: number,
    establish: (session: CameraSession) => Promise<number>,
): Promise<boolean> {
    const expected = held + 1;
    await registerSession(session, expected);

    const control = await establish(session);
    if (control !== expected) {
        // Registering after the response cannot win the race this pre-registration exists for, so the
        // control can no longer witness anything about the DUT
        await session.requestor.removeSession(expected);
        throw new CertCheckFailedError(
            `The provider minted session ${control} where ${expected} was registered ahead of it, so this run ` +
                "cannot establish whether the DUT accepts a session it holds",
        );
    }

    if (kind === "iceCandidates") {
        await provideIceCandidates(session, control);
    }

    const accepted = await session.requestor.nextSignal(
        signal => signal.kind === kind && signal.outcome === "accepted" && signal.sessionId === control,
        within(session, SIGNAL_TIMEOUT),
    );

    cx.recorder.check({
        type: "response",
        verdict: accepted === undefined ? "fail" : "pass",
        detail:
            accepted === undefined
                ? `the DUT accepted no ${signalName(kind)} for session ${control}, established with the fault ` +
                  `spent, so its refusal says nothing about what it refused`
                : `the DUT accepted the ${signalName(kind)} for session ${control}, so it refuses by what the ` +
                  `signaling ` +
                  `names ` +
                  "rather than refusing everything",
    });

    return accepted !== undefined;
}

/**
 * Records that the DUT did not also accept the very signaling it refused.
 *
 * Scoped to the id the refusal named rather than to every signal of that kind: a provider gathers ICE
 * candidates as it finds them and may send more than one batch, and the fault corrupts only the first,
 * so later batches naming the session the DUT holds are accepted by a conforming DUT.
 */
export function expectNoneAccepted(
    cx: CertStepContext,
    session: CameraSession,
    kind: WebRtcSignalRecord["kind"],
    refusedId: number,
): boolean {
    const accepted = session.requestor
        .signals()
        .filter(signal => signal.kind === kind && signal.outcome === "accepted" && signal.sessionId === refusedId);

    cx.recorder.check({
        type: "response",
        verdict: accepted.length === 0 ? "pass" : "fail",
        detail:
            accepted.length === 0
                ? `the DUT accepted no ${signalName(kind)} naming session ${refusedId}, the id the fault produced`
                : `the DUT accepted the ${signalName(kind)} naming session ${refusedId}, the id it had refused`,
    });

    return accepted.length === 0;
}

/** Allocates the video stream a session names, as `chip-camera-controller` does before establishing one. */
async function allocateVideoStream(session: CameraSession): Promise<number> {
    const allocation = await settled(
        session,
        "VideoStreamAllocate",
        session.node.invoke("CameraAvStreamManagement", "videoStreamAllocate", VIDEO_STREAM, PROVIDER_ENDPOINT),
    );
    return numberField(allocation, "videoStreamId", "VideoStreamAllocateResponse");
}

/**
 * Bounds an interaction the provider may never answer, so a step fails with its evidence written
 * rather than being aborted by the mocha timeout with the bundle still unflushed.
 */
async function settled<T>(session: CameraSession, label: string, op: Promise<T>): Promise<T> {
    const budget = within(session, INVOKE_TIMEOUT);
    const outcome = await settleWithin(label, op, budget);
    switch (outcome.kind) {
        case "resolved":
            return outcome.value;
        case "rejected":
            throw outcome.error instanceof Error ? outcome.error : new CertCheckFailedError(String(outcome.error));
        case "timeout":
            throw new CertCheckFailedError(`${label} neither resolved nor rejected within ${Duration.format(budget)}`);
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

/** Names a signaling command the way the specification does, so evidence reads as a sentence. */
function signalName(kind: WebRtcSignalRecord["kind"]): string {
    switch (kind) {
        case "offer":
            return "Offer";
        case "answer":
            return "Answer";
        case "iceCandidates":
            return "ICECandidates";
        case "end":
            return "End";
    }
}

/**
 * Extracts the manual pairing code from the prompt a script prints for its commissioning step. The
 * window is opened by `OpenCommissioningWindow`, which mints a fresh passcode per call, so the prompt
 * is the only place that code is ever exposed to us.
 */
function extractManualCode(promptText: string): string {
    const match = promptText.match(/manual code='(\d+)'/);
    if (!match) {
        throw new InternalError(`Prompt line carried no manual pairing code: ${promptText}`);
    }
    return match[1];
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function requestorOf(dut: { webRtcRequestor?: WebRtcRequestorApi }): WebRtcRequestorApi {
    if (dut.webRtcRequestor === undefined) {
        throw new InternalError(
            "The DUT controller hosts no WebRTC transport requestor cluster, so TH_SERVER's signaling would have " +
                "nowhere to land",
        );
    }
    return dut.webRtcRequestor;
}

/**
 * Where `PICS_SDK_CI_ONLY` is set, these scripts drive the DUT themselves: they commission and signal
 * by writing to chip's own camera-controller over that app's interactive socket, which is not a
 * controller we can be. At 0 they prompt instead, which is what lets the DUT be ours.
 */
function promptDrivenPics(tc: string) {
    const pics = chip.defaultPics.with({ PICS_SDK_CI_ONLY: 0 });
    if (pics.values.PICS_SDK_CI_ONLY !== 0) {
        throw new InternalError(
            `Overriding PICS_SDK_CI_ONLY to 0 did not take effect, so ${tc}'s script would drive TH_SERVER itself ` +
                "instead of prompting the DUT",
        );
    }
    return pics;
}

function stubSubject(tc: string): Subject {
    return {
        id: tc,
        app: "",
        commissioning: { kind: "on-network", passcode: 0, discriminator: 0, qrPairingCode: "" },
        pics: promptDrivenPics(tc),
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
