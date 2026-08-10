/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlServer } from "#behaviors/access-control";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Logger, Observable } from "@matter/general";
import { assertRemoteActor, FabricAuthority, NodeSession } from "@matter/protocol";
import { Status, StatusResponseError } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { WebRtcTransportDefinitions } from "@matter/types/clusters/web-rtc-transport-definitions";
import { WebRtcTransportRequestor } from "@matter/types/clusters/web-rtc-transport-requestor";
import { WebRtcTransportRequestorBehavior } from "./WebRtcTransportRequestorBehavior.js";

type WebRtcSession = WebRtcTransportDefinitions.WebRtcSession;

const logger = Logger.get("WebRtcTransportRequestorServer");

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
 * * Register a session with {@link upsertSession} when you initiate a stream, so the peer's subsequent commands for that
 *   session id are accepted; commands for an unknown session or a mismatched fabric/peer are rejected with NotFound.
 * * Subscribe to the `offer` / `answer` / `iceCandidates` / `end` events to feed your WebRTC stack. A session is removed
 *   from tracking automatically when the peer sends End.
 * * Call {@link removeSession} when you tear a stream down locally.
 *
 * On the first commissioned fabric the implementation installs an Operate-privilege ACL entry granting that fabric
 * access to this cluster, so the peer can reach the signaling commands without further configuration.
 */
export class WebRtcTransportRequestorServer extends WebRtcTransportRequestorBehavior {
    declare readonly events: WebRtcTransportRequestorServer.Events;

    override async initialize() {
        const node = Node.forEndpoint(this.endpoint) as ServerNode;
        logger.info(
            `WebRtcTransportRequestor initialized on endpoint=${this.endpoint.number} (id="${this.endpoint.id}")`,
        );
        this.reactTo(node.lifecycle.online, this.#nodeOnline);
        if (node.lifecycle.isOnline) {
            await this.#nodeOnline();
        }
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
     * signaling commands for the matching session id are accepted, and registration populates the `currentSessions`
     * attribute. Re-registering an existing id replaces the entry.
     */
    upsertSession(session: WebRtcSession): void {
        const enriched: WebRtcSession = {
            ...session,
            videoStreamId: session.videoStreams?.[0] ?? null,
            audioStreamId: session.audioStreams?.[0] ?? null,
        };
        const sessions = this.state.currentSessions;
        const idx = sessions.findIndex(s => s.id === session.id);
        if (idx === -1) {
            this.state.currentSessions = [...sessions, enriched];
        } else {
            this.state.currentSessions = sessions.map((s, i) => (i === idx ? enriched : s));
        }
    }

    /** Stop tracking a session, e.g. after you tear down the stream locally. No-op if the id is unknown. */
    removeSession(id: number): void {
        const sessions = this.state.currentSessions;
        if (sessions.some(s => s.id === id)) {
            this.state.currentSessions = sessions.filter(s => s.id !== id);
        }
    }

    /**
     * Invoked by the peer to deliver an SDP offer. Surfaces it via the {@link WebRtcTransportRequestorServer.Events}
     * `offer` event.
     */
    override async offer(request: WebRtcTransportRequestor.OfferRequest): Promise<void> {
        logger.debug(`incoming Offer webRtcSessionId=${request.webRtcSessionId} sdpLen=${request.sdp.length}`);
        const session = this.#findSessionStrict(request.webRtcSessionId);
        this.events.offer.emit(session, request);
    }

    /**
     * Invoked by the peer to deliver an SDP answer. Surfaces it via the {@link WebRtcTransportRequestorServer.Events}
     * `answer` event.
     */
    override async answer(request: WebRtcTransportRequestor.AnswerRequest): Promise<void> {
        logger.debug(`incoming Answer webRtcSessionId=${request.webRtcSessionId} sdpLen=${request.sdp.length}`);
        const session = this.#findSessionStrict(request.webRtcSessionId);
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
            throw new StatusResponseError("ICE candidates list must not be empty", Status.InvalidCommand);
        }
        const session = this.#findSessionStrict(request.webRtcSessionId);
        this.events.iceCandidates.emit(session, request.iceCandidates);
    }

    /** Invoked by the peer to end a session. Removes it from tracking and surfaces it via the
     * {@link WebRtcTransportRequestorServer.Events} `end` event.
     */
    override async end(request: WebRtcTransportRequestor.EndRequest): Promise<void> {
        logger.debug(`incoming End webRtcSessionId=${request.webRtcSessionId} reason=${request.reason}`);
        const session = this.#findSessionStrict(request.webRtcSessionId);
        this.removeSession(request.webRtcSessionId);
        this.events.end.emit(session, request.reason);
    }

    #findSessionStrict(id: number): WebRtcSession {
        assertRemoteActor(this.context);
        NodeSession.assert(this.context.session);
        const peer = this.context.session.peerAddress;
        const session = this.state.currentSessions.find(s => s.id === id);
        if (session === undefined || session.fabricIndex !== peer.fabricIndex || session.peerNodeId !== peer.nodeId) {
            throw new StatusResponseError(`WebRTC session ${id} not found`, Status.NotFound);
        }
        return session;
    }
}

export namespace WebRtcTransportRequestorServer {
    /** Transport-signaling events the peer triggers; subscribe to these to drive your WebRTC peer connection. */
    export class Events extends WebRtcTransportRequestorBehavior.Events {
        /** Peer sent an SDP offer for a tracked session; apply it to your peer connection. */
        offer = Observable<[session: WebRtcSession, args: WebRtcTransportRequestor.OfferRequest]>();

        /** Peer sent an SDP answer for a tracked session. */
        answer = Observable<[session: WebRtcSession, sdp: string]>();

        /** Peer sent ICE candidates for a tracked session; add them to your peer connection. */
        iceCandidates = Observable<[session: WebRtcSession, candidates: WebRtcTransportDefinitions.IceCandidate[]]>();

        /** Peer ended a session; the session is already removed from tracking when this fires. */
        end = Observable<[session: WebRtcSession, reason: WebRtcTransportDefinitions.WebRtcEndReason]>();
    }
}
