/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlServer } from "#behaviors/access-control";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Abort, ImplementationError, isDeepEqual, Logger, Observable, Seconds } from "@matter/general";
import { assertRemoteActor, FabricAuthority, NodeSession, PeerAddress } from "@matter/protocol";
import { Status, StatusResponseError } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { WebRtcTransportDefinitions } from "@matter/types/clusters/web-rtc-transport-definitions";
import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";
import { WebRtcTransportRequestorBehavior } from "./WebRtcTransportRequestorBehavior.js";

type WebRtcSession = WebRtcTransportDefinitions.WebRtcSession;

const logger = Logger.get("WebRtcTransportRequestorServer");

/** How long a signal for an untracked session id waits, from its arrival, while a hold for its peer exists. */
const EARLY_SIGNAL_HOLD_TIME = Seconds(5);

/**
 * This is the default server implementation of {@link WebRtcTransportRequestorBehavior}.
 *
 * This cluster lives on the controller side of a WebRTC stream (e.g. a camera controller). The peer camera/provider
 * drives signaling by invoking the Offer, Answer, IceCandidates and End commands on this cluster. The default
 * implementation validates each command against the session's originating fabric and peer node, tracks live sessions in
 * the `currentSessions` attribute, and re-emits the signaling through the {@link WebRtcTransportRequestorServer.Events}
 * observables so you can drive your own WebRTC peer connection.
 *
 * To use it:
 * * Register a session with {@link upsertSession} once you know its id, so the peer's commands for that session are
 *   accepted. Commands naming a session id this cluster does not track for the peer's fabric and node are rejected
 *   with NotFound.
 * * While you ask a provider for a new session, keep a {@link WebRtcTransportRequestorServer.holdUnknownSignals} hold
 *   for it, so its signaling that arrives before its response waits for your registration instead of being refused.
 * * Subscribe to the `offer` / `answer` / `iceCandidates` / `end` events to feed your WebRTC stack. A session is removed
 *   from tracking automatically when the peer sends End.
 * * Call {@link removeSession} when you tear a stream down locally.
 *
 * On the first commissioned fabric the implementation installs an Operate-privilege ACL entry granting that fabric
 * access to this cluster, so the peer can reach the signaling commands without further configuration.
 */
export class WebRtcTransportRequestorServer extends WebRtcTransportRequestorBehavior {
    declare readonly events: WebRtcTransportRequestorServer.Events;
    declare protected internal: WebRtcTransportRequestorServer.Internal;

    /**
     * A signal handler may wait for a registration while a {@link holdUnknownSignals} hold exists, so a handler holds
     * no lock while it waits. Each handler takes the lock after the wait, then looks up the session. An override that
     * writes state must lock this behavior itself, whether or not it calls the default handler.
     */
    static override lockOnInvoke = false;

    /**
     * Hold the signaling of a provider for session ids this cluster does not track yet, while you ask that provider for
     * a new session.
     *
     * The provider allocates the session id and may invoke Offer, Answer, ICECandidates or End before its
     * SolicitOfferResponse or ProvideOfferResponse reaches you (§ 11.5.6.2.2: with DeferredOffer FALSE it "will without
     * delay invoke the Offer command"). While a hold for `peer` exists, every signal from `peer` that names a session id
     * this cluster does not track waits instead of being refused. That includes a late signal for a session that already
     * ended. A waiting signal is delivered once the registration of its session commits. If its session is still not
     * tracked, it is refused with NotFound once no hold for `peer` exists, or 5 seconds after the signal arrived. The
     * 5 seconds cover only this wait; the signal then still waits for this behavior's lock, without a time limit.
     *
     * The holds that exist when the node goes offline end then. A hold you take while the node is offline stays until you
     * dispose it. When the behavior closes, a waiting signal is usually refused with NotFound. In a short window during
     * close (the datasource closes before the behavior is disposed), the signal can fail with a generic failure instead.
     *
     * Take the hold before you send the request. Dispose it after you tried to register the session and before any
     * cleanup that ends the session at the provider, so a held signal for a failed session is refused at once. Here
     * `session` holds the fields you know before the response:
     *
     * ```ts
     * try {
     *     using hold = WebRtcTransportRequestorServer.holdUnknownSignals(endpoint, peer);
     *     const { webRtcSessionId } = await provider.solicitOffer(request);
     *     await endpoint.act(agent =>
     *         agent.get(WebRtcTransportRequestorServer).upsertSession({ ...session, id: webRtcSessionId }),
     *     );
     * } catch (e) {
     *     // The hold is disposed here already. End the provider's session if it allocated one.
     *     throw e;
     * }
     * ```
     *
     * The call opens no transaction, so you may call it inside an agent transaction. It activates the behavior if it is
     * not active yet. Disposing the hold more than once has no effect.
     *
     * @param endpoint the endpoint that hosts this behavior
     * @param peer the provider's fabric and node. Signals are matched by these because they name no provider endpoint.
     * @throws ImplementationError if `endpoint` does not support this behavior
     * @throws the endpoint's lifecycle error if the endpoint is not initialized or is already closed, or the behavior's
     *   initialization error if it fails to activate
     * @see {@link MatterSpecification.v161.Cluster} § 11.5.6.1 – § 11.5.6.4, § 11.6.5
     */
    static holdUnknownSignals(endpoint: Endpoint, peer: PeerAddress): Disposable {
        if (!endpoint.behaviors.has(WebRtcTransportRequestorServer)) {
            throw new ImplementationError(`Endpoint ${endpoint} does not support WebRtcTransportRequestorServer`);
        }
        const { holds, recheck } = endpoint.behaviors.internalsOf(WebRtcTransportRequestorServer);
        const hold: PeerAddress = { fabricIndex: peer.fabricIndex, nodeId: peer.nodeId };
        holds.add(hold);
        return {
            [Symbol.dispose]() {
                if (holds.delete(hold)) {
                    recheck.emit();
                }
            },
        };
    }

    override async initialize() {
        const node = Node.forEndpoint(this.endpoint) as ServerNode;
        logger.info(
            `WebRtcTransportRequestor initialized on endpoint=${this.endpoint.number} (id="${this.endpoint.id}")`,
        );
        this.reactTo(this.events.currentSessions$Changed, this.#sessionsChanged);
        this.reactTo(node.lifecycle.goingOffline, this.#endHolds);
        this.reactTo(node.lifecycle.online, this.#nodeOnline);
        if (node.lifecycle.isOnline) {
            await this.#nodeOnline();
        }
    }

    override async [Symbol.asyncDispose]() {
        this.internal.closed = true;
        this.#endHolds();
        await super[Symbol.asyncDispose]?.();
    }

    /** Ends every hold, so held signals stop waiting. */
    #endHolds() {
        this.internal.holds.clear();
        this.internal.recheck.emit();
    }

    async #nodeOnline() {
        const fabricAuthority = await this.env.load(FabricAuthority);
        const ownFabric = fabricAuthority.fabrics[0];
        if (!ownFabric) {
            this.reactTo(fabricAuthority.fabricAdded, this.#nodeOnline, { once: true });
            return;
        }

        const node = Node.forEndpoint(this.endpoint) as ServerNode;
        await node.act(agent => agent.load(AccessControlServer));
        if (node.behaviors.has(AccessControlServer)) {
            if (
                !node
                    .stateOf(AccessControlServer)
                    .acl.some(
                        ({ fabricIndex, privilege, authMode, subjects, targets }) =>
                            fabricIndex === ownFabric.fabricIndex &&
                            privilege === AccessControl.AccessControlEntryPrivilege.Operate &&
                            authMode === AccessControl.AccessControlEntryAuthMode.Case &&
                            subjects?.length === 0 &&
                            targets?.length === 1 &&
                            targets[0].endpoint === this.endpoint.number &&
                            targets[0].cluster === WebRtcTransportRequestor.id,
                    )
            ) {
                const acl = [
                    ...node.stateOf(AccessControlServer).acl,
                    {
                        fabricIndex: ownFabric.fabricIndex,
                        privilege: AccessControl.AccessControlEntryPrivilege.Operate,
                        authMode: AccessControl.AccessControlEntryAuthMode.Case,
                        subjects: [],
                        targets: [{ endpoint: this.endpoint.number, cluster: WebRtcTransportRequestor.id }],
                    },
                ];
                await node.setStateOf(AccessControlServer, { acl });
            }
        }
    }

    /**
     * Register or update a WebRTC session you have initiated with a peer. A session must be registered before the peer's
     * signaling commands for it are accepted, and registration populates the `currentSessions` attribute. Re-registering
     * a session with the same {@link WebRtcTransportRequestorServer.SessionKey} replaces the entry. For a new session,
     * see {@link holdUnknownSignals}.
     *
     * Takes this behavior's lock first, so it waits for a signal handler that holds the lock. Await the returned
     * promise inside your transaction. If you do not await it, the write can run after your transaction committed. It then
     * fails, the session is not registered, and the promise rejects unhandled.
     */
    async upsertSession(session: WebRtcSession): Promise<void> {
        await this.context.transaction.lock(this);
        const enriched: WebRtcSession = {
            ...session,
            videoStreamId: session.videoStreams?.[0] ?? null,
            audioStreamId: session.audioStreams?.[0] ?? null,
        };
        const sessions = this.state.currentSessions;
        const idx = sessions.findIndex(s => isSameSession(s, session));
        if (idx === -1) {
            this.state.currentSessions = [...sessions, enriched];
        } else {
            this.state.currentSessions = sessions.map((s, i) => (i === idx ? enriched : s));
        }
    }

    /**
     * Stop tracking a session, e.g. after you tear down the stream locally. No-op if no session matches the key.
     *
     * Takes this behavior's lock first. Await the returned promise inside your transaction. If you do not await it,
     * the write can run after your transaction committed. It then fails, the session stays tracked, and the promise
     * rejects unhandled.
     */
    async removeSession(key: WebRtcTransportRequestorServer.SessionKey): Promise<void> {
        await this.context.transaction.lock(this);
        const sessions = this.state.currentSessions;
        if (sessions.some(s => isSameSession(s, key))) {
            this.state.currentSessions = sessions.filter(s => !isSameSession(s, key));
        }
    }

    /**
     * Logs each session added, changed or removed once the change to `currentSessions` commits, which is when the
     * cluster starts or stops accepting the peer's signaling for it. The lines show the net change of one transaction,
     * so a session added and removed in the same transaction logs nothing, as does a change that rolls back.
     *
     * A committed change also lets each held signal check again whether its session is tracked now.
     */
    #sessionsChanged(sessions: readonly WebRtcSession[], previous: readonly WebRtcSession[]) {
        this.internal.recheck.emit();
        for (const session of sessions) {
            const before = previous.find(s => isSameSession(s, session));
            if (before === undefined || !isDeepEqual(before, session)) {
                logger.debug(`session upserted ${this.#describe(session)}`);
            }
        }
        for (const session of previous) {
            if (!sessions.some(s => isSameSession(s, session))) {
                logger.debug(`session removed ${this.#describe(session)}`);
            }
        }
    }

    #describe(session: WebRtcSession) {
        return (
            `webRtcSessionId=${session.id} fabricIndex=${session.fabricIndex} peerNodeId=${session.peerNodeId} ` +
            `peerEndpointId=${session.peerEndpointId} requestorEndpointId=${this.endpoint.number}`
        );
    }

    /**
     * Invoked by the peer to deliver an SDP offer. Surfaces it via the {@link WebRtcTransportRequestorServer.Events}
     * `offer` event.
     */
    override async offer(request: WebRtcTransportRequestor.OfferRequest): Promise<void> {
        logger.debug(`incoming Offer webRtcSessionId=${request.webRtcSessionId} sdpLen=${request.sdp.length}`);
        const session = await this.#lockSession("offer", request.webRtcSessionId);
        this.events.offer.emit(session, request);
    }

    /**
     * Invoked by the peer to deliver an SDP answer. Surfaces it via the {@link WebRtcTransportRequestorServer.Events}
     * `answer` event.
     */
    override async answer(request: WebRtcTransportRequestor.AnswerRequest): Promise<void> {
        logger.debug(`incoming Answer webRtcSessionId=${request.webRtcSessionId} sdpLen=${request.sdp.length}`);
        const session = await this.#lockSession("answer", request.webRtcSessionId);
        this.events.answer.emit(session, request.sdp);
    }

    /** Invoked by the peer to deliver ICE candidates. Surfaces them via the {@link WebRtcTransportRequestorServer.Events}
     *  `iceCandidates` event.
     */
    override async iceCandidates(request: WebRtcTransportRequestor.IceCandidatesRequest): Promise<void> {
        logger.debug(
            `incoming ICECandidates webRtcSessionId=${request.webRtcSessionId} count=${request.iceCandidates.length}`,
        );
        if (request.iceCandidates.length === 0) {
            // Reached only from a local caller: a peer's empty list is answered ConstraintError by schema
            // validation, before this behavior runs
            throw new StatusResponseError("ICE candidates list must not be empty", Status.ConstraintError);
        }
        const session = await this.#lockSession("iceCandidates", request.webRtcSessionId);
        this.events.iceCandidates.emit(session, request.iceCandidates);
    }

    /** Invoked by the peer to end a session. Removes it from tracking and surfaces it via the
     * {@link WebRtcTransportRequestorServer.Events} `end` event.
     */
    override async end(request: WebRtcTransportRequestor.EndRequest): Promise<void> {
        logger.debug(`incoming End webRtcSessionId=${request.webRtcSessionId} reason=${request.reason}`);
        const session = await this.#lockSession("end", request.webRtcSessionId);
        await this.removeSession(session);
        this.events.end.emit(session, request.reason);
    }

    /**
     * Takes the requestor's lock and returns the session the peer names, or refuses the signal with NotFound. A signal
     * that waited while the behavior closed is refused without the lock.
     *
     * Before it takes the lock, the signal waits without a lock while its session is not tracked and a
     * {@link holdUnknownSignals} hold for the peer exists, at most {@link EARLY_SIGNAL_HOLD_TIME} from its arrival.
     */
    async #lockSession(signal: WebRtcTransportRequestorServer.SignalKind, id: number) {
        const peer = this.#peer();
        const key = { id, fabricIndex: peer.fabricIndex, peerNodeId: peer.nodeId };
        const wait = await this.#awaitRegistration(signal, key);
        if (this.internal.closed) {
            logger.debug(
                `session refused signal=${signal} webRtcSessionId=${id} fabricIndex=${peer.fabricIndex} ` +
                    `peerNodeId=${peer.nodeId} requestorEndpointId=${this.endpoint.number} because the requestor closes`,
            );
            throw new StatusResponseError(`WebRTC session ${id} not found`, Status.NotFound);
        }
        await this.context.transaction.lock(this);
        return this.#sessionOrRefuse(signal, key, peer, wait);
    }

    #sessionOrRefuse(
        signal: WebRtcTransportRequestorServer.SignalKind,
        key: WebRtcTransportRequestorServer.SessionKey,
        peer: PeerAddress,
        wait: HoldWait,
    ) {
        const session = this.state.currentSessions.find(s => isSameSession(s, key));
        if (session === undefined) {
            logger.debug(
                `session refused signal=${signal} webRtcSessionId=${key.id} fabricIndex=${peer.fabricIndex} ` +
                    `peerNodeId=${peer.nodeId} requestorEndpointId=${this.endpoint.number} wait=${wait}`,
            );
            this.events.refused.emit(signal, key.id, peer);
            throw new StatusResponseError(`WebRTC session ${key.id} not found`, Status.NotFound);
        }
        return session;
    }

    #peer() {
        assertRemoteActor(this.context);
        NodeSession.assert(this.context.session);
        return this.context.session.peerAddress;
    }

    #isHeld(key: WebRtcTransportRequestorServer.SessionKey) {
        return this.#isPeerHeld(key) && !this.#isTracked(key);
    }

    #isTracked(key: WebRtcTransportRequestorServer.SessionKey) {
        return this.state.currentSessions.some(s => isSameSession(s, key));
    }

    #isPeerHeld(key: WebRtcTransportRequestorServer.SessionKey) {
        for (const hold of this.internal.holds) {
            if (hold.fabricIndex === key.fabricIndex && hold.nodeId === key.peerNodeId) {
                return true;
            }
        }
        return false;
    }

    async #awaitRegistration(
        signal: WebRtcTransportRequestorServer.SignalKind,
        key: WebRtcTransportRequestorServer.SessionKey,
    ): Promise<HoldWait> {
        if (!this.#isHeld(key)) {
            return "not-held";
        }
        logger.debug(
            `holding signal=${signal} webRtcSessionId=${key.id} fabricIndex=${key.fabricIndex} ` +
                `peerNodeId=${key.peerNodeId} while a hold for its peer exists`,
        );
        using timeout = new Abort({ timeout: EARLY_SIGNAL_HOLD_TIME });
        while (this.#isHeld(key) && !timeout.aborted) {
            let observer: Disposable | undefined;
            const changed = new Promise<void>(resolve => {
                observer = this.internal.recheck.useOnce(() => resolve());
            });
            try {
                await Abort.race(timeout, changed);
            } finally {
                observer?.[Symbol.dispose]();
            }
        }
        if (this.#isTracked(key)) {
            return "registered";
        }
        return timeout.aborted ? "timed-out" : "hold-ended";
    }
}

/**
 * How the wait of a signal for its session ended, logged when the signal is refused.
 */
type HoldWait = "not-held" | "registered" | "hold-ended" | "timed-out";

function isSameSession(a: WebRtcTransportRequestorServer.SessionKey, b: WebRtcTransportRequestorServer.SessionKey) {
    return a.id === b.id && a.fabricIndex === b.fabricIndex && a.peerNodeId === b.peerNodeId;
}

export namespace WebRtcTransportRequestorServer {
    /**
     * Identifies a tracked session. The session id alone is not unique because each provider node allocates its own, so
     * two peers, or one peer on two fabrics, may use the same id at the same time.
     *
     * @see {@link MatterSpecification.v161.Cluster} § 11.4.5.1, § 11.6.5.1
     */
    export type SessionKey = Pick<WebRtcSession, "id" | "fabricIndex" | "peerNodeId">;

    /** Internal state of the signal holds; one instance per behavior activation (a reset creates a new one). */
    export class Internal {
        /** One entry per {@link WebRtcTransportRequestorServer.holdUnknownSignals} hold that is not disposed. */
        holds = new Set<PeerAddress>();

        /** Set when the behavior closes. A signal that waited then refuses without taking the lock, which would fail. */
        closed = false;

        /**
         * Emits when a held signal must check again whether it is still held: a hold ended, or a change to
         * `currentSessions` committed.
         */
        recheck = Observable<[]>();
    }

    /**
     * Transport-signaling events the peer triggers; subscribe to these to drive your WebRTC peer connection.
     *
     * The events of one session are not guaranteed to fire in the order the peer sent the signals, so buffer ICE
     * candidates that arrive before the offer or answer they belong to.
     */
    export class Events extends WebRtcTransportRequestorBehavior.Events {
        /** Peer sent an SDP offer for a tracked session; apply it to your peer connection. */
        offer = Observable<[session: WebRtcSession, args: WebRtcTransportRequestor.OfferRequest]>();

        /** Peer sent an SDP answer for a tracked session. */
        answer = Observable<[session: WebRtcSession, sdp: string]>();

        /** Peer sent ICE candidates for a tracked session; add them to your peer connection. */
        iceCandidates = Observable<[session: WebRtcSession, candidates: WebRtcTransportDefinitions.IceCandidate[]]>();

        /**
         * Peer ended a session. The removal from tracking is part of the End command's transaction and commits after
         * this fires; a signal for the session that arrives meanwhile waits for that commit and gets NotFound.
         */
        end = Observable<[session: WebRtcSession, reason: WebRtcTransportDefinitions.WebRtcEndReason]>();

        /**
         * Peer signaled against a session this cluster does not track for it, which it answered `NotFound`. The session
         * id is the one the peer named, so a listener sees which id was refused rather than only that something was.
         *
         * Signaling this cluster never sees is not reported here: a command whose fields break their own constraints is
         * refused by schema validation before any of this runs. A signal refused because the behavior closes is not
         * reported here.
         */
        refused = Observable<[signal: SignalKind, webRtcSessionId: number, peer: PeerAddress]>();
    }

    /** The signaling commands a peer invokes on this cluster. */
    export type SignalKind = "offer" | "answer" | "iceCandidates" | "end";
}
