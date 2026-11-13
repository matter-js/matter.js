/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject, Millis, UnexpectedDataError } from "@matter/general";
import { WebRtcTransportProvider } from "@matter/main/clusters";
import { NodeId } from "@matter/main/types";
import type { WebRtcSignalRecord } from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { expect } from "chai";
import {
    cameraControllerEndpointOf,
    MatterServerWebRtcClosedError,
    MatterServerWebRtcError,
    MatterServerWebRtcRequestor,
} from "../../src/cert/matter-server-webrtc.js";
import { MatterServerClient } from "../../src/matter-server/matter-server-client.js";
import { FakeMatterServer, type FakeServerRequest } from "./fake-matter-server.js";

const PEER = "5";
const OTHER_PEER = "6";
const PEER_ENDPOINT = 1;
const OWN_ENDPOINT = 2;
const STREAM_USAGE = 3;

async function rejectionOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (e) {
        return e;
    }
    expect.fail("expected a rejection");
}

/** What the server logs when the requestor refuses a signal for a session it does not hold for the peer. */
function refusalLine(
    kind: "offer" | "answer" | "iceCandidates" | "end",
    id: number,
    node: string,
    requestorEndpointId = OWN_ENDPOINT,
) {
    return (
        `2026-11-13 10:00:00.100 DEBUG WebRtcTransportRequestorServer session refused signal=${kind} ` +
        `webRtcSessionId=${id} fabricIndex=1 peerNodeId=${node} requestorEndpointId=${requestorEndpointId}`
    );
}

function registrationLine(id: number, node: string, requestorEndpointId = OWN_ENDPOINT) {
    return (
        `2026-11-13 10:00:00.050 DEBUG WebRtcTransportRequestorServer session upserted webRtcSessionId=${id} ` +
        `fabricIndex=1 peerNodeId=${node} peerEndpointId=${PEER_ENDPOINT} requestorEndpointId=${requestorEndpointId}`
    );
}

function removalLine(id: number, node = PEER, requestorEndpointId = OWN_ENDPOINT) {
    return (
        `2026-11-13 10:00:00.300 DEBUG WebRtcTransportRequestorServer session removed webRtcSessionId=${id} ` +
        `fabricIndex=1 peerNodeId=${node} peerEndpointId=${PEER_ENDPOINT} requestorEndpointId=${requestorEndpointId}`
    );
}

describe("matterjs-server WebRTC requestor", () => {
    let server: FakeMatterServer;
    let client: MatterServerClient;
    let lines: LineQueue;
    let log: LogFollower;
    let requestor: MatterServerWebRtcRequestor;

    function framesOf(command: string): FakeServerRequest[] {
        return server.requests.filter(request => request.command === command);
    }

    async function pushCallback(eventType: string, id: number, data: unknown, node = Number(PEER)) {
        const before = requestor.signals().length;
        server.pushEvent("webrtc_callback", {
            event_type: eventType,
            webrtc_session_id: id,
            node_id: node,
            endpoint_id: PEER_ENDPOINT,
            fabric_index: 1,
            data,
        });
        await requestor.nextSignal(() => requestor.signals().length > before, 2000);
    }

    beforeEach(async () => {
        server = await FakeMatterServer.start();
        client = await MatterServerClient.connect(server.url);
        lines = new LineQueue();
        log = new LogFollower(lines.follow(), "dut");
        server.reply = request => {
            if (request.command === "send_webrtc_provider_command") {
                const name = isObject(request.args) ? request.args.command_name : undefined;
                if (name === "SolicitOffer" || name === "ProvideOffer") {
                    lines.push(registrationLine(7, PEER));
                    return { result: { webRtcSessionId: 7 } };
                }
                return { result: null };
            }
            return { result: null };
        };
        requestor = new MatterServerWebRtcRequestor({
            command: (command, args) => client.command(command, args),
            events: client.events,
            log,
            nodeIdOf: peer => NodeId(BigInt(peer)),
            endpoint: OWN_ENDPOINT,
            logTimeout: Millis(200),
        });
    });

    afterEach(async () => {
        requestor.close();
        lines.close();
        await log.close();
        await client.close();
        await server.close();
    });

    it("solicitOffer sends SolicitOffer and resolves with the minted id", async () => {
        const id = await requestor.solicitOffer({
            peer: PEER,
            endpoint: PEER_ENDPOINT,
            streamUsage: STREAM_USAGE,
            videoStreamId: 4,
            audioStreamId: null,
        });

        expect(id).equals(7);
        expect(framesOf("send_webrtc_provider_command").map(frame => frame.args)).deep.equals([
            {
                node_id: 5,
                endpoint_id: PEER_ENDPOINT,
                command_name: "SolicitOffer",
                payload: { streamUsage: STREAM_USAGE, videoStreamId: 4, audioStreamId: null },
            },
        ]);
    });

    it("throws where the response names no session id", async () => {
        server.reply = () => ({ result: {} });

        const error = await rejectionOf(
            requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE }),
        );

        expect(error).instanceOf(UnexpectedDataError);
    });

    it("provideOffer sends ProvideOffer with a null session id and the sdp", async () => {
        const id = await requestor.provideOffer({
            peer: PEER,
            endpoint: PEER_ENDPOINT,
            streamUsage: STREAM_USAGE,
            videoStreamId: 4,
            sdp: "v=0",
        });

        expect(id).equals(7);
        expect(framesOf("send_webrtc_provider_command").map(frame => frame.args)).deep.equals([
            {
                node_id: 5,
                endpoint_id: PEER_ENDPOINT,
                command_name: "ProvideOffer",
                payload: { webRtcSessionId: null, sdp: "v=0", streamUsage: STREAM_USAGE, videoStreamId: 4 },
            },
        ]);
    });

    it("provideAnswer and provideIceCandidates send their provider commands", async () => {
        await requestor.provideAnswer(PEER, PEER_ENDPOINT, 7, "answer-sdp");
        await requestor.provideIceCandidates(PEER, PEER_ENDPOINT, 7, [
            { candidate: "candidate:1", sdpMid: "0", sdpmLineIndex: 0 },
        ]);

        expect(framesOf("send_webrtc_provider_command").map(frame => frame.args)).deep.equals([
            {
                node_id: 5,
                endpoint_id: PEER_ENDPOINT,
                command_name: "ProvideAnswer",
                payload: { webRtcSessionId: 7, sdp: "answer-sdp" },
            },
            {
                node_id: 5,
                endpoint_id: PEER_ENDPOINT,
                command_name: "ProvideIceCandidates",
                payload: {
                    webRtcSessionId: 7,
                    iceCandidates: [{ candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 }],
                },
            },
        ]);
    });

    it("endSession sends EndSession through device_command", async () => {
        await requestor.endSession(PEER, PEER_ENDPOINT, 7, 2);

        expect(framesOf("device_command").map(frame => frame.args)).deep.equals([
            {
                node_id: 5,
                endpoint_id: PEER_ENDPOINT,
                cluster_id: WebRtcTransportProvider.Cluster.id,
                command_name: "EndSession",
                payload: { webRtcSessionId: 7, reason: 2 },
            },
        ]);
    });

    it("records an accepted offer from webrtc_callback with its sdp", async () => {
        await pushCallback("offer", 3, { sdp: "offer-sdp" });

        const [signal] = requestor.signals();
        expect(signal).deep.include({ kind: "offer", sessionId: 3, outcome: "accepted", sdp: "offer-sdp" });
    });

    it("maps answer, candidates and end callbacks onto their kinds", async () => {
        await pushCallback("answer", 3, { sdp: "answer-sdp" });
        await pushCallback("ice_candidates", 3, {
            ice_candidates: [{ candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 1 }],
        });
        await pushCallback("end", 3, { reason: 0 });

        const signals = requestor.signals();
        expect(signals.map(({ kind, sessionId, outcome }) => ({ kind, sessionId, outcome }))).deep.equals([
            { kind: "answer", sessionId: 3, outcome: "accepted" },
            { kind: "iceCandidates", sessionId: 3, outcome: "accepted" },
            { kind: "end", sessionId: 3, outcome: "accepted" },
        ]);
        expect(signals[0].sdp).equals("answer-sdp");
        expect(signals[1].candidates).deep.equals([{ candidate: "candidate:1", sdpMid: "0", sdpmLineIndex: 1 }]);
    });

    it("keeps the session id of a callback for a session the case never opened", async () => {
        await pushCallback("answer", 99, { sdp: "x" });

        expect(requestor.signals().map(signal => signal.sessionId)).deep.equals([99]);
    });

    it("records a refusal from the server log with the refused id", async () => {
        await requestor.provideAnswer(PEER, PEER_ENDPOINT, 7, "sdp");
        lines.push(refusalLine("iceCandidates", 42, PEER));

        const signal = await requestor.nextSignal(each => each.outcome === "refused", 2000);

        expect(signal).deep.include({ kind: "iceCandidates", sessionId: 42, outcome: "refused" });
    });

    it("ignores a refusal logged for another peer", async () => {
        await requestor.provideAnswer(PEER, PEER_ENDPOINT, 7, "sdp");
        lines.push(refusalLine("answer", 42, OTHER_PEER));
        lines.push(refusalLine("answer", 43, PEER));

        const signal = await requestor.nextSignal(each => each.outcome === "refused", 2000);

        expect(signal?.sessionId).equals(43);
        expect(requestor.signals().map(each => each.sessionId)).deep.equals([43]);
    });

    it("ignores a refusal logged for another requestor endpoint", async () => {
        await requestor.provideAnswer(PEER, PEER_ENDPOINT, 7, "sdp");
        lines.push(refusalLine("answer", 42, PEER, OWN_ENDPOINT + 1));
        lines.push(refusalLine("answer", 43, PEER));

        const signal = await requestor.nextSignal(each => each.outcome === "refused", 2000);

        expect(signal?.sessionId).equals(43);
        expect(requestor.signals().map(each => each.sessionId)).deep.equals([43]);
    });

    it("ignores a refusal logged before the requestor started", async () => {
        lines.push(refusalLine("answer", 41, PEER));
        await log.settled();
        const late = new MatterServerWebRtcRequestor({
            command: (command, args) => client.command(command, args),
            events: client.events,
            log,
            nodeIdOf: peer => NodeId(BigInt(peer)),
            endpoint: OWN_ENDPOINT,
        });
        try {
            await late.provideAnswer(PEER, PEER_ENDPOINT, 7, "sdp");
            await log.settled();

            expect(late.signals()).deep.equals([]);
        } finally {
            late.close();
        }
    });

    it("nextSignal resolves at once for a signal already recorded", async () => {
        await pushCallback("offer", 3, { sdp: "offer-sdp" });

        const started = Date.now();
        const signal = await requestor.nextSignal(each => each.kind === "offer", 60_000);

        expect(signal?.sessionId).equals(3);
        expect(Date.now() - started).lessThan(1000);
    });

    it("nextSignal resolves undefined at the timeout and when closed", async () => {
        expect(await requestor.nextSignal(() => true, 20)).equals(undefined);

        const waiting = requestor.nextSignal(() => true, 60_000);
        requestor.close();

        expect(await waiting).equals(undefined);
    });

    it("solicitOffer after close throws a closed error rather than wait for the log", async () => {
        requestor.close();

        const error = await rejectionOf(
            requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE }),
        );

        expect(error).instanceOf(MatterServerWebRtcClosedError);
    });

    it("nextSignal passes over a signal that does not match and resolves with the next that does", async () => {
        const waiting = requestor.nextSignal(each => each.kind === "answer", 2000);
        await pushCallback("offer", 3, { sdp: "x" });
        await pushCallback("answer", 3, { sdp: "y" });

        expect(await waiting).deep.include({ kind: "answer", sessionId: 3 });
    });

    it("nextSignal after close resolves undefined at once", async () => {
        requestor.close();

        const started = Date.now();
        expect(await requestor.nextSignal(() => true, 60_000)).equals(undefined);
        expect(Date.now() - started).lessThan(1000);
    });

    it("ignores a malformed webrtc_callback without throwing", async () => {
        for (const data of [
            "not an object",
            { event_type: "offer", webrtc_session_id: "3", node_id: 5, data: {} },
            { event_type: "offer", webrtc_session_id: 3, data: {} },
            { event_type: "offer", webrtc_session_id: 3, node_id: "5", data: {} },
            { event_type: "unknown", webrtc_session_id: 3, node_id: 5, data: {} },
        ]) {
            server.pushEvent("webrtc_callback", data);
        }
        await pushCallback("ice_candidates", 4, { ice_candidates: [{ sdpMid: "0" }, "x", { candidate: "c:1" }] });
        await pushCallback("answer", 4, "no payload object");

        expect(
            requestor.signals().map(({ kind, sessionId, candidates, sdp }) => ({ kind, sessionId, candidates, sdp })),
        ).deep.equals([
            {
                kind: "iceCandidates",
                sessionId: 4,
                candidates: [{ candidate: "c:1", sdpMid: null, sdpmLineIndex: null }],
                sdp: undefined,
            },
            { kind: "answer", sessionId: 4, candidates: undefined, sdp: undefined },
        ]);
    });

    it("orders callbacks and refusals on one clock", async () => {
        await requestor.provideAnswer(PEER, PEER_ENDPOINT, 7, "sdp");
        await pushCallback("offer", 3, { sdp: "x" });
        lines.push(refusalLine("end", 42, PEER));
        await requestor.nextSignal(each => each.outcome === "refused", 2000);
        await pushCallback("answer", 3, { sdp: "y" });

        const order = requestor.signals().map((signal: WebRtcSignalRecord) => signal.kind);
        const times = requestor.signals().map(signal => signal.at);

        expect(order).deep.equals(["offer", "end", "answer"]);
        expect([...times].sort((a, b) => a - b)).deep.equals(times);
        expect(new Set(times).size).equals(3);
    });

    it("sessions holds a session once the server logged its registration", async () => {
        const id = await requestor.solicitOffer({
            peer: PEER,
            endpoint: PEER_ENDPOINT,
            streamUsage: STREAM_USAGE,
            videoStreamId: 4,
        });
        lines.push(registrationLine(id, PEER));
        lines.push(registrationLine(8, PEER, OWN_ENDPOINT + 1));
        await log.settled();

        expect(await requestor.sessions()).deep.equals([{ id: 7, videoStreamId: 4, audioStreamId: null }]);
    });

    it("sessions drops a session after its removal is logged", async () => {
        const id = await requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE });
        lines.push(registrationLine(id, PEER));
        await log.settled();
        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7]);

        lines.push(removalLine(id, OTHER_PEER));
        lines.push(removalLine(id, PEER, OWN_ENDPOINT + 1));
        await log.settled();
        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7]);

        lines.push(removalLine(id));
        await log.settled();

        expect(await requestor.sessions()).deep.equals([]);
    });

    it("holds the same session id of two peers apart", async () => {
        server.reply = request => {
            if (request.command === "send_webrtc_provider_command" && isObject(request.args)) {
                lines.push(registrationLine(7, String(request.args.node_id)));
                return { result: { webRtcSessionId: 7 } };
            }
            return { result: null };
        };

        expect(await requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE })).equals(
            7,
        );
        expect(
            await requestor.solicitOffer({ peer: OTHER_PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE }),
        ).equals(7);
        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7, 7]);

        lines.push(removalLine(7, OTHER_PEER));
        await log.settled();

        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7]);
    });

    it("solicitOffer does not count another peer's registration of the same id", async () => {
        await requestor.provideAnswer(OTHER_PEER, PEER_ENDPOINT, 1, "sdp");
        server.reply = request => {
            if (request.command === "send_webrtc_provider_command") {
                lines.push(registrationLine(7, OTHER_PEER));
                return { result: { webRtcSessionId: 7 } };
            }
            return { result: null };
        };

        const error = await rejectionOf(
            requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE }),
        );

        expect(error).instanceOf(MatterServerWebRtcError);
        expect(String(error)).match(/registration of session 7 of node 5/);
    });

    it("an end callback drops the held session and ends the wait of endSession", async () => {
        const id = await requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE });

        const ending = requestor.endSession(PEER, PEER_ENDPOINT, id, 0);
        await new Promise(resolve => setTimeout(resolve, 50));
        await pushCallback("end", id, { reason: 0 });
        await ending;

        expect(await requestor.sessions()).deep.equals([]);
    });

    it("an end callback from another peer keeps the session held", async () => {
        const id = await requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE });

        await pushCallback("end", id, { reason: 0 }, Number(OTHER_PEER));

        expect((await requestor.sessions()).map(session => session.id)).deep.equals([id]);
    });

    it("close ends a pending registration wait with a closed error", async () => {
        server.reply = () => ({ result: { webRtcSessionId: 7 } });
        const slow = new MatterServerWebRtcRequestor({
            command: (command, args) => client.command(command, args),
            events: client.events,
            log,
            nodeIdOf: peer => NodeId(BigInt(peer)),
            endpoint: OWN_ENDPOINT,
            logTimeout: Millis(60_000),
        });
        const soliciting = rejectionOf(
            slow.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE }),
        );
        await new Promise(resolve => setTimeout(resolve, 50));

        const started = Date.now();
        slow.close();
        const error = await soliciting;

        expect(error).instanceOf(MatterServerWebRtcClosedError);
        expect(Date.now() - started).lessThan(1000);
    });

    it("endSession keeps the session held until the removal line arrives", async () => {
        const id = await requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE });
        let ended = false;

        const ending = requestor.endSession(PEER, PEER_ENDPOINT, id, 0).then(() => (ended = true));
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(ended).equals(false);
        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7]);

        lines.push(removalLine(id));
        await ending;

        expect(await requestor.sessions()).deep.equals([]);
    });

    it("endSession throws where the server never logs the removal", async () => {
        const id = await requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE });

        const error = await rejectionOf(requestor.endSession(PEER, PEER_ENDPOINT, id, 0));

        expect(error).instanceOf(MatterServerWebRtcError);
        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7]);
    });

    it("solicitOffer resolves only after the server logged the registration", async () => {
        server.reply = request => {
            if (request.command === "send_webrtc_provider_command") {
                return { result: { webRtcSessionId: 7 } };
            }
            return { result: null };
        };
        let id: number | undefined;

        const soliciting = requestor
            .solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE })
            .then(minted => (id = minted));
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(id).equals(undefined);

        lines.push(registrationLine(7, PEER));
        await soliciting;

        expect(id).equals(7);
        expect((await requestor.sessions()).map(session => session.id)).deep.equals([7]);
    });

    it("solicitOffer throws where the server never logs the registration", async () => {
        server.reply = () => ({ result: { webRtcSessionId: 7 } });

        const error = await rejectionOf(
            requestor.solicitOffer({ peer: PEER, endpoint: PEER_ENDPOINT, streamUsage: STREAM_USAGE }),
        );

        expect(error).instanceOf(MatterServerWebRtcError);
    });

    it("stops recording after close", async () => {
        await requestor.provideAnswer(PEER, PEER_ENDPOINT, 7, "sdp");
        requestor.close();

        server.pushEvent("webrtc_callback", {
            event_type: "answer",
            webrtc_session_id: 3,
            node_id: 5,
            endpoint_id: 1,
            fabric_index: 1,
            data: { sdp: "x" },
        });
        lines.push(refusalLine("answer", 42, PEER));
        await log.settled();
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(requestor.signals()).deep.equals([]);
    });
});

describe("matterjs-server camera-controller endpoint", () => {
    let lines: LineQueue;
    let log: LogFollower;

    /** What matter.js logs once an endpoint is initialized. */
    function readyLine(id: string, number: number) {
        return (
            `2026-11-13 10:00:00.010 INFO Endpoint matter-server.${id} ready endpoint#: ${number} ` +
            `type: CameraController (0x147, rev 1) behaviors: [descriptor, webRtcTransportRequestor]`
        );
    }

    beforeEach(() => {
        lines = new LineQueue();
        log = new LogFollower(lines.follow(), "dut");
    });

    afterEach(async () => {
        lines.close();
        await log.close();
    });

    it("reads the number from the endpoint's ready line, not from another endpoint's", async () => {
        lines.push(readyLine("ota-provider", 1));
        lines.push(readyLine("camera-controller", 2));

        expect(await cameraControllerEndpointOf(log, Millis(200))).equals(2);
    });

    it("waits for a ready line logged after the call", async () => {
        const endpoint = cameraControllerEndpointOf(log, Millis(2000));
        lines.push(readyLine("camera-controller", 3));

        expect(await endpoint).equals(3);
    });

    it("reads a ready line logged before the log was marked", async () => {
        lines.push(readyLine("camera-controller", 2));
        await log.settled();
        log.mark();

        expect(await cameraControllerEndpointOf(log, Millis(100))).equals(2);
    });

    it("does not read the number of an endpoint whose id only starts with camera-controller", async () => {
        lines.push(readyLine("camera-controller-aux", 4));

        const error = await rejectionOf(cameraControllerEndpointOf(log, Millis(100)));
        expect(error).instanceOf(MatterServerWebRtcError);
    });

    it("throws where the server never logs the endpoint", async () => {
        lines.push(readyLine("ota-provider", 1));

        const error = await rejectionOf(cameraControllerEndpointOf(log, Millis(100)));
        expect(error).instanceOf(MatterServerWebRtcError);
    });
});
