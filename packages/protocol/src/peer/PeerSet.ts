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
    isIpNetworkChannel,
    isIPv6,
    Logger,
    MatterError,
    Minutes,
    NoResponseTimeoutError,
    ObservableSet,
    Seconds,
    ServerAddress,
    ServerAddressUdp,
    STANDARD_MATTER_PORT,
    Time,
    Timer,
} from "#general";
import { MdnsClient } from "#mdns/MdnsClient.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { ChannelManager } from "#protocol/ChannelManager.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { DedicatedChannelExchangeProvider, ReconnectableExchangeProvider } from "#protocol/ExchangeProvider.js";
import { ChannelNotConnectedError, MessageChannel } from "#protocol/MessageChannel.js";
import { MessageExchange, RetransmissionLimitReachedError } from "#protocol/MessageExchange.js";
import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { CaseClient } from "#session/case/CaseClient.js";
import { SecureSession } from "#session/SecureSession.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { CaseAuthenticatedTag, GroupId, NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "#types";
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

interface RunningDiscovery {
    type: NodeDiscoveryType;
    promises?: (() => Promise<MessageChannel>)[];
    stopTimerFunc?: (() => void) | undefined;
    mdnsClient?: MdnsClient;
}

/**
 * Interfaces {@link PeerSet} with other components.
 */
export interface PeerSetContext {
    sessions: SessionManager;
    channels: ChannelManager;
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
    readonly #channels: ChannelManager;
    readonly #exchanges: ExchangeManager;
    readonly #scanners: ScannerSet;
    readonly #transports: ConnectionlessTransportSet;
    readonly #caseClient: CaseClient;
    readonly #peers = new BasicSet<Peer>();
    readonly #peersByAddress = new PeerAddressMap<Peer>();
    readonly #runningPeerDiscoveries = new PeerAddressMap<RunningDiscovery>();
    readonly #runningPeerReconnections = new PeerAddressMap<{
        promise: Promise<MessageChannel>;
        rejecter: (reason?: any) => void;
    }>();
    readonly #construction: Construction<PeerSet>;
    readonly #store: PeerAddressStore;
    readonly #interactionQueue = new InteractionQueue();
    readonly #nodeCachedData = new PeerAddressMap<PeerDataStore>(); // Temporarily until we store it in new API
    readonly #disconnected = AsyncObservable<[address: PeerAddress]>();

    constructor(context: PeerSetContext) {
        const { sessions, channels, exchanges, scanners, transports: netInterfaces, store } = context;

        this.#sessions = sessions;
        this.#channels = channels;
        this.#exchanges = exchanges;
        this.#scanners = scanners;
        this.#transports = netInterfaces;
        this.#store = store;
        this.#caseClient = new CaseClient(this.#sessions);

        this.#peers.added.on(peer => {
            this.#peersByAddress.set(peer.address, peer);
        });

        this.#peers.deleted.on(peer => {
            this.#peersByAddress.delete(peer.address);
        });

        this.#sessions.retry.on((session, count) => {
            if (count !== 1) {
                return;
            }

            this.#handleFirstRetry(session);
        });

        /** A channel was added by ourselves */
        this.#channels.added.on((address, msgChannel) => {
            if (isIpNetworkChannel(msgChannel.channel)) {
                // Update the channel address if it has one
                return this.#addOrUpdatePeer(address, msgChannel.channel.networkAddress);
            }
        });

        this.#construction = Construction(this, async () => {
            for (const descriptor of await this.#store.loadPeers()) {
                this.#peers.add(new Peer(descriptor));
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

    has(item: PeerAddress | PeerDescriptor | Peer) {
        if ("address" in item) {
            return this.#peersByAddress.has(item.address);
        }
        return this.#peersByAddress.has(item);
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
            channels: env.get(ChannelManager),
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

        const isGroupNode = PeerAddress.isGroup(address);
        const { allowUnknownPeer, operationalAddress } = options;
        if (!this.#peersByAddress.has(address) && !allowUnknownPeer && !isGroupNode) {
            throw new UnknownNodeError(`Cannot connect to unknown device ${PeerAddress(address)}`);
        }

        if (!this.#channels.hasChannel(address)) {
            if (isGroupNode) {
                await this.#createGroupChannel(address);
                return;
            }

            const { promise: existingReconnectPromise } = this.#runningPeerReconnections.get(address) ?? {};
            if (existingReconnectPromise !== undefined) {
                return existingReconnectPromise;
            }

            const { promise, resolver, rejecter } = createPromise<MessageChannel>();
            this.#runningPeerReconnections.set(address, { promise, rejecter });

            this.#resume(address, options, operationalAddress)
                .then(channel => {
                    this.#runningPeerReconnections.delete(address);
                    resolver(channel);
                })
                .catch(error => {
                    this.#runningPeerReconnections.delete(address);
                    rejecter(error);
                });

            return promise;
        }
    }

    /**
     * Obtain an exchange provider for the designated peer.
     * TODO enhance PeerConnectionOptions.discoveryOptions.discoveryData with "addresses" for known operational addresses
     */
    async exchangeProviderFor(addressOrChannel: PeerAddress | MessageChannel, options: PeerConnectionOptions = {}) {
        if (addressOrChannel instanceof MessageChannel) {
            return new DedicatedChannelExchangeProvider(this.#exchanges, addressOrChannel);
        }
        const address: PeerAddress = addressOrChannel;
        if (PeerAddress.isGroup(address)) {
            if (!this.#channels.hasChannel(address)) {
                // Ensure that we have a group channel
                await this.#createGroupChannel(address);
            }
            return new DedicatedChannelExchangeProvider(this.#exchanges, this.#channels.getChannel(address));
        }
        let initiallyConnected = this.#channels.hasChannel(address);
        return new ReconnectableExchangeProvider(this.#exchanges, this.#channels, address, async () => {
            const { caseAuthenticatedTags, discoveryOptions } = options;

            if (!initiallyConnected && !this.#channels.hasChannel(address)) {
                // We got an uninitialized node, so do the first connection as usual
                await this.#ensureConnection(address, {
                    discoveryOptions: { discoveryType: NodeDiscoveryType.None },
                    caseAuthenticatedTags,
                });
                initiallyConnected = true; // We only do this connection once, rest is handled in following code
                if (this.#channels.hasChannel(address)) {
                    return;
                }
            }

            if (!this.#channels.hasChannel(address)) {
                throw new RetransmissionLimitReachedError(`Device ${PeerAddress(address)} is currently not reachable.`);
            }
            await this.#channels.removeAllNodeChannels(address);

            // Enrich discoveryData with data from the node store when not provided
            const { discoveryData } = discoveryOptions ?? {
                discoveryData: this.#peersByAddress.get(address)?.descriptor.discoveryData,
            };
            // Try to use first result for one last try before we need to reconnect
            const operationalAddress = this.#knownOperationalAddressFor(address, true);
            if (operationalAddress === undefined) {
                logger.info(
                    `Re-discovering device failed (no address found), remove all sessions for ${PeerAddress(address)}`,
                );
                // We remove all sessions, this also informs the PairedNode class
                await this.#sessions.removeAllSessionsForNode(address);
                throw new RetransmissionLimitReachedError(`No operational address found for ${PeerAddress(address)}`);
            }
            if (
                (await this.#reconnectKnownAddress(address, operationalAddress, discoveryData, {
                    expectedProcessingTime: Seconds(2),
                })) === undefined
            ) {
                throw new RetransmissionLimitReachedError(`${PeerAddress(address)} is not reachable.`);
            }
        });
    }

    /**
     * Retrieve a peer by address.
     */
    get(peer: PeerAddress | PeerDescriptor) {
        if ("address" in peer) {
            return this.#peersByAddress.get(peer.address);
        }
        return this.#peersByAddress.get(peer);
    }

    /**
     * Terminate any active peer connection.
     * Also handles unknown peers
     */
    async disconnect(peer: PeerAddress | PeerDescriptor, sendSessionClose = true) {
        let address = this.get(peer)?.address; // Check known Peers
        if (address === undefined) {
            // We did not find a ClientNode for this peer, so check if it is a PeerAddress
            if ("nodeId" in peer && "fabricIndex" in peer) {
                address = peer;
            } else {
                return;
            }
        }

        await this.#sessions.removeAllSessionsForNode(address, sendSessionClose);
        await this.#channels.removeAllNodeChannels(address);
        await this.#disconnected.emit(address);
    }

    /**
     * Forget a known peer.
     */
    async delete(peer: PeerAddress | PeerDescriptor) {
        const actual = this.get(peer);
        if (actual === undefined) {
            return;
        }

        const { address } = actual;
        logger.info(`Removing ${address}`);
        this.#peers.delete(actual);
        await this.#store.deletePeer(address);
        await this.disconnect(address, false);
        await this.#sessions.deleteResumptionRecord(address);
    }

    async close() {
        for (const [address, { stopTimerFunc, mdnsClient: mdnsScanner }] of this.#runningPeerDiscoveries.entries()) {
            stopTimerFunc?.();

            // This ends discovery without triggering promises
            mdnsScanner?.cancelOperationalDeviceDiscovery(this.#sessions.fabricFor(address), address.nodeId, false);
        }

        for (const { address } of this.#peers) {
            await this.disconnect(address, false);
        }

        this.#interactionQueue.close();
        this.#runningPeerReconnections.forEach(({ rejecter }) =>
            rejecter(new ChannelNotConnectedError("PeerSet closed")),
        );
        this.#runningPeerReconnections.clear();
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
                this.#peersByAddress.has(address) &&
                tryOperationalAddress === undefined
            ) {
                logger.info(`Resume failed, remove all sessions for ${PeerAddress(address)}`);
                // We remove all sessions, this also informs the PairedNode class
                await this.#sessions.removeAllSessionsForNode(address);
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
                discoveryData = this.#peersByAddress.get(address)?.descriptor.discoveryData,
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

        const existingDiscoveryDetails = this.#runningPeerDiscoveries.get(address) ?? {
            type: NodeDiscoveryType.None,
        };

        // If we currently run another "lower" retransmission type we cancel it
        if (
            existingDiscoveryDetails.type !== NodeDiscoveryType.None &&
            existingDiscoveryDetails.type < requestedDiscoveryType
        ) {
            mdnsScanner.cancelOperationalDeviceDiscovery(this.#sessions.fabricFor(address), address.nodeId);
            this.#runningPeerDiscoveries.delete(address);
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

        const discoveryPromises = new Array<() => Promise<MessageChannel>>();
        let reconnectionPollingTimer: Timer | undefined;
        let stopTimerFunc: (() => void) | undefined;

        const lastOperationalAddress = this.#getLastOperationalAddress(address);
        if (lastOperationalAddress !== undefined) {
            // Additionally to general discovery we also try to poll the formerly known operational address
            if (requestedDiscoveryType === NodeDiscoveryType.FullDiscovery) {
                const { promise, resolver, rejecter } = createPromise<MessageChannel>();

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
                                this.#runningPeerDiscoveries.delete(address);
                                resolver(result);
                            }
                        } catch (error) {
                            if (reconnectionPollingTimer?.isRunning) {
                                reconnectionPollingTimer?.stop();
                                mdnsScanner.cancelOperationalDeviceDiscovery(
                                    this.#sessions.fabricFor(address),
                                    address.nodeId,
                                );
                                this.#runningPeerDiscoveries.delete(address);
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
            const { stopTimerFunc } = this.#runningPeerDiscoveries.get(address) ?? {};
            stopTimerFunc?.();
            this.#runningPeerDiscoveries.delete(address);

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

        this.#runningPeerDiscoveries.set(address, {
            type: requestedDiscoveryType,
            promises: discoveryPromises,
            stopTimerFunc,
            mdnsClient: mdnsScanner,
        });

        return await anyPromise(discoveryPromises).finally(() => {
            this.#runningPeerDiscoveries.delete(address);
        });
    }

    async #reconnectKnownAddress(
        address: PeerAddress,
        operationalAddress: ServerAddressUdp,
        discoveryData?: DiscoveryData,
        options?: CaseClient.PairOptions,
    ): Promise<MessageChannel | undefined> {
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
            const channel = await this.#pair(address, operationalAddress, discoveryData, options);
            await this.#addOrUpdatePeer(address, operationalAddress);
            return channel;
        } catch (error) {
            if (error instanceof NoResponseTimeoutError) {
                logger.debug(
                    `Failed to resume connection to ${address} connection with ${ip}:${port}, discovering the node now:`,
                    error.message ? error.message : error,
                );
                // We remove all sessions, this also informs the PairedNode class
                await this.#sessions.removeAllSessionsForNode(address, false, startTime);
                return undefined;
            } else {
                throw error;
            }
        }
    }

    async #createGroupChannel(address: PeerAddress) {
        const groupId = GroupId.fromNodeId(address.nodeId);
        GroupId.assertGroupId(groupId);
        const multicastAddress = this.#sessions.fabricFor(address).groups.multicastAddressFor(groupId);

        const operationalInterface = this.#transports.interfaceFor(ChannelType.UDP, multicastAddress);
        if (operationalInterface === undefined) {
            throw new PairRetransmissionLimitReachedError(`IPv6 interface not initialized`);
        }
        const operationalChannel = await operationalInterface.openChannel({
            type: ChannelType.UDP,
            ip: multicastAddress,
            port: STANDARD_MATTER_PORT,
        });

        const session = this.#sessions.groupSessionForAddress(address);
        const channel = new MessageChannel(operationalChannel, session);
        await this.#channels.setChannel(address, channel);
        return channel;
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
        const unsecureSession = this.#sessions.createInsecureSession({
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
            const operationalSecureSession = await this.#doCasePair(
                new MessageChannel(operationalChannel, unsecureSession),
                address,
                options,
            );

            const channel = new MessageChannel(operationalChannel, operationalSecureSession);
            await this.#channels.setChannel(address, channel);
            return channel;
        } catch (error) {
            NoResponseTimeoutError.accept(error);

            // Convert error
            throw new PairRetransmissionLimitReachedError(error.message);
        } finally {
            await unsecureSession.destroy();
        }
    }

    async #doCasePair(
        unsecureMessageChannel: MessageChannel,
        address: PeerAddress,
        options?: CaseClient.PairOptions,
    ): Promise<SecureSession> {
        const fabric = this.#sessions.fabricFor(address);
        let exchange: MessageExchange | undefined;
        try {
            exchange = this.#exchanges.initiateExchangeWithChannel(unsecureMessageChannel, SECURE_CHANNEL_PROTOCOL_ID);

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
                    return await this.#doCasePair(unsecureMessageChannel, address, options);
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
        let peer = this.#peersByAddress.get(address);
        if (peer === undefined) {
            peer = new Peer({ address, dataStore: await this.#store.createNodeStore(address) });
            this.#peers.add(peer);
        }
        peer.descriptor.operationalAddress = operationalServerAddress ?? peer.descriptor.operationalAddress;
        if (discoveryData !== undefined) {
            peer.descriptor.discoveryData = {
                ...peer.descriptor.discoveryData,
                ...discoveryData,
            };
        }
        await this.#store.updatePeer(peer.descriptor);

        // If we got a new channel and have a running discovery we can end it
        if (peer.descriptor.operationalAddress !== undefined && this.#runningPeerDiscoveries.has(address)) {
            logger.info(`Found ${address} during discovery, cancel discovery.`);
            // We are currently discovering this node, so we need to update the discovery data
            const { mdnsClient: mdnsScanner } = this.#runningPeerDiscoveries.get(address) ?? {};

            // This ends discovery and triggers the promises
            mdnsScanner?.cancelOperationalDeviceDiscovery(this.#sessions.fabricFor(address), address.nodeId, true);
        }
    }

    addKnownPeer(address: PeerAddress, operationalServerAddress?: ServerAddressUdp, discoveryData?: DiscoveryData) {
        return this.#addOrUpdatePeer(address, operationalServerAddress, discoveryData);
    }

    #getLastOperationalAddress(address: PeerAddress) {
        return this.#peersByAddress.get(address)?.descriptor.operationalAddress;
    }

    #handleFirstRetry(session: Session) {
        if (!session.isSecure || (session as SecureSession).fabric === undefined) {
            // For insecure sessions from CASE/PASE or not yet fabric bound session establishments we do not need to do anything
            return;
        }
        const { associatedFabric: fabric, peerNodeId: nodeId } = session;
        if (fabric === undefined || nodeId === undefined) {
            return;
        }
        const address = fabric.addressOf(nodeId);
        if (this.#runningPeerDiscoveries.has(address)) {
            // We already discover for this node, so we do not need to start a new discovery
            return;
        }
        this.#runningPeerDiscoveries.set(address, { type: NodeDiscoveryType.RetransmissionDiscovery });
        this.#scanners
            .scannerFor(ChannelType.UDP)
            ?.findOperationalDevice(fabric, nodeId, RETRANSMISSION_DISCOVERY_TIMEOUT, true)
            .catch(error => {
                logger.error(`Failed to discover ${address} after resubmission started.`, error);
            })
            .finally(() => {
                if (this.#runningPeerDiscoveries.get(address)?.type === NodeDiscoveryType.RetransmissionDiscovery) {
                    this.#runningPeerDiscoveries.delete(address);
                }
            });
    }
}
