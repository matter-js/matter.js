/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import { Duration, Logger } from "@matter/general";
import { duration, field, uint16 } from "@matter/model";
import { Ble, FabricManager, NetworkProfiles, PeerTimingParameters } from "@matter/protocol";
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
    declare state: NetworkServer.State;
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

    export class TimingConfig implements Partial<PeerTimingParameters> {
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
        minimumTimeBetweenMrpKicks?: Duration;
    }

    export class ConcreteLimitsConfig implements Partial<NetworkProfiles.ConcreteLimits> {
        @field(uint16)
        exchanges?: number;

        @field(duration)
        delay?: Duration;

        @field(duration)
        timeout?: Duration;
    }

    export class LimitsConfig extends ConcreteLimitsConfig {
        @field(ConcreteLimitsConfig)
        connect?: ConcreteLimitsConfig;
    }

    export class ProfilesConfig implements NetworkProfiles.PartialOptions {
        @field(LimitsConfig)
        fast?: LimitsConfig;

        @field(LimitsConfig)
        thread?: LimitsConfig;

        @field(LimitsConfig)
        conservative?: LimitsConfig;

        @field(LimitsConfig)
        unlimited?: LimitsConfig;
    }

    export class State extends NetworkBehavior.State {
        listeningAddressIpv4?: string = undefined;
        listeningAddressIpv6?: string = undefined;
        ipv4 = true;
        ble?: boolean = undefined;
        discoveryCapabilities: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap> = {
            onIpNetwork: true,
        };
        subscriptionOptions?: ServerSubscriptionConfig = undefined;

        @field(TimingConfig)
        timing?: TimingConfig;

        @field(ProfilesConfig)
        profiles?: ProfilesConfig;
    }
}
