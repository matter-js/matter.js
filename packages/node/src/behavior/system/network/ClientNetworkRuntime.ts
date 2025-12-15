/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger, MatterError, ObserverGroup } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import {
    ClientInteraction,
    ExchangeProvider,
    InteractionQueue,
    PeerAddress,
    PeerSet,
    QueuedClientInteraction,
    SessionManager,
} from "#protocol";
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
    #queuedClient?: QueuedClientInteraction;
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

        const exchangeProvider = await peers.exchangeProviderFor(address, {
            discoveryOptions: {
                discoveryData: RemoteDescriptor.fromLongForm(commissioningState),
            },
            caseAuthenticatedTags: networkState.caseAuthenticatedTags
                ? [...networkState.caseAuthenticatedTags] // needed because the tags are readonly
                : undefined,
        });
        env.set(ExchangeProvider, exchangeProvider);

        this.#client = new ClientInteraction({ environment: env, abort: this.abortSignal });
        env.set(ClientInteraction, this.#client);
        this.#queuedClient = new QueuedClientInteraction({
            environment: env,
            abort: this.abortSignal,
            queue: env.get(InteractionQueue), // created and owned by Peers
        });
        env.set(QueuedClientInteraction, this.#queuedClient);

        // Monitor sessions to maintain online state.  We consider the node "online" if there is an active session.  If
        // not, we consider the node offline.  This is the only real way we have of determining whether the node is
        // healthy without actively polling
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

        this.owner.env.delete(ClientInteraction, this.#client);
        this.owner.env.delete(QueuedClientInteraction, this.#queuedClient);

        try {
            await this.#client?.close();
        } catch (e) {
            logger.error(`Error closing connection to ${this.owner}`, e);
        }

        this.#observers.close();
    }
}
