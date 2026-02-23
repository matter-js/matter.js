/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from "#codec/MessageCodec.js";
import {
    Abort,
    AbortedError,
    asError,
    BasicMultiplex,
    Bytes,
    causedBy,
    Channel,
    Diagnostic,
    Duration,
    Heap,
    Lifetime,
    Logger,
    Millis,
    Observable,
    ServerAddress,
    ServerAddressSet,
    ServerAddressUdp,
    Time,
    Timestamp,
} from "#general";
import type { ExchangeManager } from "#protocol/ExchangeManager.js";
import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { CaseClient } from "#session/case/CaseClient.js";
import type { NodeSession } from "#session/NodeSession.js";
import type { Session } from "#session/Session.js";
import type { SessionManager } from "#session/SessionManager.js";
import { GeneralStatusCode, SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "#types";
import { NetworkProfiles } from "./NetworkProfile.js";
import type { Peer } from "./Peer.js";
import { TransientPeerCommunicationError } from "./PeerCommunicationError.js";
import { PeerTimingParameters } from "./PeerTimingParameters.js";

const logger = Logger.get("PeerConnection");

/**
 * Establishes a CASE session with a peer.
 *
 * Returns a session or undefined if aborted.
 *
 * Logic is as follows:
 *
 * - The last address we connected to is considered a "fallback" address
 *
 * - Other "discovered" addresses may be known via DNS-SD discovery
 *
 * - Discovery occurs via {@link Peer#service}; this is active if there are no discovered or connectable addresses and
 *   passive if there are discovered addresses
 *
 * - If there is a fallback address but no discovered addresses, either because discovery has not completed or because
 *   all discovered addresses have expired, we attempt to connect to the fallback address
 *
 * - If there are no discovered addresses, we trigger active solicitation of new addresses
 *
 * - If there are discovered addresses, attempts to connect to each discovered address in order of priority as defined
 *   by {@link ServerAddressSet.compareDesirability}, with a configurable delay between attempts
 *
 * - The connection to the fallback address aborts if the fallback address is not discovered
 *
 * - Attempts continue until the address expires or connects successfully
 *
 * - We configure MRP to run indefinitely for each attempt with a configurable max delay between messages
 *
 * - Starting a new attempt does not cancel previously running attempts; we thus rely on the MRP retransmission window
 *   to ensure we are sending a reasonable number of packets
 *
 * - Once a session is established, any outstanding attempts abort and the function returns
 *
 * - We use various hardcoded timeouts (see above) in response to exceptions during connection attempts.  The idea is to
 *   recover from transient errors without being too aggressive
 */
export async function PeerConnection(
    peer: Peer,
    context: PeerConnection.Context,
    options?: PeerConnection.Options,
): Promise<NodeSession | undefined> {
    const via = Diagnostic.via(peer.address.toString());

    using overallAbort = new Abort(options);
    using lifetime = (peer.lifetime ?? Lifetime.process).join("connecting");

    // Reserve network communication slot
    let network = context.networks.select(peer, options?.network);
    if (network.connect) {
        network = network.connect;
    }
    using _slot = await network.semaphore.obtainSlot(overallAbort);
    if (overallAbort.aborted) {
        return;
    }

    // Update peer status
    peer.service.status.connecting(overallAbort.then(() => !!peer.sessions.size));

    // DNS-SD name of peer service
    const service = peer.service;

    // Active connection attempts, keyed by address
    const attempts = new Map<ServerAddressUdp, Attempt>();

    // The result
    let outputSession: NodeSession | undefined;

    // Outstanding promises
    const workers = new BasicMultiplex();

    // Address set used for interning
    const addresses = ServerAddressSet<ServerAddressUdp>();

    // Addresses we will attempt to connect to in priority order
    const pendingAddresses = new Heap<ServerAddressUdp>(
        ServerAddressSet.compareDesirability,
        addresses.add.bind(addresses),
    );

    // When the service is undiscovered, we attempt to connect to the last-known good address and store it here
    let attemptingFallback: ServerAddressUdp | undefined;

    // Time of last attempt initiation, used to delay next initiation
    let lastAttemptAt: undefined | Timestamp;

    // Count of addresses we've tried
    let addrsAttempted = 0;

    // Exchange "kick" driver
    const kicker = options?.kicker;

    // Start the attempt scheduler
    workers.add(scheduleAttempts());

    // Enqueue the "fallback" address if the service is undiscovered
    maybeAttemptFallback();

    // Manage connection attempts until connected or aborted
    for await (const { kind, address } of service.addressChanges({ abort: overallAbort })) {
        switch (kind) {
            case "add":
                addAddress(address);
                break;

            case "delete":
                deleteAddress(address, "Aborting attempt because address is expired");
                maybeAttemptFallback();
                break;
        }
    }

    // Ensure peer is marked as reachable if we've established a connection
    if (outputSession) {
        peer.service.status.isReachable = true;
    }

    overallAbort();

    await workers;

    return outputSession;

    /**
     * Initiate connection attempts as we discover new addresses until aborted.
     */
    async function scheduleAttempts() {
        using scheduling = lifetime.join("scheduling");

        while (true) {
            // Wait for an address if none are available
            if (!pendingAddresses.size) {
                using _waiting = scheduling.join("waiting for address");
                await overallAbort.race(pendingAddresses.added);
            }
            if (overallAbort.aborted) {
                return;
            }

            // Delay if within the delay window of last initiation attempt
            if (lastAttemptAt !== undefined) {
                const timeSinceLastAttempt = Timestamp.delta(lastAttemptAt);
                const delayInterval = Millis(context.timing.delayBeforeNextAddress - timeSinceLastAttempt);
                if (delayInterval > 0) {
                    using _delaying = scheduling.join("delaying");

                    const changed = await overallAbort.race<ServerAddressUdp | void>(
                        Time.sleep("connection delay", delayInterval),
                        pendingAddresses.added,
                        pendingAddresses.deleted,
                    );
                    if (overallAbort.aborted) {
                        return;
                    }

                    // If there was an address change then restart the loop
                    if (changed !== undefined) {
                        continue;
                    }
                }
            }

            // Start next address
            const address = pendingAddresses.shift();
            if (address) {
                initiateAttempt(address);
            }
        }
    }

    /**
     * Enqueue an address if not already attempting.
     */
    function addAddress(address: ServerAddressUdp) {
        address = addresses.add(address);

        // Skip if we're already attempting connection to this address
        const attempt = attempts.get(address);
        if (attempt !== undefined) {
            if (attemptingFallback && ServerAddress.isEqual(attemptingFallback, address)) {
                // The "fallback" is now a "real" address
                attemptingFallback = undefined;
                kicker?.emit(); // ... and kick the MRP loop
            }

            return;
        }

        pendingAddresses.add(address);
    }

    /**
     * Attempt connection to fallback address if no other attempts are active
     */
    function maybeAttemptFallback() {
        if (attempts.size || pendingAddresses.size || service.addresses.size) {
            return;
        }

        attemptingFallback = peer.descriptor.operationalAddress;
        if (attemptingFallback) {
            pendingAddresses.add(attemptingFallback);
        }
    }

    /**
     * Begin connection attempt to specific address.  Continues until aborted.
     */
    function initiateAttempt(address: ServerAddressUdp) {
        address = addresses.add(address);

        // Skip if we're already attempting connection to this address
        if (attempts.has(address)) {
            return;
        }

        const addressAbort = new Abort({ abort: overallAbort });

        lastAttemptAt = Time.nowMs;

        const finished = connect(address, addressAbort).finally(() => {
            try {
                if (attempts.get(address)?.finished === finished) {
                    attempts.delete(address);
                    maybeAttemptFallback();
                }
            } finally {
                addressAbort.close();
            }
        });

        attempts.set(address, { abort: addressAbort, finished });

        workers.add(finished);
    }

    /**
     * End connection attempt.
     */
    function deleteAddress(address: ServerAddressUdp, why: string) {
        address = addresses.add(address);
        const attempt = attempts.get(address);

        if (attempt) {
            const operationalAddress = peer.descriptor.operationalAddress;
            if (
                attempts.size === 1 &&
                operationalAddress !== undefined &&
                ServerAddress.isEqual(operationalAddress, address)
            ) {
                // If we only have one attempt running and this is for the known operational address,
                // fall back to fallback mode and just keep it running
                attemptingFallback = address;
                return;
            }
            debug(via, address, why);
            attempt.abort();
            attempts.delete(address);
        }

        pendingAddresses.delete(address);
    }

    function error(address: ServerAddressUdp, ...message: unknown[]) {
        logger.error(logHeaderFor(address), ...message);
    }

    function warn(address: ServerAddressUdp, ...message: unknown[]) {
        logger.warn(logHeaderFor(address), ...message);
    }

    function info(address: ServerAddressUdp, ...message: unknown[]) {
        logger.info(logHeaderFor(address), ...message);
    }

    function debug(via: string, address: ServerAddressUdp, ...message: unknown[]) {
        logger.debug(logHeaderFor(address, via), ...message);
    }

    function logHeaderFor(address: ServerAddressUdp, localVia = via) {
        return [localVia, Diagnostic.strong(ServerAddress.urlFor(address))];
    }

    /**
     * Perform connection to specific address until successful.
     */
    async function connect(address: ServerAddressUdp, addressAbort: Abort) {
        const addrNo = ++addrsAttempted;
        let attemptNo = 1;

        using connecting = lifetime.join("attempt");
        connecting.details.address = ServerAddress.urlFor(address);

        // If this is not the fallback address but we're still attempting to connect to the fallback, it means that
        // we've discovered addresses that do not include the fallback; terminate the fallback attempt
        if (attemptingFallback && address !== attemptingFallback) {
            deleteAddress(
                attemptingFallback,
                "Aborting attempt to last known address because device reports address change",
            );
            attemptingFallback = undefined;
        }

        while (!addressAbort.aborted) {
            try {
                await attemptOnce(address, addressAbort, connecting, addrNo, attemptNo++);
            } catch (e) {
                await handleConnectionError(asError(e), address, addressAbort, connecting);
            }
        }
    }

    /**
     * Make a single attempt to connect to a specific address.
     */
    async function attemptOnce(
        address: ServerAddressUdp,
        addressAbort: Abort,
        attemptLifetime: Lifetime,
        addrNo: number,
        attemptNo: number,
    ) {
        let socket;
        {
            using _opening = attemptLifetime.join("opening socket");
            socket = await context.openSocket(address, addressAbort);
            if (socket === undefined) {
                return;
            }
        }

        // When we try the fallback address, and it is not the first one, then we directly use a higher MRP interval
        const isFallback = attemptingFallback && addrsAttempted > 1;

        await using unsecuredSession = context.sessions.createUnsecuredSession({
            channel: socket,
            sessionParameters: peer.sessionParameters,
            isInitiator: true,
        });

        await using exchange = PeerConnection.createExchange(peer, context.exchanges, unsecuredSession);

        debug(
            Diagnostic.via(`${peer.address.toString()}${exchange.via}`),
            address,
            "Connecting",
            Diagnostic.dict({
                "addr #": addrNo,
                "attempt #": attemptNo,
                "connect time": Duration.format(Timestamp.delta(lifetime.startedAt)),
                "addr time": Duration.format(Timestamp.delta(attemptLifetime.startedAt)),
            }),
            Diagnostic.asFlags({
                fallback: address === attemptingFallback,
            }),
        );

        const caseClient = new CaseClient(context.sessions);

        const fabric = context.sessions.fabricFor(peer.address);

        let kick: Disposable | undefined;

        try {
            using _pairing = attemptLifetime.join("pairing");

            kick = kicker?.use(() => exchange.kick());

            const { session } = await caseClient.pair(exchange, fabric, peer.address.nodeId, {
                ...options,
                abort: addressAbort,
                caseAuthenticatedTags: peer.descriptor.caseAuthenticatedTags,
                maxInitialRetransmissions: Infinity,
                maxInitialRetransmissionTime: context.timing.maxDelayBetweenInitialContactRetries,
                initialRetransmissionTime: isFallback ? context.timing.maxDelayBetweenInitialContactRetries : undefined,
            });

            // Success
            outputSession = session;
            overallAbort();
        } catch (e) {
            if (AbortedError.is(e)) {
                return;
            }

            throw e;
        } finally {
            kick?.[Symbol.dispose]();
        }
    }

    /**
     * Log error information and pause before next retry.
     */
    async function handleConnectionError(e: Error, address: ServerAddressUdp, addressAbort: Abort, lifetime: Lifetime) {
        using _handling = lifetime.join("handling error");

        let delay: undefined | Duration;
        const csre = ChannelStatusResponseError.of(e);
        if (csre) {
            if (csre.generalStatusCode === GeneralStatusCode.Busy && csre.busyDelay !== undefined) {
                delay = Millis(csre.busyDelay + Math.round(Math.random() * context.timing.delayAfterNetworkError));
                info(
                    address,
                    `Peer requested to delay and retry no earlier than ${Duration.format(csre.busyDelay)} from now (retry in ${Duration.format(delay)})`,
                );
            } else if (
                csre.protocolStatusCode === SecureChannelStatusCode.NoSharedTrustRoots &&
                (await context.sessions.deleteResumptionRecord(peer.address))
            ) {
                warn(
                    address,
                    "Authorization rejected by peer on session resumption; clearing resumption data and retrying",
                );
            } else {
                delay = context.timing.delayAfterPeerError;
                error(address, `Peer error (retry in ${Duration.format(delay)}):`, Diagnostic.errorMessage(e));
            }
        } else if (causedBy(e, TransientPeerCommunicationError)) {
            delay = context.timing.delayAfterNetworkError;
            error(address, `Connection error (retry in ${Duration.format(delay)}):`, Diagnostic.errorMessage(e));
        } else {
            delay = context.timing.delayAfterUnhandledError;
            error(address, `General connection error (retry in ${Duration.format(delay)}):`, e);
        }

        if (addressAbort.aborted) {
            return;
        }

        if (delay) {
            await Abort.sleep("peer connection retry", addressAbort, delay);
        }
    }
}

export namespace PeerConnection {
    export interface Context extends Lifetime.Owner {
        sessions: SessionManager;
        exchanges: ExchangeManager;
        networks: NetworkProfiles;

        /**
         * Open byte channel to a specific address.
         */
        openSocket(address: ServerAddressUdp, abort: AbortSignal): Promise<Channel<Bytes> | void>;

        timing: PeerTimingParameters;
    }

    export interface Options {
        abort?: AbortSignal;
        network?: string;
        kicker?: Observable<[]>;
    }

    export function createExchange(
        peer: Peer,
        exchanges: ExchangeManager,
        session: Session,
        protocol = SECURE_CHANNEL_PROTOCOL_ID,
    ) {
        return exchanges.initiateExchangeForSession(session, protocol, { onSend, onReceive });

        function onSend(_message: Message, retransmission: number) {
            if (retransmission) {
                // Trigger discovery when we begin retransmitting
                // TODO - spec specifies this SHOULD happen unequivocally on first retry, but seems like it may be
                // beneficial to *not* do so when the network is congested
                peer.service.status.isReachable = false;
            }
        }

        function onReceive() {
            peer.service.status.lastReceiptAt = Time.nowMs;
        }
    }
}

interface Attempt {
    abort: Abort;
    finished: Promise<void>;
}
