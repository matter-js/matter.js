/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientInteraction } from "#action/client/ClientInteraction.js";
import type { NodeProtocol } from "#action/protocols.js";
import { DiscoveryData } from "#common/Scanner.js";
import { getOperationalDeviceQname } from "#mdns/MdnsConsts.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import type { ExchangeProvider, ReachabilityReason } from "#protocol/ExchangeProvider.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    Abort,
    AbortedError,
    AsyncObservable,
    BasicMultiplex,
    BasicSet,
    ChannelType,
    ClosedError,
    Diagnostic,
    DnssdNames,
    Duration,
    Identity,
    Instant,
    IpChannelType,
    IpService,
    isIpNetworkChannel,
    Lifetime,
    Logger,
    Millis,
    Observable,
    ObserverGroup,
    QuietObservable,
    Seconds,
    ServerAddressIp,
    Time,
    Timestamp,
} from "@matter/general";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import type { NetworkProfiles } from "./NetworkProfile.js";
import { PeerAddressMonitor } from "./PeerAddressMonitor.js";
import { PeerUnreachableError } from "./PeerCommunicationError.js";
import { type KickOrigin, PeerConnection } from "./PeerConnection.js";
import { ObservablePeerDescriptor, PeerDescriptor } from "./PeerDescriptor.js";
import { PeerExchangeProvider } from "./PeerExchangeProvider.js";
import { PeerTimingParameters } from "./PeerTimingParameters.js";
import type { PhysicalDeviceProperties } from "./PhysicalDeviceProperties.js";

const logger = Logger.get("Peer");

/**
 * Floor for the MRP idle retransmission interval when a peer operates as a LIT ICD. A LIT ICD omits SII from its
 * mDNS advertisement (§ 9.15.1.6.2), so the controller would otherwise fall back to the 500ms idle default and
 * retransmit far too aggressively at a sleeping peer. Mirrors CHIP's `minimumLITBackoffInterval`.
 */
export const LIT_MIN_IDLE_INTERVAL = Seconds(5);

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

    /**
     * Preferred transport for outgoing connections to this peer.
     *
     * Only `ChannelType.TCP` has meaning here — UDP is the default with no preference, and BLE is
     * not used for operational connections. Setting TCP is a soft hint: the connect path still falls
     * back to UDP if the peer does not advertise TCP server support.
     */
    transportPreference?: ChannelType.TCP;
    #connecting?: ConnectionProcess;
    #service: IpService;
    #observers = new ObserverGroup();
    #exchangeProvider?: ExchangeProvider;
    #updated = AsyncObservable<[peer: Peer]>();
    #establishmentUnresponsive = Observable<[]>();
    #addressMonitor?: PeerAddressMonitor;

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

            // Schedule address validity check if we have an active session
            this.#addressCheck.schedule();
        });

        this.#observers.on(this.#sessions.added, session => {
            const tagUdp = (addr: ServerAddressIp) => {
                this.#descriptor.operationalAddress = { ...addr, type: "udp" };
            };

            // Ensure the operational address is always set to the most recent IP
            if (!session.isClosed) {
                const channel = session.channel.transportChannel;
                if (isIpNetworkChannel(channel)) {
                    if (channel.type === ChannelType.TCP) {
                        // For incoming TCP the remote port is ephemeral — use the mDNS port
                        const discoveredPort = [...this.#service.addresses][0]?.port;
                        if (discoveredPort !== undefined) {
                            this.#descriptor.operationalAddress = {
                                type: "tcp",
                                ip: channel.networkAddress.ip,
                                port: discoveredPort,
                            };
                        }
                    } else {
                        tagUdp(channel.networkAddress);
                        // MessageChannel.networkAddressChanged survives socket swaps; the transport channel's does not.
                        session.channel.networkAddressChanged.on(tagUdp);
                    }
                }
            }

            // Remove session and detach listener when destroyed
            session.closing.on(() => {
                this.#sessions.delete(session);
                if (isIpNetworkChannel(session.channel.transportChannel)) {
                    session.channel.networkAddressChanged.off(tagUdp);
                }
            });

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

    /**
     * Emits when a CASE establishment attempt has retransmitted past the MRP budget without a response, indicating
     * the peer is likely unresponsive.  The latch re-arms per attempt (and per handshake message), so a later stall
     * can emit again.  Retransmission itself is unchanged; this is only a signal.
     */
    get establishmentUnresponsive(): Observable<[]> {
        return this.#establishmentUnresponsive;
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
        return this.#protocol?.[0]?.[BasicInformation.id]?.readState({}) as Peer.BasicInformation | undefined;
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
        const descriptorParams = this.#descriptor.sessionParameters;

        const parameters = SessionParameters({
            dataModelRevision: bi?.dataModelRevision,
            maxPathsPerInvoke: bi?.maxPathsPerInvoke,
            idleInterval: dd?.SII,
            activeInterval: dd?.SAI,
            activeThreshold: dd?.SAT,
            ...descriptorParams,
            // BasicInformation and the CASE-negotiated parameters report the same spec version, but one may update
            // before the other; take the newer so a stale descriptor value cannot mask a fresher BasicInformation read.
            specificationVersion: Math.max(bi?.specificationVersion ?? 0, descriptorParams?.specificationVersion ?? 0),
        });

        // Only when the peer advertised no SII: a LIT ICD omits it, so the merged value is the 500ms default (or a
        // negotiated value) which is too aggressive for a sleeper. An advertised SII is honored as-is.
        if (
            this.#physicalProperties?.isLongIdleTimeOperating &&
            dd?.SII === undefined &&
            parameters.idleInterval < LIT_MIN_IDLE_INTERVAL
        ) {
            parameters.idleInterval = LIT_MIN_IDLE_INTERVAL;
        }

        return parameters;
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
     * Record that the peer does not support TCP despite advertising it, by clearing TCP from its persisted session
     * parameters. Honored by {@link resolveTransports} and persisted across restart; a later session reporting real
     * TCP support overwrites it.
     */
    markTcpUnsupported() {
        this.#descriptor.sessionParameters = {
            ...this.sessionParameters,
            supportedTransports: { tcpClient: false, tcpServer: false },
        };
    }

    /**
     * Resolve the ordered list of transports to attempt for this peer.
     *
     * `requiredTransport` is a hard constraint.  Otherwise, with an effective TCP preference
     * (`preferredTransport ?? transportPreference`), the `SUPPORTED_TRANSPORTS.tcpServer` session parameter (tag 8)
     * decides when present, falling back to the mDNS TXT `T` advertisement only when absent.  Pre-1.5 peers resolve
     * to UDP.  `undefined` means default UDP.
     */
    resolveTransports(requiredTransport?: ChannelType, preferredTransport?: ChannelType): IpChannelType[] | undefined {
        return this.#transportDecision(requiredTransport, preferredTransport).transports;
    }

    #transportDecision(
        requiredTransport?: ChannelType,
        preferredTransport?: ChannelType,
    ): { transports: IpChannelType[] | undefined; reason: string; diag: Record<string, unknown> } {
        const tcp: IpChannelType[] = [ChannelType.TCP, ChannelType.UDP];
        if (requiredTransport === ChannelType.TCP || requiredTransport === ChannelType.UDP) {
            return { transports: [requiredTransport], reason: "transport explicitly required", diag: {} };
        }
        const effectivePreference = preferredTransport ?? this.transportPreference;
        if (effectivePreference !== ChannelType.TCP) {
            return { transports: undefined, reason: "no TCP preference active", diag: {} };
        }

        // mDNS T is a fallback for an absent tag 8 only — some 1.5+ peers omit the field yet serve TCP.  Pre-1.5 peers
        // arrive as an explicit `false` (SessionParameters clears their TCP), so the 1.5.0 gate needs no code here.
        // Live TXT first: the descriptor cache lags a tick when TXT and addresses share one mDNS response.
        const params = this.sessionParameters;
        const specVersion = Diagnostic.hex(params.specificationVersion);
        const tcpServerParam = params.supportedTransports.tcpServer;
        if (tcpServerParam === true) {
            return {
                transports: tcp,
                reason: "session parameter confirms TCP server",
                diag: { paramTcpServer: true, specVersion },
            };
        }
        if (tcpServerParam === false) {
            return {
                transports: undefined,
                reason: "session parameter denies TCP server",
                diag: { paramTcpServer: false, specVersion },
            };
        }
        const tcpServerMdns =
            (DiscoveryData(this.#service.parameters).T ?? this.#descriptor.discoveryData?.T)?.tcpServer === true;
        return tcpServerMdns
            ? {
                  transports: tcp,
                  reason: "TCP server advertised via mDNS (session parameter absent)",
                  diag: { paramTcpServer: "absent", mdnsTcpServer: true, specVersion },
              }
            : {
                  transports: undefined,
                  reason: "no TCP server (session parameter absent, no mDNS advertisement)",
                  diag: { paramTcpServer: "absent", mdnsTcpServer: false, specVersion },
              };
    }

    /**
     * Obtain a session with the peer, establishing anew as necessary.
     */
    async connect(options?: Peer.ConnectOptions) {
        if (PeerAddress.isGroup(this.address)) {
            return await this.#context.sessions.groupSessionForAddress(this.address, this.#context.exchanges);
        }

        while (true) {
            const { transports } = this.#transportDecision(options?.requiredTransport, options?.preferredTransport);
            /* Debug aid (one line per connect — noisy); uncomment to trace transport selection:
            {
                const { reason, diag } = this.#transportDecision(options?.requiredTransport, options?.preferredTransport);
                logger.debug(
                    "Transport resolution",
                    Diagnostic.dict({
                        peer: this.address.toString(),
                        result: transports === undefined ? "UDP (no constraint)" : transports.join("+"),
                        reason,
                        peerPreference: this.transportPreference ?? "none",
                        ...diag,
                    }),
                );
            }
            */
            let session: NodeSession | undefined;
            if (transports === undefined) {
                session = this.newestSession();
            } else {
                for (const t of transports) {
                    session = this.newestSession(t);
                    if (session) break;
                }
            }
            if (session) {
                /* Debug aid; uncomment to trace existing-session reuse:
                logger.debug(
                    "Reusing existing session",
                    Diagnostic.dict({
                        peer: this.address.toString(),
                        sessionTransport: session.channel.transportChannel.type,
                        wantedTransports: transports === undefined ? "UDP (no constraint)" : transports.join("+"),
                    }),
                );
                */
                return session;
            }

            this.#initiateConnection(options);

            // abort and connectionTimeout are orthogonal: abort cancels, timeout bounds the wait on a shared
            // in-flight handshake.  Callers wanting unbounded wait pass Forever explicitly.
            let timeout: Duration | undefined =
                options?.connectionTimeout ?? this.#context.timing.defaultConnectionTimeout;
            if (timeout === Infinity) {
                timeout = undefined;
            } else if (timeout <= 0) {
                timeout = Instant;
            } else if (!options?.kick) {
                const remaining = timeout - this.timeOffline;
                timeout = remaining <= 0 ? Instant : Millis(remaining);
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
     * Aborts the current CASE handshake exchange and restarts it from scratch with a fresh MRP
     * backoff. Rate-limited; repeated calls within {@link PeerTimingParameters.kickRestartCooldown}
     * are suppressed.
     */
    kick() {
        this.#connecting?.kick("connect");
    }

    /**
     * Abort any outstanding connection attempts.
     *
     * When {@link cause} is provided, also force-close any active sessions with the peer — use this when the peer
     * is known to be unreachable (e.g. we just removed our fabric on the peer).  Without a cause the existing
     * sessions are left alone so they can follow their normal graceful-close path.
     */
    async disconnect(cause?: Error) {
        if (this.#connecting) {
            using _disconnecting = this.#lifetime.join("disconnecting");
            this.#connecting.abort();
            try {
                await this.#connecting.done;
            } catch (error) {
                AbortedError.accept(error);
            }
        }

        if (cause !== undefined) {
            for (const session of this.#context.sessions.sessionsFor(this.address)) {
                await session.initiateForceClose({ cause });
            }
        }
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

        // Stop the address monitor and await any in-flight reachability run (the abort above makes it unwind).
        await this.#addressMonitor?.close();

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

    newestSession(type?: ChannelType) {
        // Prefer the session we last heard from the peer on (highest activeTimestamp).  A dead session
        // still retransmitting keeps a high `timestamp`, so ordering by that would pick it over a fresh one.
        let found: NodeSession | undefined;

        for (const session of this.#sessions) {
            if (session.isClosing || session.isPeerLost) {
                continue;
            }

            if (type !== undefined && session.channel.transportChannel.type !== type) {
                continue;
            }

            if (!found || found.activeTimestamp < session.activeTimestamp) {
                found = session;
            }
        }

        return found;
    }

    get #addressCheck() {
        if (this.#addressMonitor === undefined) {
            this.#addressMonitor = new PeerAddressMonitor(
                this,
                this.#context.timing.addressChangeStabilizationDelay,
                this.#context.timing.addressChangeProbeCooldown,
                this.#abort,
                work => this.#workers.add(work),
            );
        }
        return this.#addressMonitor;
    }

    /**
     * Verify this peer is reachable, driving recovery via the address monitor.
     *
     * Returns `true` if the session is usable afterward, `false` if it was closed.
     */
    async verifyReachability(options: { reason: ReachabilityReason; abort?: AbortSignal }): Promise<boolean> {
        if (!this.hasSession) {
            return false;
        }
        return this.#addressCheck.verifyReachability(options);
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

        const timing = options?.timing
            ? PeerTimingParameters.merge(this.#context.timing, options.timing)
            : this.#context.timing;

        const kicker = new QuietObservable<[KickOrigin]>({
            minimumEmitInterval: timing.kickThrottleInterval,
            skipSuppressedEmits: true,
        });

        this.#connecting = {
            abort,

            done: PeerConnection(this, this.#context, {
                network: options?.network,
                additionalMrpDelay: options?.additionalMrpDelay,
                timing: options?.timing,
                requiredTransport: options?.requiredTransport,
                preferredTransport: options?.preferredTransport,
                handleError: options?.handleError,
                abort,
                kicker,
            }).finally(() => {
                this.#connecting = undefined;
                abort.close();
                added[Symbol.dispose]();
            }),

            kick(origin: KickOrigin) {
                kicker.emit(origin);
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
        readonly [N in keyof BasicInformation.Attributes]?: BasicInformation.Attributes[N];
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
         * Per-call override for the peer-medium MRP retransmission margin.  When omitted the margin derives from
         * the peer's network medium, independent of any {@link network} throttle override.
         */
        additionalMrpDelay?: Duration;

        /**
         * A timeout relative to beginning of connection process.
         *
         * If the peer is already connecting, connection time is reduced by this amount.
         *
         * If omitted, defaults to {@link PeerTimingParameters.defaultConnectionTimeout}.  Pass `Forever` to wait
         * without bound (only appropriate for background sustain loops — invokes, reads, writes and non-sustained
         * subscribes should always allow the default to apply so a hung handshake cannot deadlock a request).
         */
        connectionTimeout?: Duration;

        /**
         * If a connection is ongoing, kicks the process to increase MRP responsiveness.
         *
         * If true, {@link connectionTimeout} is not reduced if already connecting.
         */
        kick?: boolean;

        /**
         * Per-call overrides for timing parameters.
         *
         * Merged on top of the global {@link PeerSet.timing} for this connection only.
         * Other concurrent or future connections are not affected.
         *
         * Note: if a connection process is already in progress for this peer, these overrides are not applied to the
         * ongoing attempt.
         */
        timing?: Partial<PeerTimingParameters>;

        /**
         * Hard transport constraint for this connection (e.g. Large Message Quality requires TCP).
         * When omitted, transports are resolved per {@link Peer.resolveTransports}.
         */
        requiredTransport?: ChannelType;

        /**
         * Per-call soft transport preference. Overrides {@link Peer.transportPreference} for this
         * connection only and is honored only when the peer advertises matching server capability.
         */
        preferredTransport?: ChannelType;

        /**
         * Per-call error handler, overrides {@link PeerConnection.Context.handleError} for this connection only.
         *
         * Note: if a connection process is already in progress for this peer, this handler is not applied to the
         * ongoing attempt.
         */
        handleError?: (error: Error) => Duration | void;
    }
}

interface ConnectionProcess {
    done: Promise<NodeSession | void>;
    abort: Abort;
    kick: (origin: KickOrigin) => void;
}
