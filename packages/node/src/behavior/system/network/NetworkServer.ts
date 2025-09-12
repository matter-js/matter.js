/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import { Ble } from "#protocol";
import { DiscoveryCapabilitiesBitmap, TypeFromPartialBitSchema } from "#types";
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

        this.reactTo(this.agent.get(CommissioningServer).events.commissioned, this.#endUncommissionedMode);

        return super.initialize();
    }

    #endUncommissionedMode() {
        if (this.internal.runtime) {
            this.internal.runtime.endUncommissionedMode();
        }
    }
}

export namespace NetworkServer {
    export class Internal extends NetworkBehavior.Internal {
        declare runtime: ServerNetworkRuntime;
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
    }
}
