/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType } from "#net/Channel.js";
import { isIPv4 } from "../../util/Ip.js";
import { Network, NetworkError, NetworkInterface, NetworkInterfaceDetails } from "../Network.js";
import type { TcpServerOptions, TcpServerSocket, TcpSocket } from "../tcp/TcpSocket.js";
import { UdpChannelOptions } from "../udp/UdpChannel.js";
import { MockRouter } from "./MockRouter.js";
import { MockTcpServer } from "./MockTcpServer.js";
import { MockUdpChannel } from "./MockUdpChannel.js";
import type { NetworkSimulator } from "./NetworkSimulator.js";

export class MockNetwork extends Network {
    readonly router = MockRouter();
    readonly #simulator: NetworkSimulator;
    readonly #intf: NetworkInterfaceDetails;
    #defaultRoute?: string;
    readonly #ips: Set<string>;
    readonly #multicastIps = new Set<string>();
    readonly #tcpServers = new Map<number, MockTcpServer>();

    constructor(simulator: NetworkSimulator, mac: string, ips: string[]) {
        super();
        this.#simulator = simulator;
        this.#ips = new Set(ips);
        const self = this;

        this.#intf = {
            mac,

            get ipV4() {
                return [...self.#ips].filter(ip => isIPv4(ip));
            },

            get ipV6() {
                return [...self.#ips].filter(ip => !isIPv4(ip));
            },
        };

        this.#simulator.router.add(this.router);
    }

    get simulator() {
        return this.#simulator;
    }

    addAddr(...ips: string[]) {
        for (const ip of ips) {
            this.#ips.add(ip);
        }
    }

    deleteAddr(...ips: string[]) {
        for (const ip of ips) {
            this.#ips.delete(ip);
        }
    }

    addMembership(...multicastIps: string[]) {
        for (const ip of multicastIps) {
            this.#multicastIps.add(ip);
        }
    }

    dropMembership(...multicastIps: string[]) {
        for (const ip of multicastIps) {
            this.#multicastIps.delete(ip);
        }
    }

    isMemberOf(multicastIp: string) {
        return this.#multicastIps.has(multicastIp);
    }

    shouldReceive(ip: string) {
        return this.#ips.has(ip) || this.#multicastIps.has(ip);
    }

    set defaultRoute(ip: string | undefined) {
        this.#defaultRoute = ip;
    }

    get defaultRoute(): string {
        const ip = this.#defaultRoute ?? this.#ips[Symbol.iterator]().next().value;
        if (ip === undefined) {
            throw new Error("No default route");
        }
        return ip;
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

    override createTcpServer(options: TcpServerOptions): Promise<TcpServerSocket> {
        return Promise.resolve(new MockTcpServer(this, options));
    }

    override async connectTcp(host: string, port: number): Promise<TcpSocket> {
        // Find the MockNetwork that owns the target address
        const targetNetwork = this.#simulator.findNetwork(host);
        if (!targetNetwork) {
            throw new NetworkError(`No mock network hosts address ${host}`);
        }

        const server = targetNetwork.#tcpServers.get(port);
        if (!server) {
            throw new NetworkError(`No TCP server listening on ${host}:${port}`);
        }

        const clientPort = 1024 + Math.floor(Math.random() * 64511);
        return server.accept(this.defaultRoute, clientPort);
    }

    registerTcpServer(server: MockTcpServer) {
        this.#tcpServers.set(server.port, server);
    }

    unregisterTcpServer(port: number) {
        this.#tcpServers.delete(port);
    }

    supports(type: ChannelType, _address: string) {
        return type === ChannelType.UDP || type === ChannelType.TCP;
    }

    override async close() {
        this.#simulator.router.delete(this.router);
    }
}
