/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { GeneralCommissioning } from "#clusters/general-commissioning";
import { CommissionableDevice, CommissionableDeviceIdentifiers, DiscoveryData, ScannerSet } from "#common/Scanner.js";
import { Fabric } from "#fabric/Fabric.js";
import {
    Bytes,
    Channel,
    ChannelType,
    ClassExtends,
    ConnectionlessTransportSet,
    Diagnostic,
    Duration,
    Environment,
    Environmental,
    ImplementationError,
    isIPv6,
    Logger,
    Millis,
    Minutes,
    NoResponseTimeoutError,
    Seconds,
    ServerAddress,
} from "#general";
import { MdnsClient } from "#mdns/MdnsClient.js";
import { CommissioningError } from "#peer/CommissioningError.js";
import {
    ControllerCommissioningFlow,
    ControllerCommissioningFlowOptions,
    NodeIdConflictError,
} from "#peer/ControllerCommissioningFlow.js";
import { ControllerDiscovery, PairRetransmissionLimitReachedError } from "#peer/ControllerDiscovery.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { DedicatedChannelExchangeProvider } from "#protocol/ExchangeProvider.js";
import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { NodeSession } from "#session/NodeSession.js";
import { PaseClient } from "#session/pase/PaseClient.js";
import { SessionManager } from "#session/SessionManager.js";
import { DiscoveryCapabilitiesBitmap, NodeId, SECURE_CHANNEL_PROTOCOL_ID, TypeFromPartialBitSchema } from "#types";
import { PeerAddress } from "./PeerAddress.js";
import { NodeDiscoveryType, PeerSet } from "./PeerSet.js";

const logger = Logger.get("PeerCommissioner");

/**
 * General commissioning options.
 */
export interface CommissioningOptions extends Partial<ControllerCommissioningFlowOptions> {
    /** The fabric into which to commission. */
    fabric: Fabric;

    /** The node ID to assign (the commissioner assigns a random node ID if omitted) */
    nodeId?: NodeId;

    /** Passcode to use for commissioning. */
    passcode: number;

    /**
     * Commissioning completion callback
     *
     * This optional callback allows the caller to complete commissioning once PASE commissioning completes.  If it does
     * not throw, the commissioner considers commissioning complete.
     */
    finalizeCommissioning?: (peerAddress: PeerAddress, discoveryData?: DiscoveryData) => Promise<void>;

    /**
     * Commissioning Flow Implementation as class that extends the official implementation to use for commissioning.
     * Defaults to the matter.js default implementation {@link ControllerCommissioningFlow}.
     */
    commissioningFlowImpl?: ClassExtends<ControllerCommissioningFlow>;
}

/**
 * Configuration for commissioning a previously discovered node.
 */
export interface LocatedNodeCommissioningOptions extends CommissioningOptions {
    addresses: ServerAddress[];
    discoveryData?: DiscoveryData;
}

/**
 * Configuration for performing discovery + commissioning in one step.
 */
export interface DiscoveryAndCommissioningOptions extends CommissioningOptions {
    /** Discovery related options. */
    discovery: (
        | {
              /**
               * Device identifiers (Short or Long Discriminator, Product/Vendor-Ids, Device-type or a pre-discovered
               * instance Id, or "nothing" to discover all commissionable matter devices) to use for discovery.
               * If the property commissionableDevice is provided this property is ignored.
               */
              identifierData: CommissionableDeviceIdentifiers;
          }
        | {
              /**
               * Commissionable device object returned by a discovery run.
               * If this property is provided then identifierData and knownAddress are ignored.
               */
              commissionableDevice: CommissionableDevice;
          }
    ) & {
        /**
         * Discovery capabilities to use for discovery. These are included in the QR code normally and defined if BLE
         * is supported for initial commissioning.
         */
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>;

        /**
         * Known address of the device to use for discovery. if this is set this will be tried first before discovering
         * the device.
         */
        knownAddress?: ServerAddress;

        /** Timeout in seconds for the discovery process. Default: 30 seconds */
        timeout?: Duration;
    };
}

/**
 * Interfaces {@link ControllerCommissioner} with other components.
 */
export interface ControllerCommissionerContext {
    peers: PeerSet;
    scanners: ScannerSet;
    transports: ConnectionlessTransportSet;
    sessions: SessionManager;
    exchanges: ExchangeManager;
    ca: CertificateAuthority;
    environment: Environment;
}

/**
 * Commissions other nodes onto a fabric.
 */
export class ControllerCommissioner {
    #context: ControllerCommissionerContext;
    #paseClient: PaseClient;

    constructor(context: ControllerCommissionerContext) {
        this.#context = context;
        this.#paseClient = new PaseClient(context.sessions);
    }

    static [Environmental.create](env: Environment) {
        const instance = new ControllerCommissioner({
            peers: env.get(PeerSet),
            scanners: env.get(ScannerSet),
            transports: env.get(ConnectionlessTransportSet),
            sessions: env.get(SessionManager),
            exchanges: env.get(ExchangeManager),
            ca: env.get(CertificateAuthority),
            environment: env,
        });
        env.set(ControllerCommissioner, instance);
        return instance;
    }

    /**
     * Commission a previously discovered node.
     */
    async commission(options: LocatedNodeCommissioningOptions): Promise<PeerAddress> {
        const { passcode, addresses, discoveryData, fabric, nodeId } = options;

        // If a NodeId is set verify that this nodeId is not already used
        if (nodeId !== undefined) {
            this.#assertPeerAddress(fabric.addressOf(nodeId));
        }

        // Prioritize UDP
        addresses.sort(a => (a.type === "udp" ? -1 : 1));

        // Attempt a connection on each known address
        let session: NodeSession | undefined;
        for (const address of addresses) {
            try {
                session = await this.#initializePaseSecureChannel(address, passcode, discoveryData);
            } catch (e) {
                NoResponseTimeoutError.accept(e);
                logger.warn(`Could not connect to ${ServerAddress.urlFor(address)}: ${e.message}`);
            }
        }

        if (session === undefined) {
            throw new NoResponseTimeoutError("Could not connect to device");
        }

        return await this.#commissionConnectedNode(session, options, discoveryData);
    }

    /**
     * Discover and establish a PASE channel with a device.
     */
    async discoverAndEstablishPase(
        options: DiscoveryAndCommissioningOptions,
    ): Promise<{ paseSession: NodeSession; discoveryData?: DiscoveryData }> {
        const {
            discovery: { timeout = Seconds(30) },
            passcode,
        } = options;

        const commissionableDevice =
            "commissionableDevice" in options.discovery ? options.discovery.commissionableDevice : undefined;
        let {
            discovery: { discoveryCapabilities = {}, knownAddress },
        } = options;
        let identifierData = "identifierData" in options.discovery ? options.discovery.identifierData : {};

        if (
            this.#context.scanners.hasScannerFor(ChannelType.UDP) &&
            this.#context.transports.hasInterfaceFor(ChannelType.UDP, "::") !== undefined
        ) {
            discoveryCapabilities.onIpNetwork = true; // We always discover on network as defined by specs
        }
        if (commissionableDevice !== undefined) {
            let { addresses } = commissionableDevice;
            if (discoveryCapabilities.ble === true) {
                discoveryCapabilities = { onIpNetwork: true, ble: addresses.some(address => address.type === "ble") };
            } else if (discoveryCapabilities.onIpNetwork === true) {
                // do not use BLE if not specified, even if existing
                addresses = addresses.filter(address => address.type !== "ble");
            }
            addresses.sort(a => (a.type === "udp" ? -1 : 1)); // Sort addresses to use UDP first
            knownAddress = addresses[0];
            if ("instanceId" in commissionableDevice && commissionableDevice.instanceId !== undefined) {
                // it is an UDP discovery
                identifierData = { instanceId: commissionableDevice.instanceId as string };
            } else {
                identifierData = { longDiscriminator: commissionableDevice.D };
            }
        }

        const scannersToUse = this.#context.scanners.select(discoveryCapabilities);

        logger.info(
            `Connecting to device with identifier ${Diagnostic.json(identifierData)} and ${
                scannersToUse.length
            } scanners and knownAddress ${Diagnostic.json(knownAddress)}`,
        );

        // If we have a known address we try this first before we discover the device
        let paseSession: NodeSession | undefined;
        let discoveryData: DiscoveryData | undefined;

        // If we have a last known address, try this first
        if (knownAddress !== undefined) {
            try {
                paseSession = await this.#initializePaseSecureChannel(knownAddress, passcode);
            } catch (error) {
                NoResponseTimeoutError.accept(error);
            }
        }
        if (paseSession === undefined) {
            const discoveredDevices = await ControllerDiscovery.discoverDeviceAddressesByIdentifier(
                scannersToUse,
                identifierData,
                timeout,
            );

            const { result } = await ControllerDiscovery.iterateServerAddresses(
                discoveredDevices,
                NoResponseTimeoutError,
                async () =>
                    scannersToUse.flatMap(scanner => scanner.getDiscoveredCommissionableDevices(identifierData)),
                async (address, device) => {
                    const channel = await this.#initializePaseSecureChannel(address, passcode, device);
                    discoveryData = device;
                    return channel;
                },
            );

            // Pairing was successful, so store the address and assign the established secure channel
            paseSession = result;
        }

        return { paseSession, discoveryData };
    }

    /**
     * Commission a node with discovery.
     */
    async commissionWithDiscovery(options: DiscoveryAndCommissioningOptions): Promise<PeerAddress> {
        const { fabric, nodeId } = options;
        // If a NodeId is set verify that this nodeId is not already used
        if (nodeId !== undefined) {
            this.#assertPeerAddress(fabric.addressOf(nodeId));
        }

        // Establish PASE channel
        const { paseSession, discoveryData } = await this.discoverAndEstablishPase(options);

        // Commission the node
        return await this.#commissionConnectedNode(paseSession, options, discoveryData);
    }

    /**
     * Method to start commission process with a PASE pairing.
     * If this not successful and throws an RetransmissionLimitReachedError the address is invalid or the passcode
     * is wrong.
     */
    async #initializePaseSecureChannel(
        address: ServerAddress,
        passcode: number,
        device?: DiscoveryData,
    ): Promise<NodeSession> {
        let paseChannel: Channel<Bytes>;
        if (device !== undefined) {
            logger.info(`Establish PASE to device`, MdnsClient.discoveryDataDiagnostics(device));
        }

        switch (address.type) {
            case "udp":
                const { ip } = address;

                const isIpv6Address = isIPv6(ip);
                const paseInterface = this.#context.transports.interfaceFor(
                    ChannelType.UDP,
                    isIpv6Address ? "::" : "0.0.0.0",
                );
                if (paseInterface === undefined) {
                    // mainly IPv6 address when IPv4 is disabled
                    throw new PairRetransmissionLimitReachedError(
                        `IPv${isIpv6Address ? "6" : "4"} interface not initialized. Cannot use ${ip} for commissioning.`,
                    );
                }
                paseChannel = await paseInterface.openChannel(address);
                break;

            case "ble":
                const ble = this.#context.transports.interfaceFor(ChannelType.BLE);
                if (!ble) {
                    throw new PairRetransmissionLimitReachedError(
                        `BLE interface not initialized. Cannot use ${address.peripheralAddress} for commissioning.`,
                    );
                }
                // TODO Have a Timeout mechanism here for connections
                paseChannel = await ble.openChannel(address);
                break;

            default:
                throw new ImplementationError(
                    `Unsupported address type ${(address as ServerAddress).type} for Matter protocol`,
                );
        }

        // Do PASE pairing
        const unsecuredSession = this.#context.sessions.createUnsecuredSession({
            channel: paseChannel,
            // Use the session parameters from MDNS announcements when available and rest is assumed to be fallbacks
            sessionParameters: {
                idleInterval: Millis(device?.SII),
                activeInterval: Millis(device?.SAI),
                activeThreshold: Millis(device?.SAT),
            },
            isInitiator: true,
        });
        const paseExchange = this.#context.exchanges.initiateExchangeForSession(
            unsecuredSession,
            SECURE_CHANNEL_PROTOCOL_ID,
        );

        try {
            const caseSession = await this.#paseClient.pair(
                this.#context.sessions.sessionParameters,
                paseExchange,
                paseChannel,
                passcode,
            );
            unsecuredSession.detachChannel();
            return caseSession;
        } catch (e) {
            // Close the exchange and rethrow
            if (e instanceof ChannelStatusResponseError) {
                throw new NoResponseTimeoutError(
                    `Establishing PASE channel failed with channel status response error ${e.message}`,
                );
            }
            throw e;
        } finally {
            await unsecuredSession.initiateForceClose();
        }
    }

    /** Validate if a Peer Address is already known and commissioned */
    #assertPeerAddress(address: PeerAddress) {
        if (this.#context.peers.has(address)) {
            throw new NodeIdConflictError(`Node ID ${address.nodeId} is already commissioned and can not be reused.`);
        }
    }

    /** Finds an unused random Node-ID to use for commissioning if not already provided. */
    #determineAddress(fabric: Fabric, nodeId?: NodeId) {
        while (true) {
            const address = fabric.addressOf(nodeId ?? NodeId.randomOperationalNodeId(fabric.crypto));
            try {
                this.#assertPeerAddress(address);
            } catch (error) {
                if (error instanceof CommissioningError && nodeId !== undefined) {
                    throw error;
                }
                continue;
            }
            return address;
        }
    }

    /**
     * Method to commission a device with a PASE secure channel. It returns the NodeId of the commissioned device on
     * success.
     */
    async #commissionConnectedNode(
        paseSession: NodeSession,
        options: CommissioningOptions,
        discoveryData?: DiscoveryData,
    ): Promise<PeerAddress> {
        const {
            fabric,
            finalizeCommissioning: performCaseCommissioning,
            commissioningFlowImpl = ControllerCommissioningFlow,
        } = options;

        const commissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.Outdoor, // Set to the most restrictive if relevant
            regulatoryCountryCode: "XX",
            ...options,
        };

        // TODO: Create the fabric only when needed before commissioning (to do when refactoring MatterController away)
        // TODO also move certificateManager and other parts into that class to get rid of them here
        // TODO Depending on the Error type during commissioning we can do a retry ...
        /*
            Whenever the Fail-Safe timer is armed, Commissioners and Administrators SHALL NOT consider any cluster
            operation to have timed-out before waiting at least 30 seconds for a valid response from the cluster server.
            Some commands and attributes with complex side-effects MAY require longer and have specific timing requirements
            stated in their respective cluster specification.

            In concurrent connection commissioning flow, the failure of any of the steps 2 through 10 SHALL result in the
            Commissioner and Commissionee returning to step 2 (device discovery and commissioning channel establishment) and
            repeating each step. The failure of any of the steps 11 through 15 in concurrent connection commissioning flow
            SHALL result in the Commissioner and Commissionee returning to step 11 (configuration of operational network
            information). In the case of failure of any of the steps 11 through 15 in concurrent connection commissioning
            flow, the Commissioner and Commissionee SHALL reuse the existing PASE-derived encryption keys over the
            commissioning channel and all steps up to and including step 10 are considered to have been successfully
            completed.
            In non-concurrent connection commissioning flow, the failure of any of the steps 2 through 15 SHALL result in
            the Commissioner and Commissionee returning to step 2 (device discovery and commissioning channel establishment)
            and repeating each step.

            Commissioners that need to restart from step 2 MAY immediately expire the fail-safe by invoking the ArmFailSafe
            command with an ExpiryLengthSeconds field set to 0. Otherwise, Commissioners will need to wait until the current
            fail-safe timer has expired for the Commissionee to begin accepting PASE again.
            In both concurrent connection commissioning flow and non-concurrent connection commissioning flow, the
            Commissionee SHALL exit Commissioning Mode after 20 failed attempts.
         */

        // The pase session has actual negotiated parameters from the device. Use them over the discoveryData
        discoveryData = discoveryData ?? {};
        discoveryData.SII = paseSession.parameters.idleInterval;
        discoveryData.SAI = paseSession.parameters.activeInterval;
        discoveryData.SAT = paseSession.parameters.activeThreshold;

        const address = this.#determineAddress(fabric, commissioningOptions.nodeId);
        logger.info(
            `Start commissioning of node ${address.nodeId} into fabric ${fabric.fabricId} (index ${address.fabricIndex})`,
        );
        const exchangeProvider = new DedicatedChannelExchangeProvider(this.#context.exchanges, paseSession);
        const commissioningManager = new commissioningFlowImpl(
            // Use the created secure session to do the commissioning
            new ClientInteraction({
                environment: this.#context.environment,
                exchangeProvider,
                address,
            }),
            this.#context.ca,
            fabric,
            commissioningOptions,
            async (address, supportsConcurrentConnections) => {
                if (!supportsConcurrentConnections) {
                    /*
                        In non-concurrent connection
                        commissioning flow the commissioning channel SHALL terminate after successful step 12 (trigger
                        joining of operational network at Commissionee).
                     */
                    await paseSession.initiateClose(); // We reconnect using Case, so close PASE connection
                }

                if (performCaseCommissioning !== undefined) {
                    await performCaseCommissioning(address, discoveryData);
                    return;
                }

                // Look for the device broadcast over MDNS and do CASE pairing
                await this.#context.peers.connect(address, {
                    discoveryOptions: {
                        discoveryType: NodeDiscoveryType.TimedDiscovery,
                        timeout: Minutes(2),
                        discoveryData,
                    },
                }); // Wait maximum 120s to find the operational device for the commissioning process

                // And we use a ClientInteraction backed Interaction client to finish the commissioning because
                const exchangeProvider = await this.#context.peers.exchangeProviderFor(address);
                return new ClientInteraction({
                    environment: this.#context.environment,
                    exchangeProvider,
                    address,
                });
            },
        );

        try {
            await commissioningManager.executeCommissioning();
        } catch (error) {
            // We might have added data for an operational address that we need to cleanup
            await this.#context.peers.get(address)?.delete();
            throw error;
        } finally {
            commissioningManager.close();
            /*
                In concurrent connection commissioning flow the commissioning channel SHALL terminate after
                successful step 15 (CommissioningComplete command invocation).
                If PaseSecureMessageChannel is not already closed, we are in non-concurrent connection commissioning flow.
                */
            await paseSession.initiateClose(); // We are done, so close PASE session
        }

        return address;
    }
}
