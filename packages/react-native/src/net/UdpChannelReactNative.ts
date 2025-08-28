/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import dgram from "react-native-udp";

import {
    Bytes,
    ChannelType,
    Diagnostic,
    isIPv4,
    isIPv6,
    Logger,
    MAX_UDP_MESSAGE_SIZE,
    NetworkError,
    NoAddressAvailableError,
    repackErrorAs,
    UdpChannel,
    UdpChannelOptions,
    UdpSocketType,
} from "#general";
import { Platform } from "react-native";
import { NetworkReactNative } from "./NetworkReactNative.js";

const logger = Logger.get("UdpChannelNode");

// Move out some dram types not available in react-native-udp
// TODO find a way to clean that up once anything is working
interface RemoteInfo {
    address: string;
    family: "IPv4" | "IPv6";
    port: number;
    size: number;
}

interface SocketOptions {
    type: UdpSocketType;
    reuseAddr?: boolean | undefined;
    /**
     * @default false
     */
    ipv6Only?: boolean | undefined;
    recvBufferSize?: number | undefined;
    sendBufferSize?: number | undefined;
    lookup?:
        | ((
              hostname: string,
              options: any,
              callback: (err: Error | null, address: string, family: number) => void,
          ) => void)
        | undefined;
}

interface Socket {
    setBroadcast(flag: boolean): void;
    setMulticastInterface(interfaceAddress: string): void; // Not implemented
    addMembership(multicastAddress: string, multicastInterface?: string): void;
    dropMembership(multicastAddress: string, multicastInterface?: string): void;
    on(event: "message", listener: (msg: Bytes, rinfo: RemoteInfo) => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    removeListener(event: "message", listener: (msg: Bytes, rinfo: RemoteInfo) => void): void;
    removeListener(event: "error", listener: (error: Error) => void): void;
    send(
        msg: Bytes,
        offset: number,
        length: number,
        port: number,
        address: string,
        callback: (error: Error | null) => void,
    ): void;
    close(): void;
    address(): { address: string; port: number };
}

function createDgramSocket(host: string | undefined, port: number | undefined, options: SocketOptions) {
    // @ts-expect-error default types are strange
    const socket = dgram.createSocket({
        ...options,
        reusePort: options.reuseAddr,
    });
    return new Promise<Socket>((resolve, reject) => {
        const handleBindError = (error: Error) => {
            try {
                socket.close();
            } catch (error) {
                logger.debug("Error on closing socket", error);
            }
            reject(error);
        };
        socket.on("error", handleBindError);
        socket.bind(port, host, (error: any) => {
            if (error) return;
            const { address: localHost, port: localPort } = socket.address();
            logger.debug(
                "Socket created and bound ",
                Diagnostic.dict({
                    remoteAddress: `${host}:${port}`,
                    localAddress: `${localHost}:${localPort}`,
                }),
            );
            socket.removeListener("error", handleBindError);
            socket.on("error", (error: Error) => logger.error(error));
            resolve(socket);
        });
    });
}

export class UdpChannelReactNative implements UdpChannel {
    readonly #type: UdpSocketType;
    readonly #socket: Socket;
    readonly #netInterface?: string;

    static async create({ listeningPort, type, listeningAddress, netInterface }: UdpChannelOptions) {
        const socketOptions: SocketOptions = { type, reuseAddr: true };
        if (type === "udp6") {
            socketOptions.ipv6Only = true;
        }
        const socket = await createDgramSocket(listeningAddress, listeningPort, socketOptions);
        if (Platform.OS !== "android") {
            socket.setBroadcast(true);
        }

        let netInterfaceZone: string | undefined;
        if (netInterface !== undefined) {
            netInterfaceZone = netInterface;
            let multicastInterface: string | undefined;
            if (type === "udp4") {
                multicastInterface = await NetworkReactNative.getMulticastInterfaceIpv4(netInterface);
                if (multicastInterface === undefined) {
                    throw new NoAddressAvailableError(`No IPv4 addresses on interface "${netInterface}"`);
                }
            } else {
                // announce ignoring the multicast interface, so selected by the OS
                // originally was: `::%${netInterfaceZone}`
                multicastInterface = "::";
            }
            logger.debug(
                "Initialize multicast",
                Diagnostic.dict({
                    type: type,
                    address: `${multicastInterface}:${listeningPort}`,
                    interface: netInterface,
                }),
            );
            socket.setMulticastInterface(multicastInterface);
        }
        return new UdpChannelReactNative(type, socket, netInterfaceZone);
    }

    readonly maxPayloadSize = MAX_UDP_MESSAGE_SIZE;

    constructor(type: UdpSocketType, socket: Socket, netInterface?: string) {
        this.#type = type;
        this.#socket = socket;
        this.#netInterface = netInterface;
    }

    async addMembership(membershipAddress: string) {
        const multicastInterfaces = await NetworkReactNative.getMembershipMulticastInterfaces(
            this.#netInterface,
            this.#type === "udp4",
        );
        for (const multicastInterface of multicastInterfaces) {
            try {
                this.#socket.addMembership(membershipAddress, multicastInterface);
            } catch (error) {
                logger.warn(
                    `Error adding membership for address ${membershipAddress}${
                        multicastInterface ? ` with interface ${multicastInterface}` : ""
                    }: ${error}`,
                );
            }
        }
    }

    async dropMembership(membershipAddress: string) {
        const multicastInterfaces = await NetworkReactNative.getMembershipMulticastInterfaces(
            this.#netInterface,
            this.#type === "udp4",
        );
        for (const multicastInterface of multicastInterfaces) {
            try {
                this.#socket.dropMembership(membershipAddress, multicastInterface);
            } catch (error) {
                logger.warn(
                    `Error removing membership for address ${membershipAddress}${
                        multicastInterface ? ` with interface ${multicastInterface}` : ""
                    }: ${error}`,
                );
            }
        }
    }

    onData(listener: (netInterface: string | undefined, peerAddress: string, peerPort: number, data: Bytes) => void) {
        const messageListener = async (data: Bytes, { address, port }: RemoteInfo) => {
            const netInterface = this.#netInterface ?? (await NetworkReactNative.getNetInterfaceForIp(address));
            listener(netInterface, address, port, data);
        };

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.#socket.on("message", messageListener);
        return {
            close: async () => {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                this.#socket.removeListener("message", messageListener);
            },
        };
    }

    async send(host: string, port: number, data: Bytes) {
        return new Promise<void>((resolve, reject) => {
            this.#socket.send(data, 0, data.byteLength, port, host, error => {
                if (error) {
                    reject(repackErrorAs(error, NetworkError) as Error);
                    return;
                }
                resolve();
            });
        });
    }

    async close() {
        try {
            this.#socket.close();
        } catch (error) {
            logger.debug("Error on closing socket", error);
        }
    }

    get port() {
        return this.#socket.address().port;
    }

    supports(type: ChannelType, address?: string) {
        if (type !== ChannelType.UDP) {
            return false;
        }

        if (address === undefined) {
            return true;
        }

        if (this.#type === "udp4") {
            return isIPv4(address);
        }

        return isIPv6(address);
    }
}
