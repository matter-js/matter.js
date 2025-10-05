/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType } from "#net/Channel.js";
import { isIPv4 } from "../../util/Ip.js";
import { Network, NetworkError, NetworkInterface, NetworkInterfaceDetails } from "../Network.js";
import { UdpChannelOptions } from "../udp/UdpChannel.js";
import { MockRouter } from "./MockRouter.js";
import { MockUdpChannel } from "./MockUdpChannel.js";
import type { NetworkSimulator } from "./NetworkSimulator.js";

export class MockNetwork extends Network {
    readonly router = MockRouter();
    readonly #simulator: NetworkSimulator;
    readonly #intf: NetworkInterfaceDetails;

    constructor(simulator: NetworkSimulator, mac: string, ips: string[]) {
        super();
        this.#simulator = simulator;
        this.#intf = {
            mac,
            ipV4: ips.filter(ip => isIPv4(ip)),
            ipV6: ips.filter(ip => !isIPv4(ip)),
        };
        this.#simulator.router.add(this.router);
    }

    get simulator() {
        return this.#simulator;
    }

    getNetInterfaces(): NetworkInterface[] {
        return [{ name: "fake0" }];
    }

    getIpMac(name: string): NetworkInterfaceDetails {
        if (name !== "fake0") {
            throw new NetworkError(`No such interface ${name}`);
        }
        return this.#intf;
    }

    override createUdpChannel(options: UdpChannelOptions) {
        return Promise.resolve(new MockUdpChannel(this, options));
    }

    supports(type: ChannelType, _address: string) {
        return type === ChannelType.UDP;
    }

    override async close() {
        this.#simulator.router.delete(this.router);
    }
}
