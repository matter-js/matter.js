/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import { DEFAULT_MAX_TCP_MESSAGE_SIZE, DeepPartial, Duration, Logger } from "@matter/general";
import { duration, field, uint16 } from "@matter/model";
import { Ble, FabricManager, NetworkProfiles, PeerTimingParameters, SessionParameters } from "@matter/protocol";
import { DiscoveryCapabilitiesBitmap, TypeFromPartialBitSchema } from "@matter/types";
import { CommissioningServer } from "../commissioning/CommissioningServer.js";
import { NetworkBehavior } from "./NetworkBehavior.js";
import type { ServerNetworkRuntime } from "./ServerNetworkRuntime.js";

const logger = Logger.get("NetworkingServer");

/**
 * Server implementation of {@link NetworkBehavior}.
 *
 * This behavior mostly deals with configuration and events.  {@link ServerNetworkRuntime} provides the actual network
 * implementation.
 */
export class NetworkServer extends NetworkBehavior {
    declare readonly state: NetworkServer.State;
    declare internal: NetworkServer.Internal;

    override initialize() {
        if (this.state.ble === undefined) {
            this.state.ble = this.env.has(Ble);
        } else if (this.state.ble && !this.env.has(Ble)) {
            logger.warn("Disabling Bluetooth commissioning because BLE support is not installed");
            this.state.ble = false;
        }

        const discoveryCaps = this.state.discoveryCapabilities;
        switch (discoveryCaps.ble) {
            case undefined:
                discoveryCaps.ble = this.state.ble;
                break;

            case true:
                if (!this.state.ble) {
                    discoveryCaps.ble = false;
                }
                break;
        }

        if (discoveryCaps.onIpNetwork === undefined) {
            discoveryCaps.onIpNetwork = true;
        }

        this.reactTo(this.endpoint.eventsOf(CommissioningServer).commissioned, this.#endUncommissionedMode);

        if (discoveryCaps.ble) {
            // When fabric is added, we need to allow operational discovery
            this.reactTo(this.env.get(FabricManager).events.added, this.#ensureMdnsAdvertiser);
        }

        return super.initialize();
    }

    #endUncommissionedMode() {
        if (this.internal.runtime) {
            this.internal.runtime.endUncommissionedMode();
        }
    }

    #ensureMdnsAdvertiser() {
        if (this.internal.runtime) {
            this.internal.runtime.ensureMdnsAdvertiser();
        }
    }
}

export namespace NetworkServer {
    export class Internal extends NetworkBehavior.Internal {
        declare runtime: ServerNetworkRuntime;
    }

    export class KickRestartCooldownConfig implements Partial<PeerTimingParameters["kickRestartCooldown"]> {
        @field(duration)
        addressChange?: Duration;

        @field(duration)
        connect?: Duration;
    }

    export class AddressChangeProbeCooldownConfig implements Partial<
        PeerTimingParameters["addressChangeProbeCooldown"]
    > {
        @field(duration)
        minimum?: Duration;

        @field(duration)
        maximum?: Duration;
    }

    export class TimingConfig implements DeepPartial<PeerTimingParameters> {
        @field(duration)
        defaultConnectionTimeout?: Duration;

        @field(duration)
        maxDelayBetweenInitialContactRetries?: Duration;

        @field(duration)
        delayBeforeNextAddress?: Duration;

        @field(duration)
        delayAfterNetworkError?: Duration;

        @field(duration)
        delayAfterPeerError?: Duration;

        @field(duration)
        delayAfterUnhandledError?: Duration;

        @field(duration)
        kickThrottleInterval?: Duration;

        @field(uint16)
        kickMinRetransmissions?: number;

        @field(duration)
        kickMinRestartSaving?: Duration;

        @field(KickRestartCooldownConfig)
        kickRestartCooldown?: KickRestartCooldownConfig;

        @field(duration)
        addressChangeStabilizationDelay?: Duration;

        @field(AddressChangeProbeCooldownConfig)
        addressChangeProbeCooldown?: AddressChangeProbeCooldownConfig;
    }

    export class ConcreteLimitsConfig implements Partial<NetworkProfiles.ConcreteLimits> {
        @field(uint16)
        exchanges?: number;

        @field(duration)
        delay?: Duration;

        @field(duration)
        timeout?: Duration;

        @field(duration)
        additionalMrpDelay?: Duration;
    }

    export class LimitsConfig extends ConcreteLimitsConfig {
        @field(duration)
        bdxAdditionalMrpDelay?: Duration;

        @field(ConcreteLimitsConfig)
        connect?: ConcreteLimitsConfig;

        @field(ConcreteLimitsConfig)
        probeAddress?: ConcreteLimitsConfig;
    }

    export class ProfilesConfig implements NetworkProfiles.PartialOptions {
        @field(LimitsConfig)
        fast?: LimitsConfig;

        @field(LimitsConfig)
        wifi?: LimitsConfig;

        @field(LimitsConfig)
        thread?: LimitsConfig;

        @field(LimitsConfig)
        conservative?: LimitsConfig;

        @field(LimitsConfig)
        unknown?: LimitsConfig;

        @field(LimitsConfig)
        unlimited?: LimitsConfig;

        @field(LimitsConfig)
        icdLit?: LimitsConfig;
    }

    type Mismatched<A, B> = Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>;
    type SameFields<_Mismatched extends never> = unknown;

    /**
     * The config classes above restate their source's fields because {@link field} needs real property declarations,
     * and `implements Partial<Source>` catches neither a field they fail to declare nor one the source has dropped.
     * This does: either divergence breaks the build here, naming the offending field.
     */
    export type ConfigMatchesItsSource = [
        SameFields<Mismatched<PeerTimingParameters, TimingConfig>>,
        SameFields<Mismatched<PeerTimingParameters["kickRestartCooldown"], KickRestartCooldownConfig>>,
        SameFields<Mismatched<PeerTimingParameters["addressChangeProbeCooldown"], AddressChangeProbeCooldownConfig>>,
        SameFields<Mismatched<NetworkProfiles.ConcreteLimits, ConcreteLimitsConfig>>,
        SameFields<Mismatched<NetworkProfiles.Limits, LimitsConfig>>,
        SameFields<Mismatched<NetworkProfiles.Templates, ProfilesConfig>>,
    ];

    export class State extends NetworkBehavior.State {
        listeningAddressIpv4?: string = undefined;
        listeningAddressIpv6?: string = undefined;
        ipv4 = true;
        ble?: boolean = undefined;
        discoveryCapabilities: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap> = {
            onIpNetwork: true,
        };
        subscriptionOptions?: ServerSubscriptionConfig = undefined;

        /**
         * Enable TCP transport. `true` enables both incoming (server) and outgoing (client).
         * Fine-grained control via `{ incoming?: boolean; outgoing?: boolean }`.
         * Disabled by default.
         *
         * `maxMessageSize` is the largest TCP message in bytes, without the 4-byte length header, that the node accepts.
         * The node announces it to peers as MAX_TCP_MESSAGE_SIZE.  It must be a whole number from
         * {@link MAX_UDP_MESSAGE_SIZE} to the uint32 maximum; the default is {@link DEFAULT_MAX_TCP_MESSAGE_SIZE}.
         *
         * @see {@link MatterSpecification.v161.Core} § 4.13.1
         */
        tcp?: boolean | NetworkServer.TcpConfig;

        /**
         * Preferred transport for outgoing connections. Defaults to UDP when not set.
         */
        transportPreference?: "tcp" | "udp";

        /**
         * Controller-level connection policy for commissioned peers.
         *
         * When true (default), the node auto-connects every commissioned, non-disabled peer as it goes online — the
         * right choice for a headless controller or bridge that wants all peers live.
         *
         * When false, no peer is connected on online and the consumer starts peers on demand (`ClientNode.start()` /
         * `ClientNode.enable()`).  Use this for interactive or debug controllers that manage connections themselves
         * (e.g. the nodejs shell).  This is orthogonal to per-node `ClientNode.disable()`: this flag is a controller
         * policy that leaves peers enabled, whereas disabling a peer is a persisted per-node "this node is off" state
         * (a seasonal device, say) that the bulk connect skips regardless of this flag.
         */
        autoStartCommissionedPeers = true;

        /**
         * Network profile describing our own (local) network — the sender-side MRP additive-delay
         * axis.  Defaults to "fast"; set to "thread" on a Thread device.
         */
        ownNetworkProfileId: keyof NetworkProfiles.Templates = "fast";

        @field(TimingConfig)
        timing?: TimingConfig;

        @field(ProfilesConfig)
        profiles?: ProfilesConfig;

        /**
         * Interval at which dirty client cache data is flushed to storage.  Defaults to the write-coalescing interval
         * the storage driver asks for.  Set to `Instant` to disable buffering and persist every change immediately.
         */
        @field(duration)
        clientCacheFlushInterval?: Duration = undefined;
    }

    export interface TcpConfig {
        incoming?: boolean;
        outgoing?: boolean;
        maxMessageSize?: number;
    }

    /**
     * Resolve the tcp shorthand to explicit incoming/outgoing booleans and the effective maximum message size.
     *
     * @throws ImplementationError when TCP is enabled with a `maxMessageSize` that
     * {@link SessionParameters.assertMaxTcpMessageSize} rejects
     */
    export function resolveTcpConfig(tcp?: boolean | TcpConfig): Required<TcpConfig> {
        if (tcp === true) {
            return { incoming: true, outgoing: true, maxMessageSize: DEFAULT_MAX_TCP_MESSAGE_SIZE };
        }
        if (tcp === false || tcp === undefined) {
            return { incoming: false, outgoing: false, maxMessageSize: DEFAULT_MAX_TCP_MESSAGE_SIZE };
        }
        const incoming = tcp.incoming ?? false;
        const outgoing = tcp.outgoing ?? false;
        if (!incoming && !outgoing) {
            return { incoming, outgoing, maxMessageSize: DEFAULT_MAX_TCP_MESSAGE_SIZE };
        }
        const { maxMessageSize = DEFAULT_MAX_TCP_MESSAGE_SIZE } = tcp;
        SessionParameters.assertMaxTcpMessageSize(maxMessageSize, "network.tcp.maxMessageSize");
        return { incoming, outgoing, maxMessageSize };
    }
}
