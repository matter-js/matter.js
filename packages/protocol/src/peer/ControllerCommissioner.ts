/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { BleChannel, BleChannelClosedError } from "#ble/Ble.js";
import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { CommissionableDevice, DiscoveryData, DiscoveryDataDiagnostics } from "#common/Scanner.js";
import { Fabric } from "#fabric/Fabric.js";
import { CommissioningConnection } from "#peer/CommissioningConnection.js";
import { CommissioningError, PairRetransmissionLimitReachedError } from "#peer/CommissioningError.js";
import {
    ControllerCommissioningFlow,
    ControllerCommissioningFlowOptions,
    NodeIdConflictError,
} from "#peer/ControllerCommissioningFlow.js";
import { SessionClosedError } from "#protocol/errors.js";
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
} from "@matter/general";
import { NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { PeerAddress } from "./PeerAddress.js";
import { CommissioningTransitionError, PeerCommunicationError } from "./PeerCommunicationError.js";
import { PeerSet } from "./PeerSet.js";
import { PeerTimingParameters } from "./PeerTimingParameters.js";

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

    /**
     * Timing overrides for the step-18 CASE reconnect.
     *
     * After commissioning completes, the commissioner establishes the first operational CASE session.  The device is
     * known to be freshly online at this point, so tighter timing is appropriate.  Any fields provided here are merged
     * on top of the global {@link PeerSet.timing} for that single connection only.
     */
    caseConnectionTiming?: Partial<PeerTimingParameters>;
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
 * Options for establishing a PASE session with a device whose address(es) are already known.
 *
 * Use this when you have at least one address for the device (from a prior discovery, a QR code, or a
 * pre-configured address).  For pure mDNS/BLE discovery without known addresses, use {@link PaseDiscovery}.
 */
export interface EstablishPaseOptions {
    /** One or more addresses at which the device may be reached. All are tried in parallel. */
    addresses: ServerAddress[];

    /** Discovery metadata associated with the device (used for logging and passed through to the caller). */
    discoveryData?: DiscoveryData;

    /** PASE passcode for the device. */
    passcode: number;

    /** Overall timeout for PASE establishment across all addresses. Defaults to 30 seconds. */
    timeout?: Duration;

    /** External abort signal that, when fired, cancels all in-flight PASE attempts. */
    abort?: AbortSignal;

    /**
     * Atomic gate for parallel PASE racing.
     *
     * Called immediately after PASE is established (before any further work).  Return `true` to claim this
     * PASE session as the winner.  Return `false` if another candidate already won — this session is closed
     * cleanly without proceeding.
     *
     * When omitted, the first successful PASE session is always accepted.
     */
    continueAfterPase?: () => boolean;
}

/** Result returned by {@link ControllerCommissioner.establishPase}. */
export interface EstablishPaseResult {
    paseSession: NodeSession;
    discoveryData?: DiscoveryData;
}

/**
 * Interfaces {@link ControllerCommissioner} with other components.
 */
export interface ControllerCommissionerContext {
    peers: PeerSet;
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
        this.#validateCommissioningOptions(options);

        // Each address becomes an independent candidate so that a credential failure on one does not
        // cancel attempts on others.  UDP is prioritised within the sorted list.
        const addressCandidates = this.#addressesToCandidates(addresses, discoveryData);

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
     * Establishes a PASE session with a known device without running a commissioning flow.
     *
     * All provided addresses are tried in parallel.  The first to complete PASE wins; the rest are cancelled
     * via an abort signal.  A credential failure (wrong passcode) on any address immediately cancels all
     * other in-flight attempts for this device.
     */
    async establishPase(options: EstablishPaseOptions): Promise<EstablishPaseResult> {
        const { addresses, discoveryData, passcode, timeout = Seconds(30), abort, continueAfterPase } = options;

        const candidates = this.#addressesToCandidates(addresses, discoveryData);

        const { session } = await this.#establishPaseFromCandidates({
            devices: candidates,
            timeout,
            passcode,
            retryFailureAsPeerCommunication: "Could not connect to device",
            abort,
        });

        // Check with the caller whether to proceed with this session.  In parallel PASE scenarios this callback
        // atomically determines the winner: the first call returns true; any subsequent call returns false and
        // we clean up this session cleanly.
        if (continueAfterPase !== undefined && !continueAfterPase()) {
            await session.initiateForceClose({
                cause: new CommissioningError("PASE established but another candidate already won"),
            });
            throw new CommissioningError("PASE cancelled: another candidate was already selected");
        }

        return { paseSession: session, discoveryData };
    }

    async #establishPaseFromCandidates(options: {
        devices: CommissionableDevice[];
        timeout: Duration;
        passcode: number;
        retryFailureAsPeerCommunication?: string;
        abort?: AbortSignal;
    }) {
        try {
            return await CommissioningConnection({
                devices: options.devices,
                timeout: options.timeout,
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
            logger.info(`Establish PASE to device`, DiscoveryDataDiagnostics(device));
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

    #validateCommissioningOptions(options: Partial<ControllerCommissioningFlowOptions>) {
        if (options.threadNetwork !== undefined) {
            const { operationalDataset } = options.threadNetwork;
            if (operationalDataset.length === 0) {
                throw new CommissioningError("Thread operational dataset must not be empty");
            }
            if (operationalDataset.length % 2 !== 0) {
                throw new CommissioningError("Thread operational dataset must have an even number of hex characters");
            }
            if (!/^[0-9a-fA-F]+$/.test(operationalDataset)) {
                throw new CommissioningError(
                    "Thread operational dataset must only contain valid hexadecimal characters",
                );
            }
        }

        if (options.wifiNetwork !== undefined) {
            const { wifiSsid } = options.wifiNetwork;
            if (wifiSsid.length === 0) {
                throw new CommissioningError("Wi-Fi SSID must not be empty");
            }
        }
    }

    /**
     * Maps addresses to synthetic {@link CommissionableDevice} candidates for use with
     * {@link CommissioningConnection}.  Each address becomes its own candidate so a credential failure on one
     * does not cancel attempts on others.  UDP is partitioned ahead of BLE, preserving input order within each
     * group — the caller's {@link ServerAddressSet.compareDesirability} ranking is load-bearing.
     */
    #addressesToCandidates(addresses: ServerAddress[], discoveryData?: DiscoveryData): CommissionableDevice[] {
        const udps = new Array<ServerAddress>();
        const others = new Array<ServerAddress>();
        for (const address of addresses) {
            (address.type === "udp" ? udps : others).push(address);
        }

        return [...udps, ...others].map((address, index) => ({
            ...(discoveryData ?? {}),
            addresses: [address],
            deviceIdentifier: `known-address-${index}-${ServerAddress.urlFor(address)}`,
            D: 0,
            CM: 1,
        }));
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
            caseConnectionTiming,
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

        // BLE-only: BTP MRP retrans blocks pending invokes for ~45s when a non-concurrent device
        // drops BLE after connectNetwork.  Force-close on BLE-lost so the awaited invoke rejects
        // immediately and the commissioning flow can flip to the non-concurrent CASE path.
        if (!ephemeralSession.isClosed) {
            const paseChannel = ephemeralSession.channel.channel;
            if (paseChannel instanceof BleChannel) {
                paseChannel.closed.once(() => {
                    ephemeralSession
                        .initiateForceClose({
                            cause: new BleChannelClosedError(`BLE transport closed on ${ephemeralSession.via}`),
                        })
                        .catch(error => {
                            // Already-closed races with our force-close — the session shut down
                            // via another path, no action needed.  Anything else is a real bug.
                            if (error instanceof SessionClosedError) return;
                            logger.error("Error while force-closing PASE session on BLE close", error);
                        });
                });
            }
        }

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
                await peer.connect({
                    connectionTimeout: Minutes(4),
                    timing: caseConnectionTiming,

                    handleError: error => {
                        const csre = ChannelStatusResponseError.of(error);
                        if (csre?.protocolStatusCode === SecureChannelStatusCode.NoSharedTrustRoots) {
                            // During commissioning the device may not yet recognize the fabric; retry quickly
                            logger.warn("Peer reports no shared trust roots during commissioning, retrying quickly");
                            return Seconds(15);
                        }
                    },
                });

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
