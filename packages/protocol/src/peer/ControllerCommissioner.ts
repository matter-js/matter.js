/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { CommissionableDevice, CommissionableDeviceIdentifiers, DiscoveryData, ScannerSet } from "#common/Scanner.js";
import { Fabric } from "#fabric/Fabric.js";
import { MdnsClient } from "#mdns/MdnsClient.js";
import { CommissioningConnection } from "#peer/CommissioningConnection.js";
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
import {
    Abort,
    asError,
    Bytes,
    causedBy,
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
    MaybePromise,
    Millis,
    Minutes,
    NoResponseTimeoutError,
    Seconds,
    ServerAddress,
    UnexpectedDataError,
} from "@matter/general";
import {
    DiscoveryCapabilitiesBitmap,
    NodeId,
    SECURE_CHANNEL_PROTOCOL_ID,
    TypeFromPartialBitSchema,
} from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { PeerAddress } from "./PeerAddress.js";
import { CommissioningTransitionError, PeerCommunicationError } from "./PeerCommunicationError.js";
import { PeerSet } from "./PeerSet.js";

const logger = Logger.get("ControllerCommissioner");

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
    finalizeCommissioning?: (peerAddress: PeerAddress, discoveryData?: DiscoveryData) => MaybePromise<void>;

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

    /**
     * Overall wall-clock budget for PASE establishment across all candidate addresses.
     * Defaults to 30 seconds.
     */
    timeout?: Duration;

    /**
     * Abort signal for cancellation.  When fired during PASE establishment, cancels the attempt.
     * In parallel commissioning scenarios this is used to cancel other candidates once one wins.
     */
    abort?: AbortSignal;

    /**
     * Called immediately after PASE is established, before the main commissioning flow begins.
     *
     * Return `true` to proceed with commissioning (this candidate won the race).
     * Return `false` to abort — the PASE session is closed and commissioning is skipped.
     *
     * This is the hook used by {@link CommissioningDiscovery} for multi-candidate parallel flows:
     * the first candidate to establish PASE returns `true` and signals the others (via {@link abort})
     * to stop.  Any candidate that establishes PASE after another has already won returns `false` here
     * and cleans up.  In the single-device located-node path this callback is unnecessary and need not
     * be provided.
     */
    continueCommissioningAfterPase?: () => boolean;
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
        const {
            passcode,
            addresses,
            discoveryData,
            fabric,
            nodeId,
            abort,
            continueCommissioningAfterPase,
            timeout = Seconds(30),
        } = options;

        this.#assertRequestedNodeIdAvailable(fabric, nodeId);

        // Prioritize UDP
        const sortedAddresses = [...addresses].sort((a, b) => (a.type === "udp" ? -1 : b.type === "udp" ? 1 : 0));

        // For known-address commissioning we still run candidate selection over all provided addresses in
        // parallel.  Each address is modelled as an independent candidate with a unique synthetic identifier
        // so that a credential failure on one address does not cancel attempts on others — in mixed-address
        // scenarios this is the correct behaviour.  In the single-device case all addresses will fail with
        // the same credential error, but none is short-circuited based on a sibling's failure.
        const addressCandidates = sortedAddresses.map((address, index) => ({
            ...(discoveryData ?? {}),
            addresses: [address],
            deviceIdentifier: `known-address-${index}-${ServerAddress.urlFor(address)}`,
            D: 0,
            CM: 1,
        }));

        const { session } = await this.#establishPaseFromCandidates({
            devices: addressCandidates,
            timeout,
            passcode,
            retryFailureAsPeerCommunication: "Could not connect to device",
            abort,
        });

        // Check with the caller whether to proceed.  In parallel commissioning this callback atomically
        // determines the winner: the first call returns true (and fires the abort signal to stop others);
        // any subsequent call from a later PASE returns false and we clean up this session.
        if (continueCommissioningAfterPase !== undefined && !continueCommissioningAfterPase()) {
            await session.initiateForceClose({
                cause: new CommissioningError("PASE established but other device connected faster"),
            });
            throw new CommissioningError("Commissioning cancelled: another device was already successfully connected");
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
        let session: NodeSession | undefined;
        let discoveryData: DiscoveryData | undefined;

        // If we have a last known address, try this first
        if (knownAddress !== undefined) {
            try {
                session = await this.#establishEphemeralNodeSession(knownAddress, passcode);
            } catch (error) {
                // Intentional: swallow both timeout and unexpected-data errors on the known address so we fall
                // back to full discovery.  The "unexpected data" case handles stale/wrong known addresses that
                // point to a different device — the address is correct on the network but belongs to a device
                // with a different identity/passcode.  When the passcode itself is wrong, discovery will also
                // fail (just more slowly), but that is an acceptable trade-off for correctly handling the
                // stale-address scenario.
                if (!causedBy(error, UnexpectedDataError, NoResponseTimeoutError)) {
                    throw error;
                }
            }
        }
        if (session === undefined) {
            const discoveredDevices = await ControllerDiscovery.discoverDeviceAddressesByIdentifier(
                scannersToUse,
                identifierData,
                timeout,
            );
            const { session: connectedSession, discoveryData: winningDevice } = await this.#establishPaseFromCandidates(
                {
                    devices: discoveredDevices,
                    timeout,
                    discoveredDevices: async () =>
                        scannersToUse.flatMap(scanner => scanner.getDiscoveredCommissionableDevices(identifierData)),
                    passcode,
                },
            );
            session = connectedSession;
            discoveryData = winningDevice;
        }

        return { paseSession: session, discoveryData };
    }

    async #establishPaseFromCandidates(options: {
        devices: CommissionableDevice[];
        timeout: Duration;
        discoveredDevices?: () => Promise<CommissionableDevice[]>;
        passcode: number;
        retryFailureAsPeerCommunication?: string;
        abort?: AbortSignal;
    }) {
        try {
            return await CommissioningConnection({
                devices: options.devices,
                timeout: options.timeout,
                discoveredDevices: options.discoveredDevices,
                externalAbort: options.abort,
                establishSession: (address, device, signal) =>
                    this.#establishEphemeralNodeSession(address, options.passcode, device, signal),
            });
        } catch (error) {
            if (
                options.retryFailureAsPeerCommunication !== undefined &&
                causedBy(error, PairRetransmissionLimitReachedError)
            ) {
                throw new PeerCommunicationError(options.retryFailureAsPeerCommunication);
            }
            throw error;
        }
    }

    /**
     * Method to start commission process with a PASE pairing.
     * If this not successful and throws an RetransmissionLimitReachedError the address is invalid or the passcode
     * is wrong.
     */
    async #establishEphemeralNodeSession(
        address: ServerAddress,
        passcode: number,
        device?: DiscoveryData,
        signal?: AbortSignal,
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
                paseChannel = await Abort.attempt(signal, paseInterface.openChannel(address));
                break;

            case "ble":
                const ble = this.#context.transports.interfaceFor(ChannelType.BLE);
                if (!ble) {
                    throw new PairRetransmissionLimitReachedError(
                        `BLE interface not initialized. Cannot use ${address.peripheralAddress} for commissioning.`,
                    );
                }
                paseChannel = await Abort.attempt(signal, ble.openChannel(address));
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
                { abort: signal },
            );
            unsecuredSession.detachChannel();
            return caseSession;
        } catch (e) {
            // Close the exchange and rethrow
            if (causedBy(e, ChannelStatusResponseError)) {
                throw new NoResponseTimeoutError(
                    `Establishing PASE channel failed with channel status response error ${asError(e).message}`,
                );
            }
            throw e;
        } finally {
            await unsecuredSession.initiateForceClose({
                cause: new CommissioningTransitionError("PASE session has transitioned to CASE"),
            });
        }
    }

    /** Validate if a Peer Address is already known and commissioned */
    #assertPeerAddress(address: PeerAddress) {
        if (this.#context.peers.has(address)) {
            throw new NodeIdConflictError(`Node ID ${address.nodeId} is already commissioned and can not be reused`);
        }
    }

    #assertRequestedNodeIdAvailable(fabric: Fabric, nodeId?: NodeId) {
        if (nodeId !== undefined) {
            this.#assertPeerAddress(fabric.addressOf(nodeId));
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
        ephemeralSession: NodeSession,
        options: CommissioningOptions,
        discoveryData?: DiscoveryData,
    ): Promise<PeerAddress> {
        const {
            fabric,
            finalizeCommissioning: performCaseCommissioning,
            commissioningFlowImpl = ControllerCommissioningFlow,
        } = options;

        const commissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.Outdoor, // Most restrictive default if not specified
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
        discoveryData.SII = ephemeralSession.parameters.idleInterval;
        discoveryData.SAI = ephemeralSession.parameters.activeInterval;
        discoveryData.SAT = ephemeralSession.parameters.activeThreshold;

        const address = this.#determineAddress(fabric, commissioningOptions.nodeId);
        logger.info(`Start commissioning of node ${address.toString()} into fabric ${fabric.fabricId}`);
        const exchangeProvider = new DedicatedChannelExchangeProvider(this.#context.exchanges, ephemeralSession);

        await using commissioner = new commissioningFlowImpl(
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
                    // We've reconnected using CASE so close the ephemeral node ID session
                    await ephemeralSession.initiateForceClose({
                        cause: new CommissioningTransitionError(
                            "Commissioning session closed because node has now joined fabric",
                        ),
                    });
                }

                if (performCaseCommissioning !== undefined) {
                    await performCaseCommissioning(address, discoveryData);
                    return;
                }

                const peer = this.#context.peers.for(address);
                peer.descriptor.discoveryData = discoveryData;
                await peer.connect({ connectionTimeout: Minutes(4) });

                return new ClientInteraction({
                    environment: this.#context.environment,
                    exchangeProvider: peer.exchangeProvider,
                    address,
                });
            },
        );

        try {
            await commissioner.executeCommissioning();
        } catch (error) {
            // We might have added data for an operational address that we need to cleanup
            await this.#context.peers.get(address)?.delete();
            throw error;
        } finally {
            commissioner.close();
            /*
                In concurrent connection commissioning flow the commissioning channel SHALL terminate after
                successful step 15 (CommissioningComplete command invocation).
            */
            // If the ephemeral session is not already closed, we are in concurrent connection commissioning flow.
            // Close it now
            await ephemeralSession.initiateForceClose({
                cause: new CommissioningTransitionError(
                    "Commissioning session closed because node has now joined fabric",
                ),
            });
        }

        return address;
    }
}
