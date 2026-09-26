/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, InternalError } from "@matter/general";
import { PeerConnection, cleanup } from "node-datachannel";

/**
 * Owns one WebRTC peer connection, on behalf of a certification case in the parent process.
 *
 * It runs here rather than there because `node-datachannel` keeps the process alive once a connection
 * has run, and the only call that releases it — a process-wide `cleanup()` — kills a process that
 * still has work to do. The certification specs share one process and report at the end of it, so
 * neither outcome is survivable there: the run either never exits or dies before its verdict.
 *
 * Here both are fine. This process exists for one connection, holds nothing else, and exits when the
 * case is done with it.
 */

interface Request {
    id: number;
    op: "offer" | "answer" | "accept" | "add" | "take" | "state" | "close";
    sdp?: string;
    candidates?: { candidate: string; mid: string }[];
}

const connection = new PeerConnection("dut", { iceServers: [] });
const candidates = new Array<{ candidate: string; mid: string }>();
let state = "new";
let everConnected = false;
let channel: ReturnType<PeerConnection["createDataChannel"]> | undefined;

connection.onLocalCandidate((candidate, mid) => candidates.push({ candidate, mid }));
connection.onStateChange(next => {
    state = next;
    everConnected ||= next === "connected";
});

process.on("message", (request: Request) => {
    let result: unknown;
    let error: string | undefined;

    try {
        result = perform(request);
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    process.send?.({ id: request.id, result, error });

    if (request.op === "close") {
        cleanup();
        process.exit(0);
    }
});

function perform(request: Request) {
    switch (request.op) {
        case "offer":
            // A connection with no data channel and no track cannot describe itself at all
            channel ??= connection.createDataChannel("matter.js");
            connection.setLocalDescription();
            return described();

        case "answer":
            connection.setRemoteDescription(required(request.sdp), "offer");
            return described();

        case "accept":
            connection.setRemoteDescription(required(request.sdp), "answer");
            return undefined;

        case "add":
            for (const { candidate, mid } of request.candidates ?? []) {
                connection.addRemoteCandidate(candidate, mid);
            }
            return undefined;

        case "take":
            return candidates.splice(0);

        case "state":
            return { state, everConnected, remote: connection.remoteDescription()?.sdp };

        case "close":
            channel?.close();
            connection.close();
            return undefined;
    }
}

function described() {
    const local = connection.localDescription();
    if (local?.sdp === undefined) {
        throw new InternalError("Peer connection produced no description");
    }
    return local.sdp;
}

function required(sdp: string | undefined) {
    if (sdp === undefined) {
        throw new ImplementationError("Request carried no session description");
    }
    return sdp;
}
