/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AddressInUseError,
    BindError,
    Bytes,
    ChannelType,
    createPromise,
    Diagnostic,
    ImplementationError,
    isIPv4,
    isIPv6,
    Lifetime,
    Logger,
    MAX_UDP_MESSAGE_SIZE,
    Millis,
    NetworkError,
    NoAddressAvailableError,
    repackErrorAs,
    Seconds,
    Time,
    UdpChannel,
    UdpChannelOptions,
    UdpSocketType,
} from "#general";
import { RetransmissionLimitReachedError } from "#protocol";
import * as dgram from "node:dgram";
import { NodeJsNetwork } from "./NodeJsNetwork.js";

const logger = Logger.get("NodejsChannel");

// UDP should be sent out in some ms so if we needed 1s+, we have a problem
// 1s should be fine because we do not require any DNS lookups because we usually work with IPs directly
const UDP_SEND_TIMEOUT_CHECK_INTERVAL = Seconds.one;

function createDgramSocket(host: string | undefined, port: number | undefined, options: dgram.SocketOptions) {
    const socket = dgram.createSocket(options);
    return new Promise<dgram.Socket>((resolve, reject) => {
        const handleBindError = (error: Error) => {
            try {
                socket.close();
            } catch (error) {
                logger.debug("Error closing socket:", error);
            }

            const code = (error as unknown as { code: string })?.code;
            let desc = `${host ? host : options.type === "udp4" ? "0.0.0.0" : "{::}"}`;
            if (port !== undefined) {
                desc = `${desc}:${port}`;
            }
            switch (code) {
                case "EADDRINUSE":
                    error = new AddressInUseError(`Cannot bind ${desc} because port is already in use`);
                    break;

                default:
                    error = new BindError(`Cannot bind to ${desc} (code ${code})`);
                    break;
            }
            reject(error);
        };
        socket.on("error", handleBindError);
        socket.bind(port, host, () => {
            const { address: localHost, port: localPort } = socket.address();
            logger.debug(
                "Socket created and bound ",
                Diagnostic.dict({
                    remoteAddress: `${host}:${port}`,
                    localAddress: `${localHost}:${localPort}`,
                }),
            );
            socket.removeListener("error", handleBindError);
            socket.on("error", error => logger.error(error));

            resolve(socket);
        });
    });
}

export class NodeJsUdpChannel implements UdpChannel {
    readonly #lifetime: Lifetime;
    readonly #type: UdpSocketType;
    readonly #socket: dgram.Socket;
    readonly #netInterface: string | undefined;

    static async create({
        lifetime: lifetimeOwner,
        listeningPort,
        type,
        listeningAddress,
        netInterface,
        reuseAddress,
    }: UdpChannelOptions) {
        const name = `${listeningAddress?.includes(":") ? `[${listeningAddress}]` : (listeningAddress ?? "*")}:${listeningPort}`;
        using lifetime = (lifetimeOwner ?? Lifetime.process).join("socket", Diagnostic.strong(name));
        lifetime.details.intf = netInterface;

        let dgramType: "udp4" | "udp6";
        switch (type) {
            case "udp":
            case "udp6":
                dgramType = "udp6";
                break;

            case "udp4":
                dgramType = "udp4";
                break;

            default:
                throw new ImplementationError(`Unrecognized UDP socket type ${type}`);
        }

        const socketOptions: dgram.SocketOptions = { type: dgramType };
        if (type === "udp6") {
            socketOptions.ipv6Only = true;
        }

        if (reuseAddress) {
            socketOptions.reuseAddr = true;
        }

        let socket;
        {
            using _creating = lifetime.join("creating");
            socket = await createDgramSocket(listeningAddress, listeningPort, socketOptions);
        }

        socket.setBroadcast(true);
        let netInterfaceZone: string | undefined;
        if (netInterface !== undefined) {
            netInterfaceZone = NodeJsNetwork.getNetInterfaceZoneIpv6(netInterface);
            let multicastInterface: string | undefined;
            if (type === "udp4") {
                multicastInterface = NodeJsNetwork.getMulticastInterfaceIpv4(netInterface);
                if (multicastInterface === undefined) {
                    throw new NoAddressAvailableError(`No IPv4 addresses on interface "${netInterface}"`);
                }
            } else {
                if (netInterfaceZone === undefined) {
                    throw new NoAddressAvailableError(`No IPv6 addresses on interface "${netInterface}"`);
                }
                multicastInterface = `::%${netInterfaceZone}`;
            }
            logger.debug(
                "Initialize multicast",
                Diagnostic.dict({
                    address: `${multicastInterface}:${listeningPort}`,
                    interface: netInterface,
                    type: type,
                }),
            );
            socket.setMulticastInterface(multicastInterface);
        }
        return new NodeJsUdpChannel(lifetime, type, socket, netInterfaceZone);
    }

    readonly maxPayloadSize = MAX_UDP_MESSAGE_SIZE;

    /**
     * Timer for a maximum interval to check for dangling send calls that are not completed.
     * The way it is implemented we ensure that any "send" is rejected latest after < 2s
     */
    readonly #sendTimer = Time.getTimer("UDPChannel.send timeout check", UDP_SEND_TIMEOUT_CHECK_INTERVAL, () =>
        this.#rejectDanglingSends(),
    );
    readonly #sendsInProgress = new Map<Promise<void>, { sendMs: number; rejecter: (reason?: any) => void }>();

    constructor(lifetime: Lifetime, type: UdpSocketType, socket: dgram.Socket, netInterface?: string) {
        this.#lifetime = lifetime;
        this.#type = type;
        this.#socket = socket;
        this.#netInterface = netInterface;
    }

    addMembership(membershipAddress: string) {
        const multicastInterfaces = NodeJsNetwork.getMembershipMulticastInterfaces(
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

    dropMembership(membershipAddress: string) {
        const multicastInterfaces = NodeJsNetwork.getMembershipMulticastInterfaces(
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
        const messageListener = (data: Bytes, { address, port }: dgram.RemoteInfo) => {
            const netInterface = this.#netInterface ?? NodeJsNetwork.getNetInterfaceForIp(address);
            listener(netInterface, address, port, data);
        };

        this.#socket.on("message", messageListener);
        return {
            close: async () => {
                this.#socket.removeListener("message", messageListener);
            },
        };
    }

    /**
     * At minimum once every second we check for dangling sends that are not completed. That means that a dangling send
     * is removed very latest after <2s.
     */
    #rejectDanglingSends() {
        if (this.#sendsInProgress.size === 0) {
            // nothing to do
            return;
        }
        const now = Time.nowMs;
        for (const [promise, { sendMs, rejecter }] of this.#sendsInProgress) {
            const elapsed = Millis(now - sendMs);
            if (elapsed >= UDP_SEND_TIMEOUT_CHECK_INTERVAL) {
                this.#sendsInProgress.delete(promise);
                rejecter(new NetworkError("UDP send timeout"));
            }
        }
        if (this.#sendsInProgress.size > 0) {
            this.#sendTimer.start();
        }
    }

    async send(host: string, port: number, data: Bytes) {
        const { promise, resolver, rejecter } = createPromise<void>();

        const rejectOrResolve = (error?: Error | null) => {
            if (!this.#sendsInProgress.has(promise)) {
                // promise already removed, so already handled
                return;
            }
            this.#sendsInProgress.delete(promise);
            if (!error) {
                resolver();
            } else {
                const netError =
                    "code" in error && error.code === "EHOSTUNREACH"
                        ? repackErrorAs(
                              error,
                              // TODO - this is a routing error; current error indicates timeout and is defined
                              //        in higher-level module (MessageExchange)
                              RetransmissionLimitReachedError,
                          )
                        : repackErrorAs(error, NetworkError);
                rejecter(netError);
            }
        };

        this.#sendsInProgress.set(promise, { sendMs: Time.nowMs, rejecter });
        if (!this.#sendTimer.isRunning) {
            this.#sendTimer.start();
        }
        try {
            this.#socket.send(Bytes.of(data), port, host, error => rejectOrResolve(error));
        } catch (error) {
            rejectOrResolve(repackErrorAs(error, NetworkError));
        }

        return promise;
    }

    async close() {
        using _closing = this.#lifetime.closing();
        try {
            await new Promise<void>(resolve => this.#socket.close(resolve));
        } catch (error) {
            if (!(error instanceof Error) || error.message !== "Not running") {
                logger.debug("Error on closing socket", error);
            }
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

        // TODO - we currently only discriminate based on protocol type.  We should also determine whether the address subnet is correct

        if (this.#type === "udp4") {
            return isIPv4(address);
        }

        return isIPv6(address);
    }
}
