/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, ChannelType, IpNetworkChannel } from "#net/Channel.js";
import { ConnectionlessTransport } from "#net/ConnectionlessTransport.js";
import { Network, NetworkError } from "#net/Network.js";
import { Bytes } from "#util/Bytes.js";
import { ServerAddress, ServerAddressUdp } from "../ServerAddress.js";
import { UdpChannel } from "./UdpChannel.js";

export class UdpInterface implements ConnectionlessTransport {
    readonly #server: UdpChannel;

    static async create(network: Network, type: "udp4" | "udp6", port?: number, host?: string, netInterface?: string) {
        return new UdpInterface(
            await network.createUdpChannel({ listeningPort: port, type, netInterface, listeningAddress: host }),
        );
    }

    constructor(server: UdpChannel) {
        this.#server = server;
    }

    protected get server() {
        return this.#server;
    }

    supports(type: ChannelType, address: string) {
        return this.#server.supports(type, address);
    }

    async openChannel(address: ServerAddress) {
        if (address.type !== "udp") {
            throw new NetworkError(`Unsupported address type ${address.type}`);
        }
        const { ip, port } = address;
        return Promise.resolve(new UdpConnection(this.#server, ip, port));
    }

    onData(listener: (channel: Channel<Bytes>, messageBytes: Bytes) => void): ConnectionlessTransport.Listener {
        return this.#server.onData((_netInterface, peerHost, peerPort, data) =>
            listener(new UdpConnection(this.#server, peerHost, peerPort), data),
        );
    }

    get port() {
        return this.#server.port;
    }

    close() {
        return this.#server.close();
    }

    addMembership(address: string) {
        return this.#server.addMembership(address);
    }

    dropMembership(address: string) {
        return this.#server.dropMembership(address);
    }
}

export class UdpConnection implements IpNetworkChannel<Bytes> {
    readonly isReliable = false;
    readonly supportsLargeMessages = false;
    readonly type = ChannelType.UDP;
    readonly #server: UdpChannel;
    readonly #peerAddress: string;
    readonly #peerPort: number;

    constructor(server: UdpChannel, peerAddress: string, peerPort: number) {
        this.#server = server;
        this.#peerAddress = peerAddress;
        this.#peerPort = peerPort;
    }

    get maxPayloadSize() {
        return this.#server.maxPayloadSize;
    }

    send(data: Bytes) {
        return this.#server.send(this.#peerAddress, this.#peerPort, data);
    }

    get name() {
        return `${this.type}://[${this.#peerAddress}]:${this.#peerPort}`;
    }

    get networkAddress(): ServerAddressUdp {
        return { type: "udp", ip: this.#peerAddress, port: this.#peerPort };
    }

    async close() {
        // UDP is connectionless, so nothing to do here
    }
}
