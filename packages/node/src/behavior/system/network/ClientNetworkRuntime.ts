/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "#node/ClientNode.js";
import { InternalError, ObserverGroup } from "@matter/general";
import { ExchangeProvider, Peer, PeerAddress, PeerSet } from "@matter/protocol";
import { CommissioningClient } from "../commissioning/CommissioningClient.js";
import { NetworkRuntime } from "./NetworkRuntime.js";

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
        const address = PeerAddress(this.owner.stateOf(CommissioningClient).peerAddress);
        if (address === undefined) {
            throw new InternalError(`Commissioned node ${this.owner} has no peer address`);
        }

        // Install the exchange provider for the node
        const { env } = this.owner;
        const peers = env.get(PeerSet);
        const peer = peers.get(address);
        if (peer === undefined) {
            throw new InternalError(`Commissioned node ${this.owner} has no peer ${address.toString()} installed`);
        }
        env.set(ExchangeProvider, peer.exchangeProvider);

        // Monitor sessions to maintain online state.  We consider the node "online" if there is an active session.  If
        // not, we consider the node offline.  This is the only real way we have of determining whether the node is
        // healthy without actively polling
        const syncOnlineStatus = this.#syncOnlineStatus.bind(this);

        this.#observers.on(peer.sessions.added, syncOnlineStatus);
        this.#observers.on(peer.sessions.deleted, syncOnlineStatus);
    }

    protected async stop() {
        this.isReady = false;
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
