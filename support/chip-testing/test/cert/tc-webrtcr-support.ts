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
    WebRtcIceCandidate,
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
import { WebRtcPeer } from "./webrtc-peer.js";

/** Endpoint of TH_SERVER's camera clusters, which `chip-camera-app` fixes at 1. */
const PROVIDER_ENDPOINT = 1;

/**
 * What a case may spend answering prompts, in total.
 *
 * The script's own `default_timeout` of three minutes covers its whole test body — setup,
 * commissioning and every prompt — not the single wait a handler is in. Waits that only cap each
 * other individually add up: TC-WEBRTCR-2.5 answers six prompts. Outliving the script has mobly abort
 * it while a handler still holds stdin, and the case then fails as a script timeout rather than as the
 * verdict it had reached. So every wait in a case shares one deadline, and what is left of it caps
 * each.
 *
 * The provider answers in milliseconds when it answers at all, so this is headroom, not a target.
 */
const CASE_BUDGET = Seconds(150);

/** Caps on single waits, each further bounded by what is left of {@link CASE_BUDGET}. */
const SIGNAL_TIMEOUT = Seconds(30);
const INVOKE_TIMEOUT = Seconds(30);

/** How long one round of the candidate exchange waits before trying the next. */
const ICE_ROUND = Seconds(2);

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

    /** What is left of {@link CASE_BUDGET}, which every wait in the case shares. */
    remaining(): Duration;

    /** The controller's own WebRTC endpoint, for a case whose plan asks for an established session. */
    peer: WebRtcPeer;
}

/** `cap`, or what is left of the case's budget where that is less. */
function within(session: CameraSession, cap: Duration): Duration {
    return Millis(Math.min(cap, session.remaining()));
}

/** How a case answers one of its script's prompts. */
export interface CameraStep<S> {
    /** First line of the prompt the script prints for this step. */
    prompt: RegExp;

    /**
     * The step number that prompt belongs to, as the plan numbers it — or how to derive it, for a
     * script that prints one prompt for several of its steps.
     */
    step: string | ((state: S) => string);

    /**
     * Answers it. Every check recorded reaches the evidence bundle, and the verdict decides what the
     * script is told — `"Y"` for a pass, `"N"` otherwise — unless `answer` states the text itself, as
     * the prompt that asks for a session id requires.
     */
    run(
        cx: CertStepContext,
        session: CameraSession,
        state: S,
    ): Promise<StepVerdict | { verdict: StepVerdict; answer: string }>;
}

/** A certification case driving `chip-camera-app` through one of its python scripts. */
export interface CameraCase<S = void> {
    /** e.g. `"TC-WEBRTCR-2.2"`. */
    tc: string;

    /** The script's file name, e.g. `"TC_WEBRTCR_2_2.py"`. */
    script: string;

    /** The script's test method, e.g. `"test_TC_WebRTCR_2_2"`. */
    subpath: string;

    /** Reads after the id in the test's own name. */
    title: string;

    /**
     * How this case's script asks the DUT to commission TH_SERVER. The cases that open a commissioning
     * window state a manual pairing code in the prompt; the ones that commission the app as the script
     * spawned it print no code, and the DUT pairs with the fixed passcode and discriminator instead.
     */
    commissioning: "manual-code" | "fixed-passcode";

    /** Answers the script's remaining prompts, in any order the script prints them. */
    steps: CameraStep<S>[];
}

/**
 * A case whose steps share state, created once per run. A script that prints the same prompt for
 * several of its steps needs this to tell them apart, and a case that declares such state must say how
 * to create it.
 */
export interface StatefulCameraCase<S> extends CameraCase<S> {
    begin(): S;
}

/**
 * Declares a python-wrapped certification case against `chip-camera-app`.
 *
 * The script drives its own scenario and prompts for the actions a DUT must take; this answers those
 * prompts with our own controller. Commissioning is handled here because every case asks for it in one
 * of two ways; the steps are what differ.
 */
export function certCameraCase(definition: CameraCase): void;
export function certCameraCase<S>(definition: StatefulCameraCase<S>): void;
export function certCameraCase<S>(definition: CameraCase<S> & { begin?: () => S }) {
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

            const answered = new Set<CameraStep<S>>();
            const state: { ref?: CertNodeRef; session?: CameraSession } = {};
            const peer = new WebRtcPeer();
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

                let endsAt: number | undefined;
                const sessionOf = async () => {
                    // Starts at the first prompt, not at startup: container exec, camera spawn and
                    // commissioning all happen first, and a budget that included them would leave a
                    // slow run with nothing left and record that as the DUT answering nothing
                    endsAt ??= Time.nowUs + CASE_BUDGET;
                    if (state.session === undefined) {
                        if (state.ref === undefined) {
                            throw new InternalError(
                                "The script asked for a step before the DUT commissioned TH_SERVER",
                            );
                        }
                        const node = cx.controllers.dut.node(state.ref);
                        state.session = {
                            node,
                            requestor: requestorOf(dut),
                            ref: state.ref,
                            peer,
                            videoStreamId: 0,
                            remaining: () => Millis(Math.max(0, (endsAt ?? Time.nowUs) - Time.nowUs)),
                        };
                        state.session.videoStreamId = await allocateVideoStream(state.session);
                    }
                    return state.session;
                };

                const caseState = definition.begin?.() as S;
                const handlers = [
                    commissionHandler(definition, state),
                    ...definition.steps.map(step => stepHandler(step, sessionOf, answered, caseState)),
                ];
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

                // A script reaches its own verdict whether or not a prompt was answered, so a prompt
                // this no longer matches leaves the case passing on nothing
                const unanswered = definition.steps.filter(step => !answered.has(step));
                if (unanswered.length) {
                    throw new InternalError(
                        `${definition.script} printed no line matching ` +
                            `${unanswered.map(step => `${step.prompt}`).join(", ")}, so nothing ` +
                            "put those to the DUT",
                    );
                }
            } catch (e) {
                bodyFailure = e;
                throw e;
            } finally {
                try {
                    await peer.close();
                } catch (e) {
                    // Everything below writes the run's evidence, and a native teardown fault must not
                    // take it with it
                    console.warn(`${definition.tc} could not close its peer connection:`, e);
                }

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
 * The discriminator and passcode every one of these scripts starts `chip-camera-app` with
 * (`setup_class`), which the cases that print no pairing code expect the DUT to use.
 */
const FIXED_DISCRIMINATOR = 1234;
const FIXED_PASSCODE = 20202021;

/**
 * Answers a script's commissioning prompt by commissioning TH_SERVER through the DUT's own controller.
 *
 * Matches only the prompt's first line: its later lines repeat the same action as chip-tool and
 * camera-controller hints, and a handler matching one of those would write a second answer into the
 * script's stdin, which the *next* prompt's `input()` would consume.
 */
function commissionHandler(definition: Pick<CameraCase, "commissioning">, state: { ref?: CertNodeRef }): PromptHandler {
    const byManualCode = definition.commissioning === "manual-code";

    return {
        pattern: byManualCode
            ? /Please commission the server app from DUT: manual code='\d+'/
            : // Not anchored at the end: the scripts that print no pairing code end the line there today,
              // and a trailing space would otherwise stop the handler firing at all
              /Please commission the server app from DUT:(?! manual code)/,
        async action(cx: CertStepContext, promptText: string) {
            const stepDef: CertStepDefinition = {
                number: byManualCode ? "3" : "1",
                text: promptText,
                run: async () => {},
            };
            cx.recorder.beginStep(stepDef);

            const target = byManualCode
                ? { manualPairingCode: extractManualCode(promptText) }
                : { passcode: FIXED_PASSCODE, discriminator: FIXED_DISCRIMINATOR };

            let verdict: StepVerdict;
            let answer: string;
            try {
                state.ref = await cx.controllers.dut.commission({ ...target, giveUpAfterMs: COMMISSION_TIMEOUT });
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

/** Runs one of a case's steps against the camera the DUT commissioned. */
function stepHandler<S>(
    step: CameraStep<S>,
    sessionOf: () => Promise<CameraSession>,
    answered: Set<CameraStep<S>>,
    state: S,
): PromptHandler {
    return {
        pattern: step.prompt,
        async action(cx: CertStepContext, promptText: string) {
            const number = typeof step.step === "string" ? step.step : step.step(state);
            const stepDef: CertStepDefinition = { number, text: promptText, run: async () => {} };
            cx.recorder.beginStep(stepDef);
            answered.add(step);

            let verdict: StepVerdict = "fail";
            let answer: string | undefined;
            try {
                const outcome = await step.run(cx, await sessionOf(), state);
                if (typeof outcome === "string") {
                    verdict = outcome satisfies StepVerdict;
                } else {
                    verdict = outcome.verdict;
                    answer = outcome.answer;
                }
            } finally {
                // The recorder drops a step that never ends, so a throw from an invoke here would take
                // the whole step — and every check it recorded — out of the bundle.
                cx.recorder.endStep(stepDef, verdict);
            }

            return `${answer ?? (verdict === "pass" ? "Y" : "N")}\n`;
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
    return provideOfferWith(session, OFFER_SDP);
}

/** Offers the provider the session description the controller's own peer connection generated. */
async function provideOfferFor(session: CameraSession): Promise<number> {
    return provideOfferWith(session, await session.peer.offer());
}

async function provideOfferWith(session: CameraSession, sdp: string): Promise<number> {
    const provided = await settled(
        session,
        "ProvideOffer",
        session.node.invoke(
            "WebRtcTransportProvider",
            "provideOffer",
            {
                webRtcSessionId: null,
                sdp,
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
export async function provideIceCandidates(
    session: CameraSession,
    webRtcSessionId: number,
    iceCandidates: readonly WebRtcIceCandidate[] = [ICE_CANDIDATE],
): Promise<void> {
    await settled(
        session,
        "ProvideICECandidates",
        session.node.invoke(
            "WebRtcTransportProvider",
            "provideIceCandidates",
            { webRtcSessionId, iceCandidates },
            PROVIDER_ENDPOINT,
        ),
    );
}

/**
 * Carries a session all the way to a connected peer connection, which is what a plan step reading
 * "the session is established" asks the provider to report.
 *
 * `"solicit"` has the provider offer and the controller answer; `"provide"` has the controller offer
 * and the provider answer. Both then trade ICE candidates.
 *
 * Registers the id the provider is about to mint *before* asking for it: the provider signals from
 * inside its own handling of that command, so a registration made after the response is too late and
 * the DUT would refuse signaling for a session it is about to hold. Ids are minted in sequence, so the
 * next one follows the session the case already holds, and the first is 0.
 */
export async function establishSession(
    session: CameraSession,
    mode: "solicit" | "provide",
    held?: number,
): Promise<Established> {
    const expected = held === undefined ? 0 : held + 1;
    await registerSession(session, expected);

    const id = mode === "solicit" ? await solicitOffer(session) : await provideOfferFor(session);
    if (id !== expected) {
        await session.requestor.removeSession(expected);
        throw new CertCheckFailedError(
            `The provider minted session ${id} where ${expected} was registered ahead of it, so its signaling for ` +
                "that session could not be accepted and this run cannot establish one",
        );
    }

    const description = await session.requestor.nextSignal(
        signal =>
            signal.kind === (mode === "solicit" ? "offer" : "answer") &&
            signal.outcome === "accepted" &&
            signal.sessionId === id,
        within(session, SIGNAL_TIMEOUT),
    );

    if (description?.sdp === undefined) {
        return { id, connected: false, reached: mode === "solicit" ? "no-offer" : "no-answer", rewroteRole: false };
    }

    let rewroteRole = false;
    if (mode === "solicit") {
        await provideAnswer(session, id, await session.peer.answer(description.sdp));
    } else {
        rewroteRole = (await session.peer.accept(description.sdp)).rewroteRole;
    }

    return { id, connected: await exchangeCandidates(session, id), reached: "signaled", rewroteRole };
}

/** What {@link establishSession} reached, so a failure names the stage rather than only the outcome. */
export interface Established {
    id: number;
    connected: boolean;
    reached: "no-offer" | "no-answer" | "signaled";

    /** Whether the provider's answer had to have its DTLS role settled before the connection would take it. */
    rewroteRole: boolean;
}

/** Candidate batches already fed to the peer connection, so a later round waits for the next one. */
const consumed = new WeakSet<WebRtcSignalRecord>();

/**
 * Trades ICE candidates until the connection completes or the case runs out of budget.
 *
 * Both ends trickle: each gathers as it goes and sends more than one batch. A single exchange connects
 * on a quiet host and leaves the connection waiting on one that finds a working candidate late, so
 * this keeps sending what has been gathered and taking what has arrived.
 */
async function exchangeCandidates(session: CameraSession, id: number): Promise<boolean> {
    for (;;) {
        const ours = await session.peer.take();
        if (ours.length) {
            await provideIceCandidates(session, id, ours);
        }

        if (await session.peer.connected(within(session, ICE_ROUND))) {
            return true;
        }

        if (session.remaining() <= 0) {
            return false;
        }

        const theirs = await session.requestor.nextSignal(
            signal =>
                signal.kind === "iceCandidates" &&
                signal.outcome === "accepted" &&
                signal.sessionId === id &&
                !consumed.has(signal),
            within(session, ICE_ROUND),
        );

        if (theirs?.candidates?.length) {
            consumed.add(theirs);
            await session.peer.add(theirs.candidates);
        }
    }
}

/**
 * Records whether the session reached a connected peer connection, which is the plan's own wording,
 * and where it stopped when it did not.
 */
export function expectEstablished(cx: CertStepContext, session: CameraSession, established: Established): boolean {
    const stage = {
        "no-offer": "the provider sent no Offer the DUT accepted",
        "no-answer": "the provider sent no Answer the DUT accepted",
        signaled: `the DUT's peer connection reports "${session.peer.state}"`,
    }[established.reached];

    cx.recorder.check({
        type: "response",
        verdict: established.connected ? "pass" : "fail",
        detail: established.connected
            ? `session ${established.id} reached a connected peer connection between the DUT and TH_SERVER`
            : `session ${established.id} did not connect: ${stage}`,
    });

    // States the deviation rather than certifying a connection built on an answer the harness altered
    if (established.rewroteRole) {
        cx.recorder.check({
            type: "response",
            verdict: "pass",
            detail:
                `TH_SERVER's answer for session ${established.id} carried a=setup:actpass, which an answer may not ` +
                "carry and which the DUT's peer connection refuses outright, so the harness settled the role to " +
                "a=setup:active before feeding it in; the connection below rests on that substitution",
        });
    }

    return established.connected;
}

/**
 * Ends a session from the controller's side, as the plan's own `end-session` step does, and stops
 * tracking it.
 *
 * Both halves are the controller's job. `EndSession` tells the provider; the requestor cluster drops a
 * session by itself only when the *peer* ends it, and its own documentation has the application call
 * `removeSession` when it tears a stream down locally. A controller that skipped this would keep
 * reporting a session it has ended in `CurrentSessions`.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 11.5.6.7
 */
export async function endSession(session: CameraSession, id: number, reason: number): Promise<void> {
    await settled(
        session,
        "EndSession",
        session.node.invoke(
            "WebRtcTransportProvider",
            "endSession",
            { webRtcSessionId: id, reason },
            PROVIDER_ENDPOINT,
        ),
    );

    await session.requestor.removeSession(id);
}

/** Records the sessions the DUT's requestor cluster holds, which `CurrentSessions` reports. */
export async function expectSessions(
    cx: CertStepContext,
    session: CameraSession,
    expected: readonly number[],
): Promise<boolean> {
    const held = (await session.requestor.sessions()).map(entry => entry.id);
    const matches = held.length === expected.length && expected.every(id => held.includes(id));

    cx.recorder.check({
        type: "response",
        verdict: matches ? "pass" : "fail",
        detail: `the DUT's CurrentSessions holds ${describeSessions(held)}, where the plan states ${describeSessions(expected)}`,
    });

    return matches;
}

function describeSessions(ids: readonly number[]): string {
    return ids.length === 0 ? "no session" : `session ${ids.join(", ")}`;
}

/** Answers the provider's offer, for a session the controller solicited. */
async function provideAnswer(session: CameraSession, id: number, sdp: string): Promise<void> {
    await settled(
        session,
        "ProvideAnswer",
        session.node.invoke(
            "WebRtcTransportProvider",
            "provideAnswer",
            { webRtcSessionId: id, sdp },
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
