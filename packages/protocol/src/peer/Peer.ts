/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformation } from "#clusters/basic-information";
import {
    AbortedError,
    BasicMultiplex,
    BasicSet,
    Diagnostic,
    isIpNetworkChannel,
    Lifetime,
    Logger,
    MaybePromise,
    ServerAddressUdp,
} from "#general";
import type { MdnsClient } from "#mdns/MdnsClient.js";
import type { NodeSession } from "#session/NodeSession.js";
import type { SecureSession } from "#session/SecureSession.js";
import type { SessionManager } from "#session/SessionManager.js";
import { ObservablePeerDescriptor, PeerDescriptor } from "./PeerDescriptor.js";
import type { NodeDiscoveryType } from "./PeerSet.js";

const logger = Logger.get("Peer");

/**
 * A node on a fabric we are a member of.
 */
export class Peer {
    #lifetime: Lifetime;
    #descriptor: PeerDescriptor;
    #context: Peer.Context;
    #sessions = new BasicSet<NodeSession>();
    #workers: BasicMultiplex;
    #isSaving = false;
    #limits: BasicInformation.CapabilityMinima = {
        caseSessionsPerFabric: 3,
        subscriptionsPerFabric: 3,
    };

    // TODO - manage these internally and/or factor away
    activeDiscovery?: Peer.ActiveDiscovery;
    activeReconnection?: Peer.ActiveReconnection;

    constructor(descriptor: PeerDescriptor, context: Peer.Context) {
        this.#lifetime = context.lifetime.join(descriptor.address.toString());
        this.#workers = new BasicMultiplex();

        this.#descriptor = new ObservablePeerDescriptor(descriptor, () => {
            if (this.#isSaving) {
                return;
            }

            this.#isSaving = true;
            this.#workers.add(this.#save());
        });
        this.#context = context;

        this.#sessions.added.on(session => {
            const updateNetworkAddress = (networkAddress: ServerAddressUdp) => {
                this.#descriptor.operationalAddress = networkAddress;
            };

            // Remove channel when destroyed
            session.closing.on(() => {
                this.#sessions.delete(session);
            });

            // Ensure the operational address is always set to the most recent IP
            if (!session.isClosed) {
                const { channel } = session.channel;
                if (isIpNetworkChannel(channel)) {
                    updateNetworkAddress(channel.networkAddress);
                    channel.networkAddressChanged.on(updateNetworkAddress);
                }
            }

            // Cancel any active discovery since we have a secure session now
            if (this.activeDiscovery) {
                logger.debug(`Cancelling discovery for ${this.address.toString()} - secure session established`);
                const { mdnsClient, stopTimerFunc } = this.activeDiscovery;
                stopTimerFunc?.();
                mdnsClient?.cancelOperationalDeviceDiscovery(this.fabric, this.address.nodeId, true);
                this.activeDiscovery = undefined;
            }

            // Resolve any pending reconnection since we have a session now
            if (this.activeReconnection) {
                logger.debug(
                    `Resolving reconnection for ${this.address.toString()} - session established via alternate path`,
                );
                const { resolver } = this.activeReconnection;
                // TODO When we have the pairing process abortable then abort it
                this.activeReconnection = undefined;
                resolver(session as SecureSession);
            }
        });
    }

    get fabric() {
        return this.#context.sessions.fabricFor(this.address);
    }

    get limits() {
        return this.#limits;
    }

    set limits(limits: BasicInformation.CapabilityMinima) {
        this.#limits = limits;
    }

    get address() {
        return this.#descriptor.address;
    }

    get descriptor() {
        return this.#descriptor;
    }

    get sessions() {
        return this.#sessions;
    }

    /**
     * Permanently forget the peer.
     */
    async delete() {
        logger.info("Removing", Diagnostic.strong(this.toString()));
        try {
            await this.close();
        } catch (error) {
            // When there are open reconnections, we could expect a peer closed abort error here, so ignore this error case
            AbortedError.accept(error);
        }
        await this.#context.deletePeer(this);
        await this.#context.sessions.deleteResumptionRecord(this.address);
    }

    /**
     * Close the peer without removing the persistent state.
     */
    async close() {
        using _lifetime = this.#lifetime.closing();

        if (this.activeDiscovery) {
            this.activeDiscovery.stopTimerFunc?.();

            // This ends discovery without triggering promises
            this.activeDiscovery.mdnsClient?.cancelOperationalDeviceDiscovery(this.fabric, this.address.nodeId, false);

            this.activeDiscovery = undefined;
        }

        if (this.activeReconnection) {
            const rejecter = this.activeReconnection.rejecter;
            this.activeReconnection = undefined;
            rejecter(new AbortedError("Peer closed"));
        }

        for (const session of this.#context.sessions.sessionsFor(this.address)) {
            await session.initiateClose();
        }

        await this.#workers;

        this.#context.closed(this);
    }

    toString() {
        return this.address.toString();
    }

    async #save() {
        using _lifetime = this.#lifetime.join("saving");
        this.#isSaving = false;
        await this.#context.savePeer(this);
    }
}

export namespace Peer {
    export interface Context {
        lifetime: Lifetime.Owner;
        sessions: SessionManager;
        savePeer(peer: Peer): MaybePromise<void>;
        deletePeer(peer: Peer): MaybePromise<void>;
        closed(peer: Peer): void;
    }

    // TODO - factor away
    export interface ActiveDiscovery {
        type: NodeDiscoveryType;
        promises?: (() => Promise<SecureSession>)[];
        stopTimerFunc?: (() => void) | undefined;
        mdnsClient?: MdnsClient;
    }

    // TODO - factor away
    export interface ActiveReconnection {
        promise: Promise<SecureSession | undefined>;
        resolver: (session: SecureSession | undefined) => void;
        rejecter: (reason?: any) => void;
    }
}
