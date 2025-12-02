/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryData, ScannerSet } from "#common/Scanner.js";
import {
    anyPromise,
    AsyncObservable,
    BasicSet,
    ChannelType,
    ConnectionlessTransportSet,
    Construction,
    createPromise,
    Duration,
    Environment,
    Environmental,
    ImmutableSet,
    ImplementationError,
    isIPv6,
    Logger,
    MatterError,
    Minutes,
    NoResponseTimeoutError,
    ObservableSet,
    Seconds,
    ServerAddress,
    ServerAddressUdp,
    Time,
    Timer,
} from "#general";
import { MdnsClient } from "#mdns/MdnsClient.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { RetransmissionLimitReachedError } from "#protocol/errors.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { DedicatedChannelExchangeProvider, ReconnectableExchangeProvider } from "#protocol/ExchangeProvider.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { CaseClient } from "#session/case/CaseClient.js";
import { SecureSession } from "#session/SecureSession.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { CaseAuthenticatedTag, NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "#types";
import { ControllerDiscovery, DiscoveryError, PairRetransmissionLimitReachedError } from "./ControllerDiscovery.js";
import { InteractionQueue } from "./InteractionQueue.js";
import { Peer } from "./Peer.js";
import { PeerAddressStore, PeerDataStore } from "./PeerAddressStore.js";
import { PeerDescriptor } from "./PeerDescriptor.js";

const logger = Logger.get("PeerSet");

const RECONNECTION_POLLING_INTERVAL = Minutes(10);
const RETRANSMISSION_DISCOVERY_TIMEOUT = Seconds(5);

/**
 * Types of discovery that may be performed when connecting operationally.
 */
export enum NodeDiscoveryType {
    /** No discovery is done, in calls means that only known addresses are tried. */
    None = 0,

    /** Retransmission discovery means that we ignore known addresses and start a query for 5s. */
    RetransmissionDiscovery = 1,

    /** Timed discovery means that the device is discovered for a defined timeframe, including known addresses. */
    TimedDiscovery = 2,

    /** Full discovery means that the device is discovered until it is found, excluding known addresses. */
    FullDiscovery = 3,
}

/** Error when an unknown node is tried to be connected or any other action done with it. */
export class UnknownNodeError extends MatterError {}

/**
 * Configuration for discovering when establishing a peer connection.
 */
export interface DiscoveryOptions {
    discoveryType?: NodeDiscoveryType;
    timeout?: Duration;
    discoveryData?: DiscoveryData;
}

/**
 * Extended discovery options that include case authenticated tags for peer connections.
 */
export interface PeerConnectionOptions {
    discoveryOptions?: DiscoveryOptions;
    caseAuthenticatedTags?: CaseAuthenticatedTag[];
}

/**
 * Interfaces {@link PeerSet} with other components.
 */
export interface PeerSetContext {
    sessions: SessionManager;
    exchanges: ExchangeManager;
    scanners: ScannerSet;
    transports: ConnectionlessTransportSet;
    store: PeerAddressStore;
}

/**
 * Manages operational connections to peers on shared fabric.
 */
export class PeerSet implements ImmutableSet<Peer>, ObservableSet<Peer> {
    readonly #sessions: SessionManager;
    readonly #exchanges: ExchangeManager;
    readonly #scanners: ScannerSet;
    readonly #transports: ConnectionlessTransportSet;
    readonly #caseClient: CaseClient;
    readonly #peers = new BasicSet<Peer>();
    readonly #construction: Construction<PeerSet>;
    readonly #store: PeerAddressStore;
    readonly #interactionQueue = new InteractionQueue();
    readonly #nodeCachedData = new PeerAddressMap<PeerDataStore>(); // Temporarily until we store it in new API
    readonly #disconnected = AsyncObservable<[peer: Peer]>();
    readonly #peerContext: Peer.Context;

    constructor(context: PeerSetContext) {
        const { sessions, exchanges, scanners, transports: netInterfaces, store } = context;

        this.#sessions = sessions;
        this.#exchanges = exchanges;
        this.#scanners = scanners;
        this.#transports = netInterfaces;
        this.#store = store;
        this.#caseClient = new CaseClient(this.#sessions);

        this.#peerContext = {
            sessions,
            savePeer: peer => this.#store.updatePeer(peer.descriptor),
            deletePeer: peer => this.#store.deletePeer(peer.address),
            closed: peer => this.#peers.delete(peer),
        };

        this.#peers.added.on(peer => {
            peer.sessions.deleted.on(() => {
                if (!peer.sessions.size) {
                    this.#disconnected.emit(peer);
                }
            });
        });

        this.#sessions.retry.on((session, count) => {
            if (count !== 1) {
                return;
            }

            this.#handleFirstRetry(session);
        });

        this.#construction = Construction(this, async () => {
            for (const descriptor of await this.#store.loadPeers()) {
                this.#peers.add(new Peer(descriptor, this.#peerContext));
            }
        });
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

    get construction() {
        return this.#construction;
    }

    static [Environmental.create](env: Environment) {
        const instance = new PeerSet({
            sessions: env.get(SessionManager),
            exchanges: env.get(ExchangeManager),
            scanners: env.get(ScannerSet),
            transports: env.get(ConnectionlessTransportSet),
            store: env.get(PeerAddressStore),
        });
        env.set(PeerSet, instance);
        return instance;
    }

    get peers() {
        return this.#peers;
    }

    get interactionQueue() {
        return this.#interactionQueue;
    }

    async connect(address: PeerAddress, options: PeerConnectionOptions & { operationalAddress?: ServerAddressUdp }) {
        await this.#ensureConnection(address, { ...options, allowUnknownPeer: true });
    }

    /**
     * Ensure there is a channel to the designated peer.
     */
    async #ensureConnection(
        address: PeerAddress,
        options: PeerConnectionOptions & {
            allowUnknownPeer?: boolean;
            operationalAddress?: ServerAddressUdp;
        },
    ) {
        address = PeerAddress(address);

        if (PeerAddress.isGroup(address)) {
            return;
        }

        const { allowUnknownPeer, operationalAddress } = options;
        if (!this.has(address) && !allowUnknownPeer) {
            throw new UnknownNodeError(`Cannot connect to unknown device ${PeerAddress(address)}`);
        }

        const peer = this.for(address);

        const { promise: existingReconnectPromise } = peer.activeReconnection ?? {};
        if (existingReconnectPromise !== undefined) {
            return existingReconnectPromise;
        }

        const { promise, resolver, rejecter } = createPromise<SecureSession>();
        peer.activeReconnection = { promise, rejecter };

        this.#resume(address, options, operationalAddress)
            .then(channel => {
                peer.activeReconnection = undefined;
                resolver(channel);
            })
            .catch(error => {
                peer.activeReconnection = undefined;
                rejecter(error);
            });

        return promise;
    }

    /**
     * Obtain an exchange provider for the designated peer.
     * TODO enhance PeerConnectionOptions.discoveryOptions.discoveryData with "addresses" for known operational addresses
     */
    async exchangeProviderFor(addressOrSession: PeerAddress | SecureSession, options: PeerConnectionOptions = {}) {
        if (addressOrSession instanceof SecureSession) {
            return new DedicatedChannelExchangeProvider(this.#exchanges, addressOrSession);
        }
        const address: PeerAddress = addressOrSession;
        if (PeerAddress.isGroup(address)) {
            const session = await this.#sessions.groupSessionForAddress(address, this.#transports);
            return new DedicatedChannelExchangeProvider(this.#exchanges, session);
        }
        let initiallyConnected = !!this.#sessions.maybeSessionFor(address);
        return new ReconnectableExchangeProvider(this.#exchanges, this.#sessions, address, async () => {
            const { caseAuthenticatedTags, discoveryOptions } = options;

            if (!initiallyConnected && !this.#sessions.maybeSessionFor(address)) {
                // We got an uninitialized node, so do the first connection as usual
                await this.#ensureConnection(address, {
                    discoveryOptions: { discoveryType: NodeDiscoveryType.None },
                    caseAuthenticatedTags,
                });
                initiallyConnected = true; // We only do this connection once, rest is handled in following code
                if (this.#sessions.maybeSessionFor(address)) {
                    return;
                }
            }

            if (!this.#sessions.maybeSessionFor(address)) {
                throw new RetransmissionLimitReachedError(`Device ${PeerAddress(address)} is unreachable`);
            }
            await this.#sessions.handlePeerLoss(address);

            // Enrich discoveryData with data from the node store when not provided
            const { discoveryData } = discoveryOptions ?? {
                discoveryData: this.get(address)?.descriptor.discoveryData,
            };
            // Try to use first result for one last try before we need to reconnect
            const operationalAddress = this.#knownOperationalAddressFor(address, true);
            if (operationalAddress === undefined) {
                logger.info(
                    `Re-discovering device failed (no address found), remove all sessions for ${PeerAddress(address)}`,
                );
                // We remove all sessions, this also informs the PairedNode class
                await this.#sessions.handlePeerLoss(address);
                throw new RetransmissionLimitReachedError(`No operational address found for ${PeerAddress(address)}`);
            }
            if (
                (await this.#reconnectKnownAddress(address, operationalAddress, discoveryData, {
                    expectedProcessingTime: Seconds(2),
                })) === undefined
            ) {
                throw new RetransmissionLimitReachedError(`${PeerAddress(address)} is not reachable`);
            }
        });
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

    async close() {
        for (const peer of this.#peers) {
            await peer.close();
        }

        this.#interactionQueue.close();
    }

    /**
     * Resume a device connection and establish a CASE session that was previously paired with the controller. This
     * method will try to connect to the device using the previously used server address (if set). If that fails, the
     * device is discovered again using its operational instance details.
     * It returns the operational MessageChannel on success.
     */
    async #resume(address: PeerAddress, options: PeerConnectionOptions, tryOperationalAddress?: ServerAddressUdp) {
        const { discoveryOptions: { discoveryType } = {} } = options;

        const operationalAddress =
            tryOperationalAddress ??
            (discoveryType === NodeDiscoveryType.None
                ? this.#getLastOperationalAddress(address)
                : this.#knownOperationalAddressFor(address));

        try {
            return await this.#connectOrDiscoverNode(address, operationalAddress, options);
        } catch (error) {
            if (
                (error instanceof DiscoveryError || error instanceof NoResponseTimeoutError) &&
                this.has(address) &&
                tryOperationalAddress === undefined
            ) {
                logger.info(`Resume failed, remove all sessions for ${PeerAddress(address)}`);
                // We remove all sessions, this also informs the PairedNode class
                await this.#sessions.handlePeerLoss(address);
            }
            throw error;
        }
    }

    async #connectOrDiscoverNode(
        address: PeerAddress,
        operationalAddress?: ServerAddressUdp,
        options?: PeerConnectionOptions,
    ) {
        address = PeerAddress(address);
        const {
            discoveryOptions: {
                discoveryType: requestedDiscoveryType = NodeDiscoveryType.FullDiscovery,
                timeout,
                discoveryData = this.get(address)?.descriptor.discoveryData,
            } = {},
            caseAuthenticatedTags,
        } = options ?? {};
        if (timeout !== undefined && requestedDiscoveryType !== NodeDiscoveryType.TimedDiscovery) {
            throw new ImplementationError("Cannot set timeout without timed discovery.");
        }
        if (requestedDiscoveryType === NodeDiscoveryType.RetransmissionDiscovery) {
            throw new ImplementationError("Cannot set retransmission discovery type.");
        }

        const mdnsScanner = this.#scanners.scannerFor(ChannelType.UDP) as MdnsClient | undefined;
        if (!mdnsScanner) {
            throw new ImplementationError("Cannot discover device without mDNS scanner.");
        }

        const peer = this.for(address);
        const existingDiscoveryDetails = peer.activeDiscovery ?? {
            type: NodeDiscoveryType.None,
        };

        // If we currently run another "lower" retransmission type we cancel it
        if (
            existingDiscoveryDetails.type !== NodeDiscoveryType.None &&
            existingDiscoveryDetails.type < requestedDiscoveryType
        ) {
            mdnsScanner.cancelOperationalDeviceDiscovery(this.#sessions.fabricFor(address), address.nodeId);
            peer.activeDiscovery = undefined;
            existingDiscoveryDetails.type = NodeDiscoveryType.None;
        }

        const { type: runningDiscoveryType, promises } = existingDiscoveryDetails;

        // If we have a last known address try to reach the device directly when we are not already discovering
        // In worst case parallel cases we do this step twice, but that's ok
        if (
            operationalAddress !== undefined &&
            (runningDiscoveryType === NodeDiscoveryType.None || requestedDiscoveryType === NodeDiscoveryType.None)
        ) {
            const directReconnection = await this.#reconnectKnownAddress(
                address,
                operationalAddress,
                discoveryData,
                // When we use a timeout for discovery also use this for reconnecting to the node
                { expectedProcessingTime: timeout, caseAuthenticatedTags },
            );
            if (directReconnection !== undefined) {
                return directReconnection;
            }
            if (requestedDiscoveryType === NodeDiscoveryType.None) {
                throw new DiscoveryError(`${address} is not reachable right now.`);
            }
        }

        if (operationalAddress === undefined && requestedDiscoveryType === NodeDiscoveryType.None) {
            throw new DiscoveryError(`${address} has no known address and No discovery was requested.`);
        }

        if (promises !== undefined) {
            if (runningDiscoveryType > requestedDiscoveryType) {
                // We already run a "longer" discovery, so we know it is unreachable for now
                throw new DiscoveryError(`${address} is not reachable right now and discovery already running.`);
            } else {
                // If we are already discovering this node, so we reuse promises
                return await anyPromise(promises);
            }
        }

        const discoveryPromises = new Array<() => Promise<SecureSession>>();
        let reconnectionPollingTimer: Timer | undefined;
        let stopTimerFunc: (() => void) | undefined;

        const lastOperationalAddress = this.#getLastOperationalAddress(address);
        if (lastOperationalAddress !== undefined) {
            // Additionally to general discovery we also try to poll the formerly known operational address
            if (requestedDiscoveryType === NodeDiscoveryType.FullDiscovery) {
                const { promise, resolver, rejecter } = createPromise<SecureSession>();

                logger.debug(
                    `Starting reconnection polling for ${ServerAddress.urlFor(lastOperationalAddress)} (interval ${Duration.format(RECONNECTION_POLLING_INTERVAL)})`,
                );
                reconnectionPollingTimer = Time.getPeriodicTimer(
                    "Controller reconnect",
                    RECONNECTION_POLLING_INTERVAL,
                    async () => {
                        try {
                            logger.debug(`Polling for device at ${ServerAddress.urlFor(lastOperationalAddress)} ...`);
                            const result = await this.#reconnectKnownAddress(
                                address,
                                lastOperationalAddress,
                                discoveryData,
                                { caseAuthenticatedTags },
                            );
                            if (result !== undefined && reconnectionPollingTimer?.isRunning) {
                                reconnectionPollingTimer?.stop();
                                mdnsScanner.cancelOperationalDeviceDiscovery(
                                    this.#sessions.fabricFor(address),
                                    address.nodeId,
                                );
                                peer.activeDiscovery = undefined;
                                resolver(result);
                            }
                        } catch (error) {
                            if (reconnectionPollingTimer?.isRunning) {
                                reconnectionPollingTimer?.stop();
                                mdnsScanner.cancelOperationalDeviceDiscovery(
                                    this.#sessions.fabricFor(address),
                                    address.nodeId,
                                );
                                peer.activeDiscovery = undefined;
                                rejecter(error);
                            }
                        }
                    },
                ).start();

                stopTimerFunc = () => {
                    reconnectionPollingTimer?.stop();
                    reconnectionPollingTimer = undefined;
                    rejecter(new NoResponseTimeoutError("Reconnection polling cancelled"));
                };
                discoveryPromises.push(() => promise);
            }
        }

        discoveryPromises.push(async () => {
            const scanResult = await ControllerDiscovery.discoverOperationalDevice(
                this.#sessions.fabricFor(address),
                address.nodeId,
                mdnsScanner,
                timeout,
                timeout === undefined,
            );
            const { stopTimerFunc } = peer.activeDiscovery ?? {};
            stopTimerFunc?.();
            peer.activeDiscovery = undefined;

            const { result } = await ControllerDiscovery.iterateServerAddresses(
                [scanResult],
                NoResponseTimeoutError,
                async () => {
                    const device = mdnsScanner.getDiscoveredOperationalDevice(
                        this.#sessions.fabricFor(address),
                        address.nodeId,
                    );
                    return device !== undefined ? [device] : [];
                },
                async (operationalAddress, peer) => {
                    const result = await this.#pair(address, operationalAddress, peer, { caseAuthenticatedTags });
                    await this.#addOrUpdatePeer(address, operationalAddress, {
                        ...discoveryData,
                        ...peer,
                    });
                    return result;
                },
            );

            return result;
        });

        peer.activeDiscovery = {
            type: requestedDiscoveryType,
            promises: discoveryPromises,
            stopTimerFunc,
            mdnsClient: mdnsScanner,
        };

        return await anyPromise(discoveryPromises).finally(() => {
            peer.activeDiscovery = undefined;
        });
    }

    async #reconnectKnownAddress(
        address: PeerAddress,
        operationalAddress: ServerAddressUdp,
        discoveryData?: DiscoveryData,
        options?: CaseClient.PairOptions,
    ): Promise<SecureSession | undefined> {
        address = PeerAddress(address);

        const { ip, port } = operationalAddress;
        const { expectedProcessingTime } = options ?? {};
        const startTime = Time.nowMs;
        try {
            logger.debug(
                `Resuming connection to ${PeerAddress(address)} at ${ip}:${port}${
                    expectedProcessingTime !== undefined
                        ? ` with expected processing time of ${Duration.format(expectedProcessingTime)}`
                        : ""
                }`,
            );
            const session = await this.#pair(address, operationalAddress, discoveryData, options);
            await this.#addOrUpdatePeer(address, operationalAddress);
            return session;
        } catch (error) {
            if (error instanceof NoResponseTimeoutError) {
                logger.debug(
                    `Failed to resume connection to ${address} connection with ${ip}:${port}, discovering the node now:`,
                    error.message ? error.message : error,
                );
                // We remove all sessions, this also informs the PairedNode class
                await this.#sessions.handlePeerLoss(address, startTime);
                return undefined;
            } else {
                throw error;
            }
        }
    }

    /** Pair with an operational device (already commissioned) and establish a CASE session. */
    async #pair(
        address: PeerAddress,
        operationalServerAddress: ServerAddressUdp,
        discoveryData?: DiscoveryData,
        options?: CaseClient.PairOptions,
    ) {
        logger.debug(`Pair with ${address} at ${ServerAddress.urlFor(operationalServerAddress)}`);
        const { ip, port } = operationalServerAddress;
        // Do CASE pairing
        const isIpv6Address = isIPv6(ip);
        const operationalInterface = this.#transports.interfaceFor(ChannelType.UDP, isIpv6Address ? "::" : "0.0.0.0");

        if (operationalInterface === undefined) {
            throw new PairRetransmissionLimitReachedError(
                `IPv${
                    isIpv6Address ? "6" : "4"
                } interface not initialized for port ${port}. Cannot use ${ip} for pairing.`,
            );
        }

        const operationalChannel = await operationalInterface.openChannel(operationalServerAddress);
        const { sessionParameters } = this.#sessions.findResumptionRecordByAddress(address) ?? {};
        const unsecuredSession = this.#sessions.createUnsecuredSession({
            channel: operationalChannel,
            // Use the session parameters from MDNS announcements when available and rest is assumed to be fallbacks
            sessionParameters: {
                ...sessionParameters,
                idleInterval: discoveryData?.SII ?? sessionParameters?.idleInterval,
                activeInterval: discoveryData?.SAI ?? sessionParameters?.activeInterval,
                activeThreshold: discoveryData?.SAT ?? sessionParameters?.activeThreshold,
            },
            isInitiator: true,
        });

        try {
            return await this.#doCasePair(unsecuredSession, address, options);
        } catch (error) {
            NoResponseTimeoutError.accept(error);

            // Convert error
            throw new PairRetransmissionLimitReachedError(error.message);
        } finally {
            await unsecuredSession.initiateClose();
        }
    }

    async #doCasePair(
        paseSession: Session,
        address: PeerAddress,
        options?: CaseClient.PairOptions,
    ): Promise<SecureSession> {
        const fabric = this.#sessions.fabricFor(address);
        let exchange: MessageExchange | undefined;
        try {
            exchange = this.#exchanges.initiateExchangeForSession(paseSession, SECURE_CHANNEL_PROTOCOL_ID);

            const { session, resumed } = await this.#caseClient.pair(exchange, fabric, address.nodeId, options);

            if (!resumed) {
                // When the session was not resumed then most likely the device firmware got updated, so we clear the cache
                this.#nodeCachedData.delete(address);
            }
            return session;
        } catch (error) {
            await exchange?.close();

            if (
                error instanceof ChannelStatusResponseError &&
                error.protocolStatusCode === SecureChannelStatusCode.NoSharedTrustRoots
            ) {
                // It seems the stored resumption record is outdated; we need to retry pairing without resumption
                if (await this.#sessions.deleteResumptionRecord(fabric.addressOf(address.nodeId))) {
                    logger.info(
                        `Case client: Resumption record seems outdated for Fabric ${NodeId.toHexString(fabric.nodeId)} (index ${fabric.fabricIndex}) and PeerNode ${NodeId.toHexString(address.nodeId)}. Retrying pairing without resumption...`,
                    );
                    // An endless loop should not happen here, as the resumption record is deleted in the next step
                    return await this.#doCasePair(paseSession, address, options);
                }
            }
            throw error;
        }
    }

    /**
     * Obtain an operational address for a logical address from cache.
     */
    #knownOperationalAddressFor(address: PeerAddress, ignoreDiscoveredAddresses = false) {
        const lastKnownAddress = this.#getLastOperationalAddress(address);
        if (lastKnownAddress !== undefined && ignoreDiscoveredAddresses) {
            return lastKnownAddress;
        }

        const mdnsScanner = this.#scanners.scannerFor(ChannelType.UDP) as MdnsClient | undefined;
        const discoveredAddresses = mdnsScanner?.getDiscoveredOperationalDevice(
            this.#sessions.fabricFor(address),
            address.nodeId,
        );

        if (
            lastKnownAddress !== undefined &&
            discoveredAddresses !== undefined &&
            discoveredAddresses.addresses.some(
                ({ ip, port }) => ip === lastKnownAddress.ip && port === lastKnownAddress.port,
            )
        ) {
            // We found the same address, so assume somehow cached response because we just tried to connect,
            // and it failed, so clear list
            discoveredAddresses.addresses.length = 0;
        }

        // Try to use first result for one last try before we need to reconnect
        return discoveredAddresses?.addresses[0];
    }

    async #addOrUpdatePeer(
        address: PeerAddress,
        operationalServerAddress?: ServerAddressUdp,
        discoveryData?: DiscoveryData,
    ) {
        let peer = this.get(address);
        if (peer === undefined) {
            peer = new Peer({ address, dataStore: await this.#store.createNodeStore(address) }, this.#peerContext);
            this.#peers.add(peer);
        }
        peer.descriptor.operationalAddress = operationalServerAddress ?? peer.descriptor.operationalAddress;
        if (discoveryData !== undefined) {
            peer.descriptor.discoveryData = {
                ...peer.descriptor.discoveryData,
                ...discoveryData,
            };
        }

        // If we got a new channel and have a running discovery we can end it
        if (peer.descriptor.operationalAddress !== undefined && peer.activeDiscovery) {
            logger.info(`Found ${address} during discovery, cancel discovery.`);
            // We are currently discovering this node, so we need to update the discovery data
            const { mdnsClient: mdnsScanner } = peer.activeDiscovery ?? {};

            // This ends discovery and triggers the promises
            mdnsScanner?.cancelOperationalDeviceDiscovery(this.#sessions.fabricFor(address), address.nodeId, true);
        }
    }

    addKnownPeer(address: PeerAddress, operationalServerAddress?: ServerAddressUdp, discoveryData?: DiscoveryData) {
        return this.#addOrUpdatePeer(address, operationalServerAddress, discoveryData);
    }

    #getLastOperationalAddress(address: PeerAddress) {
        return this.get(address)?.descriptor.operationalAddress;
    }

    #handleFirstRetry(session: Session) {
        if (!session.isSecure || (session as SecureSession).fabric === undefined) {
            // For unsecured sessions from CASE/PASE or not yet fabric bound session establishments we do not need to do
            // anything
            return;
        }
        const { associatedFabric: fabric, peerNodeId: nodeId } = session;
        if (fabric === undefined || nodeId === undefined) {
            return;
        }
        const address = fabric.addressOf(nodeId);
        const peer = this.for(address);
        if (peer.activeDiscovery) {
            // We already discover for this node, so we do not need to start a new discovery
            return;
        }
        peer.activeDiscovery = { type: NodeDiscoveryType.RetransmissionDiscovery };
        this.#scanners
            .scannerFor(ChannelType.UDP)
            ?.findOperationalDevice(fabric, nodeId, RETRANSMISSION_DISCOVERY_TIMEOUT, true)
            .catch(error => {
                logger.error(`Failed to discover ${address} after resubmission started.`, error);
            })
            .finally(() => {
                if (peer.activeDiscovery?.type === NodeDiscoveryType.RetransmissionDiscovery) {
                    peer.activeDiscovery = undefined;
                }
            });
    }
}
