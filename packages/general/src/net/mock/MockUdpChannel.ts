/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType } from "#net/Channel.js";
import { Time } from "#time/Time.js";
import { Bytes } from "#util/Bytes.js";
import { isIPv4, isIPv6 } from "#util/Ip.js";
import { MAX_UDP_MESSAGE_SIZE, UdpChannel, UdpChannelOptions, UdpSocketType } from "../udp/UdpChannel.js";
import type { MockNetwork } from "./MockNetwork.js";
import { MockRouter } from "./MockRouter.js";

export class MockUdpChannel implements UdpChannel {
    readonly #host: MockNetwork;
    readonly #router: MockRouter;
    readonly #listeningIp?: string;
    readonly #listeningPort: number;
    readonly #type: UdpSocketType;
    readonly maxPayloadSize = MAX_UDP_MESSAGE_SIZE;

    constructor(
        network: MockNetwork,
        { listeningAddress, listeningPort, type }: UdpChannelOptions,
        interceptor?: MockRouter.Interceptor,
    ) {
        this.#router = MockRouter();
        if (interceptor) {
            this.#router.intercept(interceptor);
        }

        if (listeningAddress !== "*") {
            this.#listeningIp = listeningAddress;
        }
        this.#type = type;

        this.#host = network;
        this.#listeningPort = listeningPort ?? 1024 + Math.floor(Math.random() * 64511); // Random port 1024-65535

        network.router.add(this.#router);
    }

    onData(listener: UdpChannel.Callback) {
        const router = (packet: MockRouter.Packet) => {
            if (packet.kind !== "udp") {
                return;
            }
            if (!this.#host.shouldReceive(packet.destAddress)) {
                return;
            }
            if (
                this.#listeningIp &&
                packet.destAddress !== this.#listeningIp &&
                !this.#host.isMemberOf(packet.destAddress)
            ) {
                return;
            }
            switch (this.#type) {
                case "udp4":
                    if (!isIPv4(packet.destAddress)) {
                        return;
                    }
                    break;

                case "udp6":
                    if (!isIPv6(packet.destAddress)) {
                        return;
                    }
                    break;
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
        await Time.macrotask;

        this.#host.simulator.router({
            kind: "udp",
            sourceAddress: this.#host.defaultRoute,
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
        this.#host.addMembership(address);
    }

    dropMembership(address: string): void {
        this.#host.dropMembership(address);
    }
}
