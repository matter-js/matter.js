/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, MatterError, ObserverGroup } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import { ClientInteraction, ExchangeProvider, PeerAddress, PeerSet, SessionManager } from "#protocol";
import { CommissioningClient } from "../commissioning/CommissioningClient.js";
import { RemoteDescriptor } from "../commissioning/RemoteDescriptor.js";
import { NetworkRuntime } from "./NetworkRuntime.js";

export class UncommissionedError extends MatterError {}
export class OfflineError extends MatterError {}

const logger = Logger.get("ClientNetworkRuntime");

/**
 * Handles network functionality for {@link ClientNode}.
 */
export class ClientNetworkRuntime extends NetworkRuntime {
    #client?: ClientInteraction;
    #observers = new ObserverGroup();

    constructor(owner: ClientNode) {
        super(owner);
    }

    override get owner() {
        return super.owner as ClientNode;
    }

    protected async start() {
        // Ensure we can connect to the node
        if (!this.owner.lifecycle.isCommissioned) {
            throw new UncommissionedError(`Cannot interact with ${this.owner} because it is uncommissioned`);
        }

        if (this.owner.state.network.isDisabled) {
            throw new UncommissionedError(`Cannot interact with ${this.owner} because it is disabled`);
        }

        const address = this.owner.stateOf(CommissioningClient).peerAddress;

        if (address === undefined) {
            throw new InternalError(`Commissioned node ${this.owner} has no peer address`);
        }

        // Install the exchange provider for the node
        const { env, lifecycle } = this.owner;
        const peers = env.get(PeerSet);
        const commissioningState = this.owner.stateOf(CommissioningClient);
        const networkState = this.owner.state.network;

        const exchangeProvider = await peers.exchangeProviderFor(
            address,
            {
                discoveryData: RemoteDescriptor.fromLongForm(commissioningState),
            },
            networkState.caseAuthenticatedTags?.slice(),
        );
        env.set(ExchangeProvider, exchangeProvider);

        // Monitor sessions to maintain online state.  We consider the node "online" if there is an active session.  If
        // not, we consider the node offline.  This is the only real way we have of determining whether the node is
        // healthy without actively polling
        this.#client = env.get(ClientInteraction);
        const { sessions } = env.get(SessionManager);

        if (sessions.find(session => session.peerIs(address))) {
            this.owner.act(({ context }) => lifecycle.online.emit(context));
        }

        this.#observers.on(sessions.added, session => {
            if (lifecycle.isOnline) {
                return;
            }

            const address = PeerAddress(commissioningState.peerAddress);
            if (!address || session.peerAddress !== address) {
                return;
            }

            this.owner.act(({ context }) => lifecycle.online.emit(context));
        });

        this.#observers.on(sessions.deleted, session => {
            if (!lifecycle.isOnline) {
                return;
            }

            const address = PeerAddress(commissioningState.peerAddress);
            if (session.peerAddress !== address) {
                return;
            }

            if (address && sessions.find(({ peerAddress }) => peerAddress === address)) {
                return;
            }

            this.owner.act(({ context }) => lifecycle.offline.emit(context));
        });
    }

    protected async stop() {
        await this.construction;

        try {
            await this.#client?.close();
        } catch (e) {
            logger.error(`Error closing connection to ${this.owner}`, e);
        }

        this.#observers.close();
    }

    blockNewActivity() {
        this.owner.env.delete(ClientInteraction, this.#client);
    }
}
