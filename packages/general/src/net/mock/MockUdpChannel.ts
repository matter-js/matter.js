/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType } from "#net/Channel.js";
import { Bytes } from "#util/Bytes.js";
import { NetworkError } from "../Network.js";
import { MAX_UDP_MESSAGE_SIZE, UdpChannel, UdpChannelOptions } from "../udp/UdpChannel.js";
import type { MockNetwork } from "./MockNetwork.js";
import { MockRouter } from "./MockRouter.js";

export class MockUdpChannel implements UdpChannel {
    readonly #host: MockNetwork;
    readonly #router: MockRouter;
    readonly #sendFrom: string;
    readonly #receiveFrom: Set<string>;
    readonly #listeningPort: number;
    readonly maxPayloadSize = MAX_UDP_MESSAGE_SIZE;

    constructor(
        network: MockNetwork,
        { listeningAddress, listeningPort, netInterface, type }: UdpChannelOptions,
        packetManipulator?: MockRouter.PacketManipulator,
    ) {
        this.#router = MockRouter(packetManipulator);
        const { ipV4, ipV6 } = network.getIpMac(netInterface ?? "fake0");
        let addresses = type === "udp4" ? ipV4 : ipV6;

        this.#sendFrom = addresses[0];

        if (listeningAddress !== undefined && listeningAddress !== "*") {
            addresses = addresses.filter(addr => addr === listeningAddress);
        }

        if (!addresses.length) {
            throw new NetworkError(`No ${type} IP matches ${listeningAddress ?? "*"} on the specified interface`);
        }

        this.#host = network;
        this.#receiveFrom = new Set(addresses);
        this.#listeningPort = listeningPort ?? 1024 + Math.floor(Math.random() * 64511); // Random port 1024-65535

        network.router.add(this.#router);
    }

    onData(listener: UdpChannel.Callback) {
        const router = (packet: MockRouter.Packet) => {
            if (packet.kind !== "udp") {
                return;
            }
            if (!this.#receiveFrom.has(packet.destAddress)) {
                return;
            }
            if (packet.destPort !== this.#listeningPort) {
                return;
            }
            listener("fake0", packet.sourceAddress, packet.sourcePort, packet.payload);
        };

        this.#router.add(router);

        return {
            close: async () => {
                this.#router.delete(router);
            },
        };
    }

    async send(host: string, port: number, payload: Bytes) {
        this.#host.simulator.router({
            kind: "udp",
            sourceAddress: this.#sendFrom,
            sourcePort: this.#listeningPort,
            destAddress: host,
            destPort: port,
            payload,
        });
    }

    async close() {
        this.#host.router.delete(this.#router);
    }

    async [Symbol.asyncDispose]() {
        return this.close();
    }

    get port() {
        return this.#listeningPort;
    }

    supports(type: ChannelType, _address: string) {
        return type === ChannelType.UDP;
    }

    addMembership(address: string): void {
        this.#receiveFrom.add(address);
    }

    dropMembership(address: string): void {
        this.#receiveFrom.delete(address);
    }
}
