/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientInteraction } from "#action/client/ClientInteraction.js";
import type { NodeProtocol } from "#action/protocols.js";
import { BasicInformation } from "#clusters/basic-information";
import { DiscoveryData } from "#common/Scanner.js";
import {
    Abort,
    AbortedError,
    AsyncObservable,
    BasicMultiplex,
    BasicSet,
    ClosedError,
    Diagnostic,
    DnssdNames,
    Duration,
    Identity,
    IpService,
    isIpNetworkChannel,
    Lifetime,
    Logger,
    Millis,
    ObserverGroup,
    QuietObservable,
    ServerAddressUdp,
    Time,
    Timestamp,
} from "#general";
import { getOperationalDeviceQname } from "#mdns/MdnsConsts.js";
import type { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionParameters } from "#session/SessionParameters.js";
import type { GlobalAttributes, TypeFromSchema } from "#types";
import type { NetworkProfiles } from "./NetworkProfile.js";
import { PeerUnreachableError } from "./PeerCommunicationError.js";
import { PeerConnection } from "./PeerConnection.js";
import { ObservablePeerDescriptor, PeerDescriptor } from "./PeerDescriptor.js";
import { PeerExchangeProvider } from "./PeerExchangeProvider.js";
import type { PhysicalDeviceProperties } from "./PhysicalDeviceProperties.js";

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
    #interaction?: ClientInteraction;
    #protocol?: NodeProtocol;
    #physicalProperties?: PhysicalDeviceProperties;
    #abort = new Abort();
    #connecting?: ConnectionProcess;
    #service: IpService;
    #observers = new ObserverGroup();
    #exchangeProvider?: ExchangeProvider;
    #updated = AsyncObservable<[peer: Peer]>();

    constructor(descriptor: PeerDescriptor, context: Peer.Context) {
        this.#lifetime = context.join(descriptor.address.toString());
        this.#workers = new BasicMultiplex();

        this.#descriptor = new ObservablePeerDescriptor(descriptor, () => {
            if (this.#isSaving) {
                return;
            }

            this.#isSaving = true;
            this.#workers.add(this.#save());
        });

        this.#service = new IpService(
            getOperationalDeviceQname(
                context.sessions.fabricFor(descriptor.address).globalId,
                descriptor.address.nodeId,
            ),

            Diagnostic.via(this.address.toString()),

            context.names,
        );

        // Consider service initially reachable if we have a known operational address
        if (descriptor.operationalAddress) {
            this.#service.status.isReachable = true;
        }

        this.#context = context;

        this.#observers.on(this.#service.changed, () => {
            // Update persisted discovery data
            this.#descriptor.discoveryData = {
                ...this.#descriptor.discoveryData,
                ...DiscoveryData(this.#service.parameters),
            };
        });

        this.#observers.on(this.#sessions.added, session => {
            const updateNetworkAddress = (networkAddress: ServerAddressUdp) => {
                this.#descriptor.operationalAddress = networkAddress;
            };

            // Remove session when destroyed
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

            // Ensure session parameters reflect those most recently reported by peer
            this.#descriptor.sessionParameters = session.parameters;
        });
    }

    /**
     * Emits when metadata changes.
     */
    get updated() {
        return this.#updated;
    }

    get lifetime() {
        return this.#lifetime;
    }

    get fabric() {
        return this.#context.sessions.fabricFor(this.address);
    }

    get interaction() {
        return this.#interaction;
    }

    set interaction(interaction: ClientInteraction | undefined) {
        this.#interaction = interaction;
    }

    get protocol() {
        return this.#protocol;
    }

    set protocol(protocol: NodeProtocol | undefined) {
        this.#protocol = protocol;
    }

    get physicalProperties() {
        return this.#physicalProperties;
    }

    set physicalProperties(props: PhysicalDeviceProperties | undefined) {
        this.#physicalProperties = props;
    }

    get basicInformation() {
        return this.#protocol?.[0]?.[BasicInformation.Cluster.id]?.readState({}) as Peer.BasicInformation | undefined;
    }

    get limits() {
        return {
            caseSessionsPerFabric: 3,
            subscriptionsPerFabric: 3,
            ...this.basicInformation?.capabilityMinima,
        };
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

    get subscriptions() {
        // TODO - this should just be #subscriptions
        return [...this.#sessions].flatMap(session => [...session.subscriptions]);
    }

    get exchangeProvider() {
        if (this.#exchangeProvider === undefined) {
            this.#exchangeProvider = new PeerExchangeProvider(this, this.#context);
        }
        return this.#exchangeProvider;
    }

    get service() {
        return this.#service;
    }

    /**
     * "Best guess" {@link SessionParameters} for the peer based on available information.
     */
    get sessionParameters() {
        const bi = this.basicInformation;
        const dd = this.descriptor.discoveryData;

        return SessionParameters({
            dataModelRevision: bi?.dataModelRevision,
            maxPathsPerInvoke: bi?.maxPathsPerInvoke,
            specificationVersion: bi?.specificationVersion,
            idleInterval: dd?.SII,
            activeInterval: dd?.SAI,
            activeThreshold: dd?.SAT,
            ...this.#descriptor.sessionParameters,
        });
    }

    get network() {
        return this.#context.networks.forPeer(this);
    }

    /**
     * Time that node has been unreachable.
     *
     * If we are actively attempting to connect to the peer, this is the time since the connection process started.
     * Otherwise it is zero.
     */
    get timeOffline() {
        if (this.service.status.connectionInitiatedAt === undefined) {
            return 0;
        }

        return Timestamp.delta(this.service.status.connectionInitiatedAt, Time.nowMs);
    }

    /**
     * Obtain a session with the peer, establishing anew as necessary.
     */
    async connect(options?: Peer.ConnectOptions) {
        while (true) {
            const session = this.#newestSession;
            if (session) {
                return session;
            }

            this.#initiateConnection(options);

            let timeout: Duration | undefined =
                options?.connectionTimeout ??
                (options?.abort ? undefined : this.#context.timing.defaultConnectionTimeout);
            if (timeout === undefined || timeout <= 0 || timeout === Infinity) {
                timeout = undefined;
            } else if (!options?.kick) {
                timeout = Millis(timeout - this.timeOffline);
            }

            using localAbort = new Abort({
                abort: [this.#abort, options?.abort],
                timeout,

                timeoutHandler: () => {
                    throw new PeerUnreachableError(this.timeOffline);
                },
            });
            localAbort.throwIfAborted();

            await localAbort.race(this.#connecting?.done);

            localAbort.throwIfAborted();
        }
    }

    /**
     * Kick the connection process.
     *
     * This will temporarily increase MRP responsiveness of any ongoing connection attempt.
     */
    kick() {
        this.#connecting?.kick();
    }

    /**
     * Abort any outstanding connection attempts.
     */
    async disconnect() {
        if (this.#connecting) {
            using _disconnecting = this.#lifetime.join("disconnecting");
            this.#connecting.abort();
            await this.#connecting.done;
        }

        // TODO - need to shutdown exchanges and sessions here too so you can cleanly take down a single peer, but
        // currently that's handled by "managers" for those entities
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
        await this.#context.sessions.deleteResumptionRecord(this.address);
    }

    /**
     * Close the peer without removing persistent state.
     */
    async close() {
        using _lifetime = this.#lifetime.closing();

        this.#observers.close();

        this.#abort(new ClosedError("Peer closed"));

        for (const session of this.#context.sessions.sessionsFor(this.address)) {
            await session.initiateClose();
        }

        await this.#workers;

        await this.#service.close();

        this.#context.closed(this);
    }

    toString() {
        return this.address.toString();
    }

    get hasSession() {
        return !!this.sessions.find(session => !session.isClosing && !session.isPeerLost);
    }

    async #save() {
        using _lifetime = this.#lifetime.join("saving");
        this.#isSaving = false;
        await this.#updated.emit(this);
    }

    get #newestSession() {
        // Prefer the most recently used session.  Older ones may not work with broken peers (e.g. CHIP test harness)
        let found: NodeSession | undefined;

        for (const session of this.#sessions) {
            if (session.isClosing || session.isPeerLost) {
                continue;
            }

            if (!found || found.timestamp < session.timestamp) {
                found = session;
            }
        }

        return found;
    }

    #initiateConnection(options?: Peer.ConnectOptions) {
        if (this.#connecting) {
            if (options?.kick) {
                this.kick();
            }
            return;
        }

        const abort = new Abort({ abort: this.#abort });

        // Abort connection if a session is established from any source
        const added = this.#sessions.added.use(() => abort());

        const kicker = new QuietObservable({
            minimumEmitInterval: this.#context.timing.minimumTimeBetweenMrpKicks,
            skipSuppressedEmits: true,
        });

        this.#connecting = {
            abort,

            done: PeerConnection(this, this.#context, {
                network: options?.network,
                abort,
                kicker,
            }).finally(() => {
                this.#connecting = undefined;
                abort.close();
                added[Symbol.dispose]();
            }),

            kick() {
                kicker.emit();
            },
        };
        this.#workers.add(this.#connecting);
    }
}

export namespace Peer {
    export interface Context extends PeerConnection.Context {
        names: DnssdNames;
        networks: NetworkProfiles;
        closed(peer: Peer): void;
    }

    export interface BasicInformation extends Identity<{
        readonly [N in keyof Omit<
            typeof BasicInformation.Complete.attributes,
            keyof typeof GlobalAttributes
        >]?: TypeFromSchema<(typeof BasicInformation.Complete.attributes)[N]["schema"]>;
    }> {}

    export interface ConnectOptions {
        /**
         * Aborts the connection attempt (underlying connection however may continue).
         */
        abort?: AbortSignal;

        /**
         * Network identifier used for timing parameters.
         */
        network?: string;

        /**
         * A timeout relative to beginning of connection process.
         *
         * If the peer is already connecting, connection time is reduced by this amount.
         */
        connectionTimeout?: Duration;

        /**
         * If a connection is ongoing, kicks the process to increase MRP responsiveness.
         *
         * If true, {@link connectionTimeout} is not reduced if already connecting.
         */
        kick?: boolean;
    }
}

interface ConnectionProcess {
    done: Promise<NodeSession | void>;
    abort: Abort;
    kick: () => void;
}
