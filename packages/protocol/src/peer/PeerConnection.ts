/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from "#codec/MessageCodec.js";
import { DiscoveryData } from "#common/Scanner.js";
import type { ExchangeManager } from "#protocol/ExchangeManager.js";
import { ChannelStatusResponseError } from "#securechannel/SecureChannelMessenger.js";
import { CaseClient } from "#session/case/CaseClient.js";
import type { NodeSession } from "#session/NodeSession.js";
import type { Session } from "#session/Session.js";
import type { SessionManager } from "#session/SessionManager.js";
import {
    Abort,
    AbortedError,
    asError,
    BasicMultiplex,
    Bytes,
    causedBy,
    Channel,
    ChannelType,
    Diagnostic,
    Duration,
    Heap,
    IpChannelType,
    Lifetime,
    Logger,
    Millis,
    NetworkError,
    Observable,
    ServerAddress,
    ServerAddressIp,
    ServerAddressSet,
    ServerAddressTcp,
    ServerAddressUdp,
    Time,
    Timestamp,
} from "@matter/general";
import { GeneralStatusCode, SECURE_CHANNEL_PROTOCOL_ID, SecureChannelStatusCode } from "@matter/types";
import { NetworkProfile, NetworkProfiles } from "./NetworkProfile.js";
import type { Peer } from "./Peer.js";
import { TcpUnsupportedError, TransientPeerCommunicationError } from "./PeerCommunicationError.js";
import { PeerTimingParameters } from "./PeerTimingParameters.js";

const logger = Logger.get("PeerConnection");

/**
 * Identifies who triggered an MRP exchange restart kick.
 *
 * - `"discover"` — triggered by DNS-SD address discovery (mDNS resolution completed)
 * - `"connect"` — triggered explicitly via `peer.kick()` or `Peer.ConnectOptions.kick`
 */
export type KickOrigin = "discover" | "connect";

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

    const timing = options?.timing ? PeerTimingParameters.merge(context.timing, options.timing) : context.timing;
    const requiredTransport = options?.requiredTransport;
    const preferredTransport = options?.preferredTransport;

    // Lazy so descriptor.T arriving mid-connect (operational mDNS) is honored for later expansions.
    const resolveTransports = () => peer.resolveTransports(requiredTransport, preferredTransport);

    using overallAbort = new Abort(options);
    using lifetime = (peer.lifetime ?? Lifetime.process).join("connecting");

    // Reserve network communication slot
    let network = context.networks.select(peer, options?.network);
    const mediumProfile = context.networks.forPeer(peer);
    const peerAdditionalMrpDelay =
        options?.additionalMrpDelay ?? mediumProfile.connect?.additionalMrpDelay ?? mediumProfile.additionalMrpDelay;
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
    const attempts = new Map<ServerAddressIp, Attempt>();

    // The result
    let outputSession: NodeSession | undefined;

    // Set when a fatal (non-retriable) error terminates the connection process
    let fatalError: Error | undefined;

    // Outstanding promises
    const workers = new BasicMultiplex();

    // Address set used for interning
    const addresses = ServerAddressSet<ServerAddressIp>();

    // Addresses to try, ordered by desirability and (for same-IP variants) by transport-list index.
    const pendingAddresses = new Heap<ServerAddressIp>((a, b) => {
        const primary = ServerAddressSet.compareDesirability(a, b);
        const transports = resolveTransports();
        if (primary !== 0 || transports === undefined) {
            return primary;
        }
        return transportIndex(a, transports) - transportIndex(b, transports);
    }, addresses.add.bind(addresses));

    function transportIndex(address: ServerAddressIp, transports: IpChannelType[]): number {
        const type = (address as { type?: IpChannelType }).type;
        return type === undefined ? -1 : transports.indexOf(type);
    }

    // When the service is undiscovered, we attempt to connect to the last-known good address and store it here
    let attemptingFallback: ServerAddressIp | undefined;

    // Time of last attempt initiation, used to delay next initiation
    let lastAttemptAt: undefined | Timestamp;

    // Count of addresses we've tried
    let addrsAttempted = 0;

    // Exchange "kick" driver
    const kicker = options?.kicker;

    // Shared timestamp of the last kick-triggered exchange restart.
    // Scoped to this PeerConnection call so all concurrent address attempts share one rate-limit clock.
    let lastRestartAt: Timestamp | undefined;

    // Wakes the attempt scheduler when the delay budget changes out-of-band (e.g. fallback retirement resetting
    // lastAttemptAt).
    const rescheduled = new Observable<[]>();

    // Start the attempt scheduler
    workers.add(scheduleAttempts());

    // Retire the speculative fallback once discovery proves it stale
    workers.add(retireStaleFallback());

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

    if (fatalError) {
        throw fatalError;
    }

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
                const delayInterval = Millis(timing.delayBeforeNextAddress - timeSinceLastAttempt);
                if (delayInterval > 0) {
                    using _delaying = scheduling.join("delaying");

                    await overallAbort.race<ServerAddressIp | void>(
                        Abort.sleep("connection delay", overallAbort, delayInterval),
                        pendingAddresses.added,
                        pendingAddresses.deleted,
                        rescheduled,
                    );
                    if (overallAbort.aborted) {
                        return;
                    }

                    // Re-evaluate from the top: the delay may now be satisfied, the queue may have changed, or the
                    // fallback may have been retired (which resets lastAttemptAt so the replacement starts at once).
                    continue;
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
     * Retire the speculative fallback once discovery proves it stale.
     *
     * The fallback is a guess — the last-known-good operational address we attempt while awaiting discovery.  If mDNS
     * surfaces a set of current addresses that never includes the fallback, the guess is stale.  Once the set settles
     * we abort the fallback attempt (both transport variants) and let the discovered address start without the
     * inter-address stagger, rather than hammering a dead address and delaying the real one behind it.
     *
     * A fallback that is still valid is instead promoted by {@link addAddress} (clearing {@link attemptingFallback}),
     * so reaching the retirement below means discovery genuinely dropped it.
     */
    async function retireStaleFallback() {
        using _retiring = lifetime.join("retiring fallback");

        while (!overallAbort.aborted) {
            // Only meaningful once discovery has settled on addresses that exclude the fallback.
            if (!fallbackSuperseded()) {
                await overallAbort.race(service.changed);
                continue;
            }

            // Let the address set settle before acting; mDNS may still deliver the fallback in a later packet.
            await Abort.sleep("fallback stabilization", overallAbort, timing.addressChangeStabilizationDelay);

            // Re-check: the fallback may have been re-advertised (or promoted) during the wait.
            if (overallAbort.aborted || !fallbackSuperseded()) {
                continue;
            }

            const stale = attemptingFallback!;
            attemptingFallback = undefined;

            // The fallback occupied the attempt slot speculatively, never as real concurrent load on the peer, so the
            // discovered replacement inherits no inter-address stagger.
            lastAttemptAt = undefined;

            deleteAddress(stale, "Aborting fallback: no longer advertised, switching to discovered address", true);
            rescheduled.emit();
        }
    }

    /**
     * True when we are attempting a fallback that discovery has superseded: at least one address is known and none of
     * them is the fallback.  A re-advertised fallback (matched by IP, ignoring transport) is not superseded even if
     * {@link addAddress} has not yet promoted it out of the pending queue.
     */
    function fallbackSuperseded() {
        if (attemptingFallback === undefined || service.addresses.size === 0) {
            return false;
        }
        for (const address of service.addresses) {
            if (ServerAddress.isEqual(address, attemptingFallback)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Expand an address into one variant per requested transport, or return it unchanged when no
     * transport list is set.
     */
    function expandAddresses(address: ServerAddressIp): ServerAddressIp[] {
        const transports = resolveTransports();
        if (transports === undefined) {
            return [address];
        }
        return transports.map(type =>
            type === ChannelType.TCP
                ? ({ ...address, type } satisfies ServerAddressTcp)
                : ({ ...address, type } satisfies ServerAddressUdp),
        );
    }

    /**
     * Enqueue an address if not already attempting.
     */
    function addAddress(address: ServerAddressIp) {
        for (const variant of expandAddresses(address)) {
            const interned = addresses.add(variant);

            // Skip if we're already attempting connection to this exact (ip,port,type) variant
            const attempt = attempts.get(interned);
            if (attempt !== undefined) {
                if (attemptingFallback && ServerAddress.isEqual(attemptingFallback, interned)) {
                    // The "fallback" is now a "real" address
                    attemptingFallback = undefined;
                    kicker?.emit("discover"); // ... and trigger rediscovery / restart of the CASE exchange as needed
                }
                continue;
            }

            pendingAddresses.add(interned);
        }
    }

    /**
     * Attempt connection to fallback address if no other attempts are active
     */
    function maybeAttemptFallback() {
        if (attempts.size || pendingAddresses.size || service.addresses.size) {
            return;
        }

        const fallback = peer.descriptor.operationalAddress;
        if (!fallback) {
            attemptingFallback = undefined;
            return;
        }
        const variants = expandAddresses(fallback);
        // Intern so attempts/pendingAddresses key on one canonical object; fallback identity is matched by value.
        attemptingFallback = addresses.add(variants[0]);
        for (const variant of variants) {
            pendingAddresses.add(variant);
        }
    }

    /**
     * Begin connection attempt to specific address.  Continues until aborted.
     */
    function initiateAttempt(address: ServerAddressIp) {
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
     * End connection attempt(s) for the given address. Discovery emits bare addresses without
     * transport type; expand into the same variants `addAddress` enqueued so the typed
     * entries in `attempts`/`pendingAddresses` actually match.
     */
    function deleteAddress(address: ServerAddressIp, why: string, force = false) {
        const variants = expandAddresses(address).map(v => addresses.add(v));
        const operationalAddress = peer.descriptor.operationalAddress;
        const isOperational = operationalAddress !== undefined && ServerAddress.isEqual(operationalAddress, address);

        // Keep the operational address alive as fallback when it is the last thread to the peer (e.g. mDNS expired
        // every discovered address).  Skipped when forced: retirement deletes a fallback discovery has superseded, so
        // a discovered alternative already exists and re-arming it would strand us on a dead address.
        const remainingNonOperational = attempts.size - variants.filter(v => attempts.has(v)).length;
        if (!force && isOperational && remainingNonOperational === 0) {
            attemptingFallback = variants[0];
            return;
        }

        for (const variant of variants) {
            const attempt = attempts.get(variant);
            if (attempt) {
                debug(via, variant, why);
                attempt.abort();
                attempts.delete(variant);
            }
            pendingAddresses.delete(variant);
        }
    }

    function error(address: ServerAddressIp, ...message: unknown[]) {
        logger.error(logHeaderFor(address), ...message);
    }

    function warn(address: ServerAddressIp, ...message: unknown[]) {
        logger.warn(logHeaderFor(address), ...message);
    }

    function notice(address: ServerAddressIp, ...message: unknown[]) {
        logger.notice(logHeaderFor(address), ...message);
    }

    function info(via: string, address: ServerAddressIp, ...message: unknown[]) {
        logger.info(logHeaderFor(address, via), ...message);
    }

    function debug(via: string, address: ServerAddressIp, ...message: unknown[]) {
        logger.debug(logHeaderFor(address, via), ...message);
    }

    function logHeaderFor(address: ServerAddressIp, localVia = via) {
        return [localVia, Diagnostic.strong(ServerAddress.urlFor(address))];
    }

    /**
     * Perform connection to specific address until successful.
     */
    async function connect(address: ServerAddressIp, addressAbort: Abort) {
        const addrNo = ++addrsAttempted;
        let attemptNo = 1;

        using connecting = lifetime.join("attempt");
        connecting.details.address = ServerAddress.urlFor(address);

        // If this is not the fallback address but we're still attempting to connect to the fallback, it means that
        // we've discovered addresses that do not include the fallback; terminate the fallback attempt
        if (attemptingFallback && !ServerAddress.isEqual(address, attemptingFallback)) {
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
        address: ServerAddressIp,
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

        // MessageChannel.close skips TCP — sessions own that lifecycle. If pair fails before a session
        // takes over we must close the channel ourselves. UDP close is a no-op so this is safe for both.
        let socketOwned = true;

        try {
            // When we try the fallback address, and it is not the first one, then we directly use a higher MRP interval
            const isFallback = attemptingFallback && addrsAttempted > 1;

            await using unsecuredSession = context.sessions.createUnsecuredSession({
                channel: socket,
                sessionParameters: peer.sessionParameters,
                isInitiator: true,
            });

            await using exchange = PeerConnection.createExchange(
                peer,
                context.exchanges,
                unsecuredSession,
                network,
                peerAdditionalMrpDelay,
            );

            info(
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
                    [network.id]: true,
                    fallback: attemptingFallback !== undefined && ServerAddress.isEqual(address, attemptingFallback),
                }),
            );

            const caseClient = new CaseClient(context.sessions);

            const fabric = context.sessions.fabricFor(peer.address);

            let kick: Disposable | undefined;

            // localAbort wraps addressAbort; firing it aborts only this single attempt so connect() can
            // loop back and open a fresh exchange (fresh MRP backoff) without aborting the address entirely.
            using localAbort = new Abort({ abort: addressAbort });

            try {
                using _pairing = attemptLifetime.join("pairing");

                kick = kicker?.use((origin: KickOrigin) => {
                    if (exchange.retransmissionCount < context.timing.kickMinRetransmissions) {
                        return;
                    }

                    if (exchange.retransmissionRestartSaving < context.timing.kickMinRestartSaving) {
                        debug(via, address, `Suppressing "${origin}" kick, restart would save too little time`);
                        return;
                    }

                    const threshold =
                        origin === "discover"
                            ? context.timing.kickRestartCooldown.addressChange
                            : context.timing.kickRestartCooldown.connect;

                    if (lastRestartAt === undefined || Timestamp.delta(lastRestartAt) >= threshold) {
                        info(via, address, `Restarting exchange on "${origin}" kick`);
                        lastRestartAt = Time.nowMs;
                        localAbort();
                    } else {
                        debug(
                            via,
                            address,
                            `Suppressing "${origin}" kick, last restart was ${Duration.format(Timestamp.delta(lastRestartAt))} ago`,
                        );
                    }
                });

                const isTcp = "type" in address && address.type === "tcp";
                const { session } = await caseClient.pair(exchange, fabric, peer.address.nodeId, {
                    ...options,
                    abort: localAbort,
                    caseAuthenticatedTags: peer.descriptor.caseAuthenticatedTags,
                    maxInitialRetransmissions: Infinity,
                    maxInitialRetransmissionTime: timing.maxDelayBetweenInitialContactRetries,
                    initialRetransmissionTime: isFallback ? timing.maxDelayBetweenInitialContactRetries : undefined,
                    validateSessionParameters: isTcp
                        ? params => {
                              // Mirror resolveTransports so connect and validation agree: absent tag 8 never denies, and
                              // a `false` (which on resume can be a stale resumption-record value, not the device's
                              // current advertisement) is overridden while mDNS still advertises a TCP server.
                              if (params.supportedTransports.tcpServer !== false) {
                                  return;
                              }
                              const advertisedByMdns =
                                  (DiscoveryData(peer.service.parameters).T ?? peer.descriptor.discoveryData?.T)
                                      ?.tcpServer === true;
                              if (advertisedByMdns) {
                                  return;
                              }
                              peer.markTcpUnsupported();
                              throw new TcpUnsupportedError(
                                  `Peer negotiated a TCP session but reports no TCP server support`,
                              );
                          }
                        : undefined,
                });

                outputSession = session;
                socketOwned = false;
                overallAbort();
            } catch (e) {
                if (AbortedError.is(e)) {
                    return;
                }

                throw e;
            } finally {
                kick?.[Symbol.dispose]();
            }
        } finally {
            if (socketOwned) {
                try {
                    await socket.close();
                } catch (e) {
                    warn(address, "Error closing abandoned channel:", Diagnostic.errorMessage(asError(e)));
                }
            }
        }
    }

    /**
     * Log error information and pause before next retry.
     */
    async function handleConnectionError(e: Error, address: ServerAddressIp, addressAbort: Abort, lifetime: Lifetime) {
        using _handling = lifetime.join("handling error");

        // The peer accepted a TCP session but denies TCP support. With a hard TCP requirement we cannot fall back, and
        // re-resolution would re-attempt TCP and spin, so fail fatally for the caller. Otherwise the peer is now
        // flagged (markTcpUnsupported) so re-resolution prefers UDP; end this connection so Peer.connect reconnects
        // over UDP.
        if (causedBy(e, TcpUnsupportedError)) {
            if (requiredTransport === ChannelType.TCP) {
                error(address, "Peer reports no TCP support but TCP was required; aborting connection");
                fatalError = asError(e);
            } else {
                notice(address, "Peer negotiated a TCP session but reports no TCP support; falling back to UDP");
            }
            overallAbort();
            return;
        }

        let delay: undefined | Duration;
        let category: "busy" | "resumption" | "peer" | "network" | "general" | undefined;
        const csre = ChannelStatusResponseError.of(e);
        if (csre) {
            if (csre.generalStatusCode === GeneralStatusCode.Busy && csre.busyDelay !== undefined) {
                delay = Millis(csre.busyDelay + Math.round(Math.random() * timing.delayAfterNetworkError));
                category = "busy";
            } else if (
                csre.protocolStatusCode === SecureChannelStatusCode.NoSharedTrustRoots &&
                (await context.sessions.deleteResumptionRecord(peer.address))
            ) {
                category = "resumption";
            } else {
                delay = timing.delayAfterPeerError;
                category = "peer";
            }
        } else if (causedBy(e, TransientPeerCommunicationError)) {
            delay = timing.delayAfterNetworkError;
            category = "network";
        } else {
            delay = timing.delayAfterUnhandledError;
            category = "general";
        }

        // A network-layer failure (e.g. ENETUNREACH/EHOSTUNREACH) may mean the cached address no longer
        // routes; flag unreachable so mDNS rediscovery can surface a fresh address.
        if (causedBy(e, NetworkError)) {
            peer.service.status.isReachable = false;
        }

        const handleError = options?.handleError ?? context.handleError;
        if (delay !== undefined && handleError) {
            try {
                const result = handleError(e);
                if (result !== undefined) {
                    delay = result;
                }
            } catch (thrown) {
                error(address, "Fatal peer error, aborting connection:", Diagnostic.errorMessage(asError(thrown)));
                fatalError = asError(thrown);
                overallAbort();
                return;
            }
        }

        // Log after handleError so the reported delay is accurate
        switch (category) {
            case "busy":
                info(
                    via,
                    address,
                    `Peer requested to delay and retry no earlier than ${Duration.format(csre!.busyDelay!)} from now (retry in ${Duration.format(delay!)})`,
                );
                break;
            case "resumption":
                warn(
                    address,
                    "Authorization rejected by peer on session resumption; clearing resumption data and retrying",
                );
                break;
            case "peer":
                warn(address, `Peer error (retry in ${Duration.format(delay!)}):`, Diagnostic.errorMessage(e));
                break;
            case "network":
                warn(address, `Connection error (retry in ${Duration.format(delay!)}):`, Diagnostic.errorMessage(e));
                break;
            case "general":
                warn(address, `General connection error (retry in ${Duration.format(delay!)}):`, e);
                break;
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
        openSocket(address: ServerAddressIp, abort: AbortSignal): Promise<Channel<Bytes> | undefined>;

        timing: PeerTimingParameters;

        /**
         * Optional hook to customize error handling during connection attempts.
         *
         * Invoked for errors that would result in a delay-and-retry (not for Busy or resumption-clearing). If the hook
         * returns a {@link Duration}, that overrides the default delay. If it returns undefined, the default delay is
         * used. If it throws, the connection is aborted with the thrown error as a fatal error.
         */
        handleError?: (error: Error) => Duration | void;
    }

    export interface Options {
        abort?: AbortSignal;
        network?: string;

        /**
         * Per-call override for the peer-medium MRP retransmission margin.  When omitted the margin derives from
         * the peer's network medium, independent of any {@link network} throttle override.
         */
        additionalMrpDelay?: Duration;

        kicker?: Observable<[KickOrigin]>;

        /** See {@link Peer.ConnectOptions.requiredTransport}. */
        requiredTransport?: ChannelType;

        /** See {@link Peer.ConnectOptions.preferredTransport}. */
        preferredTransport?: ChannelType;

        /**
         * Per-call overrides for timing parameters.
         *
         * Merged on top of the global {@link PeerConnection.Context.timing} for this connection only.
         * Other concurrent or future connections are not affected.
         */
        timing?: Partial<PeerTimingParameters>;

        /**
         * Per-call error handler, overrides {@link Context.handleError} for this connection only.
         */
        handleError?: (error: Error) => Duration | void;
    }

    export function createExchange(
        peer: Peer,
        exchanges: ExchangeManager,
        session: Session,
        network: NetworkProfile,
        peerAdditionalMrpDelay?: Duration,
        protocol = SECURE_CHANNEL_PROTOCOL_ID,
        addressOverride?: ServerAddressUdp,
    ) {
        return exchanges.initiateExchangeForSession(session, protocol, {
            onSend,
            onReceive,
            network,
            peerAdditionalMrpDelay,
            addressOverride,
        });

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
