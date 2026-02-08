/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, MatterError, ObserverGroup } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import { ExchangeProvider, Peer, PeerAddress, PeerSet, SessionManager } from "#protocol";
import { CommissioningClient } from "../commissioning/CommissioningClient.js";
import { NetworkRuntime } from "./NetworkRuntime.js";

export class UncommissionedError extends MatterError {}
export class OfflineError extends MatterError {}

/**
 * Handles network functionality for {@link ClientNode}.
 */
export class ClientNetworkRuntime extends NetworkRuntime {
    #observers = new ObserverGroup();
    #isReady = false;

    constructor(owner: ClientNode) {
        super(owner);
    }

    set isReady(isReady: boolean) {
        this.#isReady = isReady;
        this.#syncOnlineStatus();
    }

    override get owner() {
        return super.owner as ClientNode;
    }

    protected async start() {
        // Ensure the node is ready for peer interaction
        if (!this.owner.lifecycle.isCommissioned) {
            throw new UncommissionedError(`Cannot interact with ${this.owner} because it is uncommissioned`);
        }
        if (this.owner.state.network.isDisabled) {
            throw new UncommissionedError(`Cannot interact with ${this.owner} because it is disabled`);
        }

        const address = PeerAddress(this.owner.stateOf(CommissioningClient).peerAddress);
        if (address === undefined) {
            throw new InternalError(`Commissioned node ${this.owner} has no peer address`);
        }

        // Client interaction requires the server to be online.  If not, bring online now
        const server = this.owner.owner;
        if (!server.lifecycle.isOnline) {
            await server.start();
        }

        // Install the exchange provider for the node
        const { env, lifecycle } = this.owner;
        const peers = env.get(PeerSet);
        const peer = peers.get(address);
        if (peer === undefined) {
            throw new InternalError(`Commissioned node ${this.owner} has no peer installed`);
        }
        env.set(ExchangeProvider, peer.exchangeProvider);

        // Monitor sessions to maintain online state.  We consider the node "online" if there is an active session.  If
        // not, we consider the node offline.  This is the only real way we have of determining whether the node is
        // healthy without actively polling
        const { sessions } = env.get(SessionManager);

        if (sessions.find(session => session.peerIs(address))) {
            this.owner.act(({ context }) => lifecycle.online.emit(context));
        }

        const syncOnlineStatus = this.#syncOnlineStatus.bind(this);

        this.#observers.on(peer.sessions.added, syncOnlineStatus);
        this.#observers.on(peer.sessions.deleted, syncOnlineStatus);
    }

    protected async stop() {
        this.isReady = false;

        await this.construction;

        this.#observers.close();
    }

    #syncOnlineStatus() {
        let shouldBeOnline: boolean;
        if (!this.#isReady) {
            shouldBeOnline = false;
        } else {
            const peer = this.owner.env.maybeGet(Peer);
            if (peer === undefined) {
                shouldBeOnline = false;
            } else {
                shouldBeOnline = peer.hasSession;
            }
        }

        if (this.owner.lifecycle.isOnline === shouldBeOnline) {
            return;
        }

        this.owner.act(({ context }) => {
            this.owner.lifecycle[shouldBeOnline ? "online" : "offline"].emit(context);
        });
    }
}
