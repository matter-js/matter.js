/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    AsyncObservable,
    BasicSet,
    ChannelType,
    DnssdNames,
    Environment,
    Environmental,
    ImmutableSet,
    ImplementationError,
    isIpNetworkChannel,
    isIPv6,
    Lifetime,
    MatterAggregateError,
    NetworkUnreachableError,
    ObservableSet,
    ObserverGroup,
    RetrySchedule,
    ServerAddressUdp,
} from "#general";
import { MdnsService } from "#mdns/MdnsService.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { FabricIndex } from "#types";
import { NetworkProfiles } from "./NetworkProfile.js";
import { Peer } from "./Peer.js";
import { PeerDescriptor } from "./PeerDescriptor.js";
import { PeerTimingParameters } from "./PeerTimingParameters.js";

/**
 * Interfaces {@link PeerSet} with other components.
 */
export interface PeerSetContext {
    lifetime: Lifetime.Owner;
    sessions: SessionManager;
    names: DnssdNames;
    networks: NetworkProfiles;
    connectionRetries?: RetrySchedule;
    timing?: PeerTimingParameters;
}

/**
 * Manages operational connections to peers on shared fabric.
 */
export class PeerSet implements ImmutableSet<Peer>, ObservableSet<Peer> {
    readonly #lifetime: Lifetime;
    readonly #sessions: SessionManager;
    readonly #peers = new BasicSet<Peer>();
    readonly #disconnected = AsyncObservable<[peer: Peer]>();
    readonly #peerContext: Peer.Context;
    readonly #networks: NetworkProfiles;
    readonly #observers = new ObserverGroup();
    #exchanges?: ExchangeManager;

    constructor(context: PeerSetContext) {
        const { lifetime, sessions, names, networks, timing } = context;

        this.#lifetime = lifetime.join("peers");
        this.#sessions = sessions;
        this.#networks = networks;

        const self = this;

        this.#peerContext = {
            sessions,
            names,
            networks,
            timing: PeerTimingParameters(timing),

            get exchanges() {
                if (self.#exchanges === undefined) {
                    throw new ImplementationError("Client networking is not initialized");
                }
                return self.#exchanges;
            },

            openSocket: (address, abort) => this.#openSocket(address, abort),
            closed: peer => this.#peers.delete(peer),
            join: name => this.#lifetime.join(name),
        };

        this.#peers.added.on(peer => {
            peer.sessions.deleted.on(() => {
                if (!peer.sessions.size) {
                    this.#disconnected.emit(peer);
                }
            });
        });

        this.#sessions.sessions.added.on(session => {
            if (session.peerAddress.fabricIndex === FabricIndex.NO_FABRIC || session.isClosed) {
                return;
            }

            this.addKnownPeer({
                address: session.peerAddress,
                operationalAddress: operationalAddressOf(session),
            });
        });

        this.#observers.on(this.#sessions.sessions.added, session => {
            if (session.fabric === undefined) {
                return;
            }

            this.for(session.peerAddress).sessions.add(session);
        });
    }

    set exchanges(exchanges: ExchangeManager | undefined) {
        this.#exchanges = exchanges;
    }

    get added() {
        return this.#peers.added;
    }

    get deleted() {
        return this.#peers.deleted;
    }

    get empty() {
        return this.#peers.empty;
    }

    get disconnected() {
        return this.#disconnected;
    }

    /**
     * Unconditional get.
     *
     * Creates the peer if not already present.
     */
    for(address: PeerAddress) {
        let peer = this.get(address);
        if (peer) {
            return peer;
        }

        peer = new Peer({ address }, this.#peerContext);
        this.#peers.add(peer);

        return peer;
    }

    has(item: PeerAddress | PeerDescriptor | Peer) {
        return !!this.get(item);
    }

    get size() {
        return this.#peers.size;
    }

    find(predicate: (item: Peer) => boolean | undefined) {
        return this.#peers.find(predicate);
    }

    filter(predicate: (item: Peer) => boolean | undefined) {
        return this.#peers.filter(predicate);
    }

    map<T>(mapper: (item: Peer) => T) {
        return this.#peers.map(mapper);
    }

    [Symbol.iterator]() {
        return this.#peers[Symbol.iterator]();
    }

    static [Environmental.create](env: Environment) {
        const instance = new PeerSet({
            lifetime: env,
            sessions: env.get(SessionManager),
            names: env.get(MdnsService).names,
            networks: env.get(NetworkProfiles),
        });
        env.set(PeerSet, instance);
        return instance;
    }

    get peers() {
        return this.#peers;
    }

    get networks() {
        return this.#networks;
    }

    get timing() {
        return this.#peerContext.timing;
    }

    set timing(timing: Partial<PeerTimingParameters>) {
        this.#peerContext.timing = PeerTimingParameters(timing);
    }

    /**
     * Retrieve a peer by address.
     */
    get(peer: PeerAddress | PeerDescriptor) {
        if ("address" in peer) {
            return this.#peers.get("address", PeerAddress(peer.address));
        }
        return this.#peers.get("address", PeerAddress(peer));
    }

    /**
     * Terminate any active peer networking operations.
     *
     * Also sets {@link exchanges} to undefined to prevent future connections.
     */
    async disconnect() {
        using _disconnecting = this.#lifetime.join("disconnecting");

        this.#exchanges = undefined;

        await MatterAggregateError.allSettled(
            this.#peers.map(peer => peer.disconnect()),
            "Error disconnecting peers",
        );
    }

    async close() {
        using _closing = this.#lifetime.closing();

        for (const peer of this.#peers) {
            await peer.close();
        }

        this.#observers.close();
    }

    async #openSocket(address: ServerAddressUdp, abort: AbortSignal) {
        const isIpv6Address = isIPv6(address.ip);
        const operationalInterface = this.#peerContext.exchanges.interfaceFor(
            ChannelType.UDP,
            isIpv6Address ? "::" : "0.0.0.0",
        );

        if (operationalInterface === undefined) {
            throw new NetworkUnreachableError(`No interface available for IP address ${address.ip}`);
        }

        return await Abort.race(abort, operationalInterface.openChannel(address));
    }

    addKnownPeer(descriptor: PeerDescriptor) {
        let peer = this.get(descriptor.address);
        if (peer === undefined) {
            peer = new Peer(descriptor, this.#peerContext);
            this.#peers.add(peer);
        }

        if (descriptor.operationalAddress !== undefined) {
            peer.descriptor.operationalAddress = descriptor.operationalAddress;
        }

        if (descriptor.discoveryData !== undefined) {
            peer.descriptor.discoveryData = {
                ...peer.descriptor.discoveryData,
                ...descriptor.discoveryData,
            };
        }

        if (descriptor.caseAuthenticatedTags !== undefined) {
            peer.descriptor.caseAuthenticatedTags = descriptor.caseAuthenticatedTags;
        }

        if (descriptor.sessionParameters !== undefined) {
            peer.descriptor.sessionParameters = {
                ...peer.descriptor.sessionParameters,
                ...descriptor.sessionParameters,
            };
        }

        return peer;
    }
}

function operationalAddressOf(session: Session) {
    if (session.isClosed || !isIpNetworkChannel(session.channel)) {
        return;
    }
    return session.channel.networkAddress;
}
