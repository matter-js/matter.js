/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Diagnostic,
    Duration,
    isObject,
    Logger,
    MatterError,
    Millis,
    type Observable,
    Seconds,
    Time,
    UnexpectedDataError,
} from "@matter/general";
import { WebRtcTransportProvider } from "@matter/main/clusters";
import type { NodeId } from "@matter/main/types";
import type {
    CertNodeRef,
    LogFollower,
    WebRtcIceCandidate,
    WebRtcOfferRequest,
    WebRtcRequestorApi,
    WebRtcSessionRecord,
    WebRtcSignalRecord,
} from "@matter/testing";

const logger = Logger.get("MatterServerWebRtc");

/**
 * Matches the interaction layer's log line for a signal the server's requestor answered `NotFound`: peer node id (hex)
 * in the exchange token, the signal's command and the refused session id in the status text.
 *
 * Provisional until verified against a live server log.
 */
export const WEBRTC_REFUSAL_LINE =
    /Invoke error @[0-9a-f]+:(?<peer>[0-9a-f]+)•\S+ \S*webRtcTransportRequestor\.(?<kind>offer|answer|iceCandidates|end): Status=NotFound\b.*WebRTC session (?<id>\d+) not found/;

/**
 * Matches the requestor's debug line for a session registered with it (`WebRtcTransportRequestorServer.upsertSession`),
 * which is when the requestor starts to accept the peer's signaling for it. The server runs matter.js at debug level;
 * the line reaches a server build only with a matter.js version that logs it.
 *
 * Provisional until verified against a live server log.
 */
export const WEBRTC_SESSION_REGISTERED_LINE =
    /WebRtcTransportRequestorServer session upserted webRtcSessionId=(?<id>\d+) fabricIndex=\d+ peerNodeId=(?<peer>\d+) peerEndpointId=\d+ requestorEndpointId=(?<endpoint>\d+)/;

/**
 * Matches the requestor's debug line for a session dropped from it (`WebRtcTransportRequestorServer.removeSession`),
 * logged only where an entry was removed, whether the case, the server or the peer's `End` ended the session. The
 * requestor refuses the peer's signaling for it from then on. The server runs matter.js at debug level; the line
 * reaches a server build only with a matter.js version that logs it.
 *
 * Provisional until verified against a live server log.
 */
export const WEBRTC_SESSION_REMOVED_LINE =
    /WebRtcTransportRequestorServer session removed webRtcSessionId=(?<id>\d+) fabricIndex=\d+ peerNodeId=(?<peer>\d+) peerEndpointId=\d+ requestorEndpointId=(?<endpoint>\d+)/;

/** How long the server may take to log what it already did, once its response or command result arrived. */
const LOG_LAG = Seconds(10);

/** The server did not log the session registration or removal the harness waits for. */
export class MatterServerWebRtcError extends MatterError {}

/** The `event_type` of a `webrtc_callback` to the signal kind. */
const CALLBACK_KINDS = new Map<string, WebRtcSignalRecord["kind"]>([
    ["offer", "offer"],
    ["answer", "answer"],
    ["ice_candidates", "iceCandidates"],
    ["end", "end"],
]);

/** The requestor command named in a refusal line to the signal kind. */
const REFUSED_KINDS = new Map<string, WebRtcSignalRecord["kind"]>([
    ["offer", "offer"],
    ["answer", "answer"],
    ["iceCandidates", "iceCandidates"],
    ["end", "end"],
]);

/** What {@link MatterServerWebRtcRequestor} needs of the adapter it runs for. */
export interface MatterServerWebRtcHost {
    command(command: string, args: object): Promise<unknown>;

    /** What the server pushes to this connection, `webrtc_callback` among it. */
    readonly events: Observable<[event: string, data: unknown]>;

    /** The server's log, which carries the requestor's refusals and its session registrations. */
    readonly log: LogFollower;

    nodeIdOf(peer: CertNodeRef): NodeId;

    /** The server's own camera-controller endpoint (requestor). */
    readonly endpoint: number;

    /** How long to wait for the server's log to show a registration or removal; defaults to ten seconds. */
    readonly logTimeout?: Duration;
}

/**
 * The requestor side of WebRTC signaling on a matterjs-server controller.
 *
 * Commands go through the WebSocket API. What the server's requestor accepted arrives as `webrtc_callback` events.
 * What it refused, and which sessions it holds, the API does not report, so both are read from the server's log:
 * see {@link WEBRTC_REFUSAL_LINE}, {@link WEBRTC_SESSION_REGISTERED_LINE} and {@link WEBRTC_SESSION_REMOVED_LINE}. {@link solicitOffer}, {@link provideOffer} and {@link endSession} resolve only
 * once the log shows the registration or removal, and throw {@link MatterServerWebRtcError} where it does not.
 *
 * The log is shared by every peer of the server, so refusals and registrations count only for peers this instance has
 * sent a command to. A `webrtc_callback` is routed to this connection by the server and counts for every peer.
 * Lines logged before construction are not read.
 */
export class MatterServerWebRtcRequestor implements WebRtcRequestorApi {
    readonly #host: MatterServerWebRtcHost;
    readonly #signals = new Array<WebRtcSignalRecord>();
    readonly #waiters = new Set<(signal: WebRtcSignalRecord | undefined) => void>();
    readonly #peers = new Set<bigint>();
    readonly #held = new Set<number>();
    readonly #logWaiters = new Set<() => void>();
    readonly #streams = new Map<number, Pick<WebRtcSessionRecord, "videoStreamId" | "audioStreamId">>();
    readonly #listener: (event: string, data: unknown) => void;
    readonly #stopped: Promise<undefined>;
    #stop!: () => void;
    #clock = 0;
    #closed = false;

    constructor(host: MatterServerWebRtcHost) {
        this.#host = host;
        this.#listener = (event, data) => this.#onEvent(event, data);
        host.events.on(this.#listener);

        this.#stopped = new Promise<undefined>(resolve => {
            this.#stop = () => resolve(undefined);
        });
        this.#readLog(host.log.lines.length).catch(error =>
            logger.warn("Reading the server's log for WebRTC signaling stopped:", error),
        );
    }

    get endpoint() {
        return this.#host.endpoint;
    }

    async solicitOffer(request: WebRtcOfferRequest): Promise<number> {
        return this.#establish("SolicitOffer", request, {});
    }

    async provideOffer({ sdp, ...request }: WebRtcOfferRequest & { sdp: string }): Promise<number> {
        return this.#establish("ProvideOffer", request, { webRtcSessionId: null, sdp });
    }

    async provideAnswer(peer: CertNodeRef, endpoint: number, id: number, sdp: string): Promise<void> {
        await this.#providerCommand(peer, endpoint, "ProvideAnswer", { webRtcSessionId: id, sdp });
    }

    async provideIceCandidates(
        peer: CertNodeRef,
        endpoint: number,
        id: number,
        candidates: readonly WebRtcIceCandidate[],
    ): Promise<void> {
        await this.#providerCommand(peer, endpoint, "ProvideIceCandidates", {
            webRtcSessionId: id,
            iceCandidates: candidates.map(({ candidate, sdpMid, sdpmLineIndex }) => ({
                candidate,
                sdpMid,
                sdpMLineIndex: sdpmLineIndex,
            })),
        });
    }

    async endSession(peer: CertNodeRef, endpoint: number, id: number, reason: number): Promise<void> {
        await this.#host.command("device_command", {
            node_id: this.#addressed(peer),
            endpoint_id: endpoint,
            cluster_id: WebRtcTransportProvider.Cluster.id,
            command_name: "EndSession",
            payload: { webRtcSessionId: id, reason },
        });
        await this.#until(`removal of session ${id}`, () => !this.#held.has(id));
    }

    async sessions(): Promise<readonly WebRtcSessionRecord[]> {
        await this.#host.log.settled();
        return [...this.#held].map(id => ({
            id,
            videoStreamId: this.#streams.get(id)?.videoStreamId ?? null,
            audioStreamId: this.#streams.get(id)?.audioStreamId ?? null,
        }));
    }

    signals(): readonly WebRtcSignalRecord[] {
        return [...this.#signals];
    }

    async nextSignal(
        predicate: (signal: WebRtcSignalRecord) => boolean,
        timeoutMs: number,
    ): Promise<WebRtcSignalRecord | undefined> {
        const already = this.#signals.find(predicate);
        if (already !== undefined) {
            return already;
        }
        if (this.#closed) {
            return undefined;
        }

        return new Promise<WebRtcSignalRecord | undefined>(resolve => {
            let waiter: (signal: WebRtcSignalRecord | undefined) => void;

            const timer = Time.getTimer("webrtc signal wait", Millis(timeoutMs), () => {
                this.#waiters.delete(waiter);
                resolve(undefined);
            });

            waiter = signal => {
                if (signal !== undefined && !predicate(signal)) {
                    return;
                }
                timer.stop();
                this.#waiters.delete(waiter);
                resolve(signal);
            };

            this.#waiters.add(waiter);
            timer.start();
        });
    }

    /** Stops reading events and log, and settles every wait: nothing more will arrive for it. */
    close() {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#host.events.off(this.#listener);
        this.#stop();
        this.#logWaiters.clear();
        for (const waiter of [...this.#waiters]) {
            waiter(undefined);
        }
        this.#waiters.clear();
    }

    async #establish(
        command: "SolicitOffer" | "ProvideOffer",
        { peer, endpoint, streamUsage, videoStreamId, audioStreamId }: WebRtcOfferRequest,
        fields: object,
    ): Promise<number> {
        const response = await this.#providerCommand(peer, endpoint, command, {
            ...fields,
            streamUsage,
            ...(videoStreamId === undefined ? {} : { videoStreamId }),
            ...(audioStreamId === undefined ? {} : { audioStreamId }),
        });

        const id = sessionIdOf(response, command);
        await this.#until(`registration of session ${id}`, () => this.#held.has(id));
        this.#streams.set(id, { videoStreamId: videoStreamId ?? null, audioStreamId: audioStreamId ?? null });
        return id;
    }

    async #providerCommand(peer: CertNodeRef, endpoint: number, commandName: string, payload: object) {
        return this.#host.command("send_webrtc_provider_command", {
            node_id: this.#addressed(peer),
            endpoint_id: endpoint,
            command_name: commandName,
            payload,
        });
    }

    async #until(what: string, done: () => boolean) {
        if (done()) {
            return;
        }
        const timeout = this.#host.logTimeout ?? LOG_LAG;
        await new Promise<void>((resolve, reject) => {
            const waiter = () => {
                if (done()) {
                    settle();
                    resolve();
                }
            };
            const timer = Time.getTimer("webrtc log wait", timeout, () => {
                settle();
                reject(
                    new MatterServerWebRtcError(
                        `The server's log showed no ${what} within ${Duration.format(timeout)}`,
                    ),
                );
            });
            const settle = () => {
                timer.stop();
                this.#logWaiters.delete(waiter);
            };
            this.#logWaiters.add(waiter);
            timer.start();
        });
    }

    #addressed(peer: CertNodeRef): NodeId {
        const nodeId = this.#host.nodeIdOf(peer);
        this.#peers.add(BigInt(nodeId));
        return nodeId;
    }

    #onEvent(event: string, data: unknown) {
        if (event !== "webrtc_callback" || !isObject(data)) {
            return;
        }
        const { event_type: type, webrtc_session_id: sessionId, data: payload } = data;
        const kind = typeof type === "string" ? CALLBACK_KINDS.get(type) : undefined;
        if (kind === undefined || typeof sessionId !== "number") {
            logger.debug("Ignoring a webrtc_callback of an unknown kind or without session id:", Diagnostic.json(data));
            return;
        }

        const body = isObject(payload) ? payload : {};
        if (kind === "end") {
            this.#held.delete(sessionId);
        }
        this.#record(kind, sessionId, "accepted", {
            ...(typeof body.sdp === "string" ? { sdp: body.sdp } : {}),
            ...(kind === "iceCandidates" ? { candidates: candidatesOf(body.ice_candidates) } : {}),
        });
    }

    async #readLog(start: number) {
        const iterator = this.#host.log.follow()[Symbol.asyncIterator]();
        let index = 0;
        for (;;) {
            const next = await Promise.race([iterator.next(), this.#stopped]);
            if (next === undefined || next.done) {
                return;
            }
            if (index++ >= start) {
                this.#onLine(next.value);
                for (const waiter of [...this.#logWaiters]) {
                    waiter();
                }
            }
        }
    }

    #onLine(text: string) {
        const refusal = WEBRTC_REFUSAL_LINE.exec(text)?.groups;
        if (refusal !== undefined) {
            const kind = REFUSED_KINDS.get(refusal.kind);
            if (kind !== undefined && this.#peers.has(BigInt(`0x${refusal.peer}`))) {
                this.#record(kind, Number(refusal.id), "refused");
            }
            return;
        }

        const registered = WEBRTC_SESSION_REGISTERED_LINE.exec(text)?.groups;
        if (registered !== undefined) {
            if (this.#isOwn(registered)) {
                this.#held.add(Number(registered.id));
            }
            return;
        }

        const removed = WEBRTC_SESSION_REMOVED_LINE.exec(text)?.groups;
        if (removed !== undefined && this.#isOwn(removed)) {
            this.#held.delete(Number(removed.id));
        }
    }

    /** A session of a peer this instance addressed, held by the requestor on the host's endpoint. */
    #isOwn({ peer, endpoint }: Record<string, string>) {
        return this.#peers.has(BigInt(peer)) && Number(endpoint) === this.#host.endpoint;
    }

    #record(
        kind: WebRtcSignalRecord["kind"],
        sessionId: number,
        outcome: WebRtcSignalRecord["outcome"],
        payload?: Pick<WebRtcSignalRecord, "sdp" | "candidates">,
    ) {
        const signal: WebRtcSignalRecord = { kind, sessionId, outcome, ...payload, at: ++this.#clock };
        this.#signals.push(signal);
        for (const waiter of [...this.#waiters]) {
            waiter(signal);
        }
    }
}

function candidatesOf(candidates: unknown): WebRtcIceCandidate[] {
    if (!Array.isArray(candidates)) {
        return [];
    }
    return candidates.flatMap(entry => {
        if (!isObject(entry) || typeof entry.candidate !== "string") {
            return [];
        }
        return [
            {
                candidate: entry.candidate,
                sdpMid: typeof entry.sdpMid === "string" ? entry.sdpMid : null,
                sdpmLineIndex: typeof entry.sdpMLineIndex === "number" ? entry.sdpMLineIndex : null,
            },
        ];
    });
}

function sessionIdOf(response: unknown, command: string): number {
    const id = isObject(response) ? response.webRtcSessionId : undefined;
    if (typeof id !== "number") {
        throw new UnexpectedDataError(
            `The response to ${command} carried no webRtcSessionId: ${Diagnostic.json(response)}`,
        );
    }
    return id;
}
