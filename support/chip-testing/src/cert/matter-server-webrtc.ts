/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Diagnostic,
    Duration,
    InternalError,
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
 * Matches the requestor's debug line for a signal it refused because it holds no such session for the peer
 * (`WebRtcTransportRequestorServer`, where it emits `refused`). The line carries no peer endpoint: a command does not
 * name the endpoint it was sent from, and no session was found to take it from. The server runs matter.js at debug
 * level; the line reaches a server build only with a matter.js version that logs it.
 *
 * Provisional until verified against a live server log.
 */
export const WEBRTC_SIGNAL_REFUSED_LINE =
    /WebRtcTransportRequestorServer session refused signal=(?<kind>\w+) webRtcSessionId=(?<id>\d+) fabricIndex=\d+ peerNodeId=(?<peer>\d+) requestorEndpointId=(?<endpoint>\d+)/;

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

/**
 * Matches the line matter.js's `Endpoint` logs once the server's camera-controller endpoint is ready, which carries the
 * endpoint's number. The server adds that endpoint with id `camera-controller` and lets matter.js number it, so the
 * number depends on the endpoints the server adds before it, and the WebSocket API does not report it.
 *
 * Provisional until verified against a live server log.
 */
export const CAMERA_CONTROLLER_READY_LINE = /\bcamera-controller ready endpoint#: (?<number>\d+)\b/;

/** How long the server may take to log what it already did, once its response or command result arrived. */
const LOG_LAG = Seconds(10);

/**
 * The server did not log what the harness waits for: the session registration or removal, or its camera-controller
 * endpoint.
 */
export class MatterServerWebRtcError extends MatterError {}

/** The requestor was closed while a call still waited for the server's log. */
export class MatterServerWebRtcClosedError extends MatterServerWebRtcError {}

/**
 * The number of the server's camera-controller endpoint, its WebRTC requestor, read from the server's log (see
 * {@link CAMERA_CONTROLLER_READY_LINE}). Reads the whole log, so call it on the log of the server's whole run.
 *
 * @throws MatterServerWebRtcError where the log does not show the endpoint within `timeout`
 */
export async function cameraControllerEndpointOf(log: LogFollower, timeout: Duration = LOG_LAG): Promise<number> {
    let line;
    try {
        line = await log.expectPattern(CAMERA_CONTROLLER_READY_LINE, { from: 0, timeoutMs: timeout });
    } catch (error) {
        throw new MatterServerWebRtcError(
            `The server's log showed no ready camera-controller endpoint within ${Duration.format(timeout)}`,
            { cause: error },
        );
    }
    const number = CAMERA_CONTROLLER_READY_LINE.exec(line.text)?.groups?.number;
    if (number === undefined) {
        throw new InternalError(`The camera-controller ready line matched without its number: ${line.text}`);
    }
    return Number(number);
}

/** The `event_type` of a `webrtc_callback` to the signal kind. */
const CALLBACK_KINDS = new Map<string, WebRtcSignalRecord["kind"]>([
    ["offer", "offer"],
    ["answer", "answer"],
    ["ice_candidates", "iceCandidates"],
    ["end", "end"],
]);

/** The signal named in a refusal line to the signal kind. */
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

    /** The server's log, which carries the requestor's refusals and its session registrations and removals. */
    readonly log: LogFollower;

    nodeIdOf(peer: CertNodeRef): NodeId;

    /** The server's own camera-controller endpoint (requestor). */
    readonly endpoint: number;

    /** How long to wait for the server's log to show a registration or removal; defaults to ten seconds. */
    readonly logTimeout?: Duration;
}

/** A wait for the server's log, which {@link MatterServerWebRtcRequestor.close} ends early. */
interface LogWait {
    check(): void;
    abort(): void;
}

/**
 * The requestor side of WebRTC signaling on a matterjs-server controller.
 *
 * Commands go through the WebSocket API. What the server's requestor accepted arrives as `webrtc_callback` events.
 * What it refused, and which sessions it holds, the API does not report, so both are read from the requestor's own
 * debug lines in the server's log: {@link WEBRTC_SIGNAL_REFUSED_LINE}, {@link WEBRTC_SESSION_REGISTERED_LINE} and
 * {@link WEBRTC_SESSION_REMOVED_LINE}. {@link solicitOffer}, {@link provideOffer} and {@link endSession} resolve only
 * once the log shows the registration or removal, and throw {@link MatterServerWebRtcError} where it does not.
 *
 * A session is held per peer node and session id, because each provider mints its own ids. The log is shared by every
 * peer and endpoint of the server, so its lines count only for peers this instance has sent a command to and for the
 * host's requestor endpoint. A `webrtc_callback` names the peer but not the requestor endpoint; the server routes it
 * to this connection, and it counts for every peer. Lines logged before construction are not read.
 */
export class MatterServerWebRtcRequestor implements WebRtcRequestorApi {
    readonly #host: MatterServerWebRtcHost;
    readonly #signals = new Array<WebRtcSignalRecord>();
    readonly #waiters = new Set<(signal: WebRtcSignalRecord | undefined) => void>();
    readonly #peers = new Set<bigint>();
    readonly #held = new Map<string, WebRtcSessionRecord>();
    readonly #logWaits = new Set<LogWait>();
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
        const nodeId = this.#addressed(peer);
        await this.#host.command("device_command", {
            node_id: nodeId,
            endpoint_id: endpoint,
            cluster_id: WebRtcTransportProvider.Cluster.id,
            command_name: "EndSession",
            payload: { webRtcSessionId: id, reason },
        });
        const key = heldKey(BigInt(nodeId), id);
        await this.#until(`removal of session ${id} of node ${nodeId}`, () => !this.#held.has(key));
    }

    async sessions(): Promise<readonly WebRtcSessionRecord[]> {
        await this.#host.log.settled();
        return [...this.#held.values()].map(session => ({ ...session }));
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

    /**
     * Stops reading events and log. A pending {@link nextSignal} resolves `undefined`; a pending {@link solicitOffer},
     * {@link provideOffer} or {@link endSession} throws {@link MatterServerWebRtcClosedError}.
     */
    close() {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#host.events.off(this.#listener);
        this.#stop();
        for (const wait of [...this.#logWaits]) {
            wait.abort();
        }
        for (const waiter of [...this.#waiters]) {
            waiter(undefined);
        }
        this.#waiters.clear();
    }

    /**
     * Where the server's log does not show the registration in time, the provider and possibly the server still hold
     * the session; the error names its id so the case can end it.
     */
    async #establish(
        command: "SolicitOffer" | "ProvideOffer",
        { peer, endpoint, streamUsage, videoStreamId, audioStreamId }: WebRtcOfferRequest,
        fields: object,
    ): Promise<number> {
        const nodeId = this.#addressed(peer);
        const response = await this.#providerCommand(peer, endpoint, command, {
            ...fields,
            streamUsage,
            ...(videoStreamId === undefined ? {} : { videoStreamId }),
            ...(audioStreamId === undefined ? {} : { audioStreamId }),
        });

        const id = sessionIdOf(response, command);
        const key = heldKey(BigInt(nodeId), id);
        await this.#until(`registration of session ${id} of node ${nodeId}`, () => this.#held.has(key));
        this.#held.set(key, { id, videoStreamId: videoStreamId ?? null, audioStreamId: audioStreamId ?? null });
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
        if (this.#closed) {
            throw new MatterServerWebRtcClosedError(`The WebRTC requestor was closed before the ${what}`);
        }
        if (done()) {
            return;
        }
        const timeout = this.#host.logTimeout ?? LOG_LAG;
        await new Promise<void>((resolve, reject) => {
            const wait: LogWait = {
                check: () => {
                    if (done()) {
                        settle();
                        resolve();
                    }
                },
                abort: () => {
                    settle();
                    reject(
                        new MatterServerWebRtcClosedError(
                            `The WebRTC requestor was closed while waiting for the ${what}`,
                        ),
                    );
                },
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
                this.#logWaits.delete(wait);
            };
            this.#logWaits.add(wait);
            timer.start();
        });
    }

    #checkLogWaits() {
        for (const wait of [...this.#logWaits]) {
            wait.check();
        }
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
        const { event_type: type, webrtc_session_id: sessionId, node_id: node, data: payload } = data;
        const kind = typeof type === "string" ? CALLBACK_KINDS.get(type) : undefined;
        const peer = nodeIdValueOf(node);
        if (kind === undefined || typeof sessionId !== "number" || peer === undefined) {
            logger.debug(
                "Ignoring a webrtc_callback of an unknown kind or without session id or node id:",
                Diagnostic.json(data),
            );
            return;
        }

        const body = isObject(payload) ? payload : {};
        this.#record(kind, sessionId, "accepted", {
            ...(typeof body.sdp === "string" ? { sdp: body.sdp } : {}),
            ...(kind === "iceCandidates" ? { candidates: candidatesOf(body.ice_candidates) } : {}),
        });
        if (kind === "end" && this.#held.delete(heldKey(peer, sessionId))) {
            this.#checkLogWaits();
        }
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
                this.#checkLogWaits();
            }
        }
    }

    #onLine(text: string) {
        const refused = WEBRTC_SIGNAL_REFUSED_LINE.exec(text)?.groups;
        if (refused !== undefined) {
            const kind = REFUSED_KINDS.get(refused.kind);
            if (kind !== undefined && this.#isOwn(refused)) {
                this.#record(kind, Number(refused.id), "refused");
            }
            return;
        }

        const registered = WEBRTC_SESSION_REGISTERED_LINE.exec(text)?.groups;
        if (registered !== undefined) {
            const key = heldKey(BigInt(registered.peer), Number(registered.id));
            if (this.#isOwn(registered) && !this.#held.has(key)) {
                this.#held.set(key, { id: Number(registered.id), videoStreamId: null, audioStreamId: null });
            }
            return;
        }

        const removed = WEBRTC_SESSION_REMOVED_LINE.exec(text)?.groups;
        if (removed !== undefined && this.#isOwn(removed)) {
            this.#held.delete(heldKey(BigInt(removed.peer), Number(removed.id)));
        }
    }

    /** A line about a peer this instance addressed and the requestor on the host's endpoint. */
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

function heldKey(peer: bigint, id: number) {
    return `${peer}/${id}`;
}

/** A `webrtc_callback`'s `node_id`, which the client reads as a bigint where it exceeds the safe integer range. */
function nodeIdValueOf(value: unknown): bigint | undefined {
    if (typeof value === "bigint") {
        return value;
    }
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
        return BigInt(value);
    }
    return undefined;
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
