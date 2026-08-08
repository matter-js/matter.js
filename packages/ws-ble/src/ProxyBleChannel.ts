/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ChannelType,
    createPromise,
    InternalError,
    Logger,
    NetworkError,
    Seconds,
    ServerAddress,
    Time,
    withTimeout,
    type Channel,
    type Transport,
} from "@matter/general";
import { BleChannel, BleError, BtpCodec, BtpFlowError, BtpSessionHandler, MatterBle } from "@matter/protocol";
import type { BleProxyHandler } from "./BleProxyHandler.js";
import { BinaryFrameOpcode, BleProxyCommand, BleProxyEvent, type BinaryFrame } from "./BleProxyProtocol.js";
import type { ProxyBleScanner } from "./ProxyBleScanner.js";

const logger = Logger.get("ProxyBleChannel");

/**
 * BTP handshake response identification bytes.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.19.3.2
 */
const BTP_HANDSHAKE_RESPONSE_OPCODE_1 = 0x65;
const BTP_HANDSHAKE_RESPONSE_OPCODE_2 = 0x6c;
const BTP_HANDSHAKE_RESPONSE_LENGTH = 6;

/** Channel teardown must not stall on an unresponsive proxy client, so the courtesy Disconnect is bounded. */
const DISCONNECT_TIMEOUT = Seconds(5);

/**
 * Normalize any UUID form sent by a proxy client to the canonical dashed-uppercase form used by Matter's
 * {@link MatterBle} constants.  Different BLE proxy clients deliver different formats:
 *
 *   - noble: 32 lowercase hex chars, no dashes ("18ee2ef5263d4559959f4f9c429f9d11")
 *   - generic: dashed form, either case ("18EE2EF5-263D-4559-959F-4F9C429F9D11")
 *
 * Both produce the same canonical string so command handlers stay format-agnostic.  The 16-bit short form ("fff6")
 * is only uppercased, which is what {@link MatterBle.isServiceUuid} expects for service UUIDs.
 */
export function toCanonicalUuid(uuid: string): string {
    const upper = uuid.toUpperCase();
    if (upper.length === 32) {
        return [
            upper.substring(0, 8),
            upper.substring(8, 12),
            upper.substring(12, 16),
            upper.substring(16, 20),
            upper.substring(20, 32),
        ].join("-");
    }
    return upper;
}

/**
 * {@link Transport} that opens BLE channels through the proxy WebSocket.
 */
export class ProxyBleCentralInterface implements Transport {
    readonly #bleScanner: ProxyBleScanner;
    readonly #handler: BleProxyHandler;
    #onMatterMessageListener: ((socket: Channel<Bytes>, data: Bytes) => void) | undefined;
    #closed = false;

    constructor(bleScanner: ProxyBleScanner, handler: BleProxyHandler) {
        this.#bleScanner = bleScanner;
        this.#handler = handler;
    }

    async openChannel(address: ServerAddress): Promise<Channel<Bytes>> {
        if (this.#closed) {
            throw new NetworkError("Network interface is closed");
        }
        if (!ServerAddress.isBle(address)) {
            throw new InternalError(`Unsupported address type for BLE channel.`);
        }
        if (this.#onMatterMessageListener === undefined) {
            throw new InternalError("Network Interface was not added to the system yet.");
        }

        const { peripheralAddress } = address;

        const connection = this.#handler.getOwner(peripheralAddress);
        if (!connection) {
            throw new BleError(`No connected BLE proxy client owns peripheral ${peripheralAddress}`);
        }

        const discovered = this.#bleScanner.getDiscoveredDevice(peripheralAddress);
        const { hasAdditionalAdvertisementData } = discovered;
        const rssi = discovered.peripheral.rssi;

        logger.debug(`Connecting to peripheral ${peripheralAddress} (rssi=${rssi ?? "n/a"}) via proxy`);

        const { connection_handle, mtu: peripheralMtu } = await connection.sendCommand(BleProxyCommand.Connect, {
            address: peripheralAddress,
        });

        const mtu = MatterBle.btpSegmentSizeFromAttMtu(peripheralMtu ?? 0);
        logger.info(
            `Connected to ${peripheralAddress}, handle=${connection_handle}, BTP segment size=${mtu} bytes (peripheral ATT_MTU up to ${peripheralMtu ?? "n/a"}), rssi=${rssi ?? "n/a"}`,
        );

        // The owner connection's observables outlive a failed open; a leaked observer would corrupt the next channel on
        // the same connection.  Detach on every exit path; assigned once registered.
        let detachObservers: (() => void) | undefined;

        try {
            const { services } = await connection.sendCommand(BleProxyCommand.DiscoverServices, {
                connection_handle,
            });

            const matterService = services.find(s => MatterBle.isServiceUuid(toCanonicalUuid(s.uuid)));
            if (!matterService) {
                throw new BleError(`Peripheral ${peripheralAddress} does not have Matter BLE service`);
            }

            const { characteristics } = await connection.sendCommand(BleProxyCommand.DiscoverCharacteristics, {
                connection_handle,
                service_uuid: matterService.uuid,
            });

            let c1Uuid: string | undefined;
            let c2Uuid: string | undefined;
            let c3Uuid: string | undefined;

            for (const char of characteristics) {
                const canonical = toCanonicalUuid(char.uuid);
                if (canonical === MatterBle.C1_CHARACTERISTIC_UUID) {
                    c1Uuid = char.uuid;
                } else if (canonical === MatterBle.C2_CHARACTERISTIC_UUID) {
                    c2Uuid = char.uuid;
                } else if (canonical === MatterBle.C3_CHARACTERISTIC_UUID) {
                    c3Uuid = char.uuid;
                }
            }

            if (!c1Uuid || !c2Uuid) {
                throw new BleError(`Peripheral ${peripheralAddress} missing required Matter characteristics (C1/C2)`);
            }

            if (c3Uuid && hasAdditionalAdvertisementData) {
                logger.debug(`Reading additional commissioning data from C3`);
                await connection.sendCommand(BleProxyCommand.ReadCharacteristic, {
                    connection_handle,
                    characteristic_uuid: c3Uuid,
                });
            }

            // Register the handshake observer BEFORE sending: the C2 indication is a separate binary frame that can
            // beat the WriteAndSubscribe response, and binaryFrameReceived drops frames emitted with no listener
            // attached.
            const {
                promise: handshakePromise,
                resolver: handshakeResolver,
                rejecter: handshakeRejecter,
            } = createPromise<Uint8Array>();

            const btpHandshakeTimeout = Time.getTimer(
                "BLE proxy handshake timeout",
                MatterBle.BTP_CONN_RSP_TIMEOUT,
                () => {
                    handshakeRejecter(new BleError(`BTP handshake response not received from ${peripheralAddress}`));
                },
            ).start();

            const handshakeObserver = (frame: BinaryFrame) => {
                if (frame.handle === connection_handle && frame.opcode === BinaryFrameOpcode.Notification) {
                    const data = new Uint8Array(frame.payload);
                    if (
                        data[0] === BTP_HANDSHAKE_RESPONSE_OPCODE_1 &&
                        data[1] === BTP_HANDSHAKE_RESPONSE_OPCODE_2 &&
                        data.length === BTP_HANDSHAKE_RESPONSE_LENGTH
                    ) {
                        btpHandshakeTimeout.stop();
                        handshakeResolver(data);
                    }
                }
            };
            connection.binaryFrameReceived.on(handshakeObserver);

            let handshakeResponse: Uint8Array;
            try {
                // Write C1 and subscribe C2 atomically so the peripheral can't fire its indication before
                // notifications are enabled (no round-trip between Write Response and CCCD enable).
                const btpHandshakeRequest = BtpCodec.encodeBtpHandshakeRequest({
                    versions: MatterBle.BTP_SUPPORTED_VERSIONS,
                    attMtu: mtu,
                    clientWindowSize: MatterBle.BTP_MAXIMUM_WINDOW_SIZE,
                });
                logger.debug(`Sending BTP handshake request on C1 and subscribing C2 atomically`);

                // Await both together, not sequentially: the handshake timer can reject handshakePromise while the
                // write is still pending, and Promise.all keeps a handler on it from the start so that rejection
                // surfaces here instead of escaping as an unhandled rejection.
                const writeAndSubscribe = connection.sendCommand(BleProxyCommand.WriteAndSubscribe, {
                    connection_handle,
                    write_uuid: c1Uuid,
                    write_value: Bytes.toBase64(btpHandshakeRequest),
                    write_response: true,
                    subscribe_uuid: c2Uuid,
                });
                [, handshakeResponse] = await Promise.all([writeAndSubscribe, handshakePromise]);
            } finally {
                connection.binaryFrameReceived.off(handshakeObserver);
                btpHandshakeTimeout.stop();
            }

            // Register the live observer BEFORE creating the session (same non-buffering frame race as the handshake
            // observer above); frames seen before the session exists are buffered, then flushed once it exists.
            const onMatterMessageListener = this.#onMatterMessageListener;
            const channelRef: { channel?: ProxyBleChannel } = {};
            const sessionRef: { session?: BtpSessionHandler } = {};
            const earlyFrames = new Array<Uint8Array>();

            const forwardToBtp = (payload: Uint8Array) => {
                sessionRef.session
                    ?.handleIncomingBleData(payload)
                    .catch(error =>
                        logger.warn(`Peripheral ${peripheralAddress}: Error handling incoming BLE data`, error),
                    );
            };

            const binaryObserver = (frame: BinaryFrame) => {
                if (frame.handle === connection_handle && frame.opcode === BinaryFrameOpcode.Notification) {
                    const payload = new Uint8Array(frame.payload);
                    if (sessionRef.session) {
                        forwardToBtp(payload);
                    } else {
                        earlyFrames.push(payload);
                    }
                }
            };
            connection.binaryFrameReceived.on(binaryObserver);
            detachObservers = () => connection.binaryFrameReceived.off(binaryObserver);

            const btpSession = await BtpSessionHandler.createAsCentral(
                handshakeResponse,
                async (data: Bytes) => {
                    connection.sendBinaryFrame(BinaryFrameOpcode.WriteData, connection_handle, Bytes.of(data));
                },
                async () => {
                    if (!channelRef.channel?.connected) return;
                    logger.debug(`Disconnecting from ${peripheralAddress} via proxy`);
                    try {
                        await withTimeout(
                            DISCONNECT_TIMEOUT,
                            connection.sendCommand(BleProxyCommand.Disconnect, { connection_handle }),
                        );
                    } catch (error) {
                        logger.debug(
                            `Peripheral ${peripheralAddress}: Error sending Disconnect to proxy client`,
                            error,
                        );
                    }
                },
                async (data: Bytes) => {
                    if (channelRef.channel) {
                        channelRef.channel.pushMessage(data);
                        onMatterMessageListener(channelRef.channel, data);
                    }
                },
            );
            sessionRef.session = btpSession;

            for (const payload of earlyFrames) {
                forwardToBtp(payload);
            }
            earlyFrames.length = 0;

            const eventObserver = (event: string, data: Record<string, unknown>) => {
                if (
                    event === BleProxyEvent.Disconnected &&
                    typeof data.connection_handle === "number" &&
                    data.connection_handle === connection_handle
                ) {
                    logger.info(`Peripheral ${peripheralAddress} disconnected unexpectedly`);
                    channelRef.channel?.markDisconnected();
                    channelRef.channel
                        ?.close()
                        .catch(error => logger.debug(`Peripheral ${peripheralAddress}: Error closing channel`, error));
                }
            };
            connection.eventReceived.on(eventObserver);

            // The Disconnected event covers one peripheral; this covers the whole owning client vanishing
            const ownerClosedObserver = () => {
                logger.info(`Owning proxy client for ${peripheralAddress} disconnected`);
                channelRef.channel?.markDisconnected();
                channelRef.channel
                    ?.close()
                    .catch(error => logger.debug(`Peripheral ${peripheralAddress}: Error closing channel`, error));
            };
            connection.closed.on(ownerClosedObserver);

            detachObservers = () => {
                connection.binaryFrameReceived.off(binaryObserver);
                connection.eventReceived.off(eventObserver);
                connection.closed.off(ownerClosedObserver);
            };

            const proxyChannel = new ProxyBleChannel(peripheralAddress, btpSession, detachObservers);
            channelRef.channel = proxyChannel;
            return proxyChannel;
        } catch (error) {
            detachObservers?.();
            try {
                await connection.sendCommand(BleProxyCommand.Disconnect, { connection_handle });
            } catch (cleanupError) {
                logger.debug(`Peripheral ${peripheralAddress}: Error during connect-failure cleanup`, cleanupError);
            }
            throw error;
        }
    }

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): Transport.Listener {
        this.#onMatterMessageListener = listener;
        return {
            close: async () => await this.close(),
        };
    }

    async close() {
        this.#closed = true;
    }

    supports(type: ChannelType, _address?: string) {
        return type === ChannelType.BLE;
    }
}

/**
 * BLE channel that communicates through the proxy WebSocket.
 */
export class ProxyBleChannel extends BleChannel<Bytes> {
    #connected = true;
    readonly #peripheralAddress: string;
    readonly #btpSession: BtpSessionHandler;
    readonly #cleanupObservers: () => void;
    readonly #onBtpSessionClosed: () => void;
    readonly #closeListeners = new Set<() => void>();
    #iteratorQueue = new Array<Bytes>();
    #iteratorWaiter?: (value: IteratorResult<Bytes>) => void;
    #iteratorDone = false;

    constructor(peripheralAddress: string, btpSession: BtpSessionHandler, cleanupObservers: () => void) {
        super();
        this.#peripheralAddress = peripheralAddress;
        this.#btpSession = btpSession;
        this.#cleanupObservers = cleanupObservers;
        this.#onBtpSessionClosed = () => this.emitClosed();
        btpSession.closed.on(this.#onBtpSessionClosed);
    }

    get connected() {
        return this.#connected;
    }

    markDisconnected() {
        this.#connected = false;
    }

    pushMessage(data: Bytes): void {
        if (this.#iteratorWaiter) {
            const resolve = this.#iteratorWaiter;
            this.#iteratorWaiter = undefined;
            resolve({ value: data, done: false });
        } else if (!this.#iteratorDone) {
            this.#iteratorQueue.push(data);
        }
    }

    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: () => {
                if (this.#iteratorQueue.length > 0) {
                    return Promise.resolve({ value: this.#iteratorQueue.shift()!, done: false });
                }
                if (this.#iteratorDone || !this.#connected) {
                    return Promise.resolve({ value: undefined as unknown as Bytes, done: true });
                }
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#iteratorWaiter = resolve;
                });
            },
        };
    }

    #terminateIterator(): void {
        if (!this.#iteratorDone) {
            this.#iteratorDone = true;
            this.#iteratorWaiter?.({ value: undefined, done: true });
            this.#iteratorWaiter = undefined;
        }
    }

    async send(data: Bytes) {
        if (!this.#connected) {
            logger.debug(`Cannot send data - not connected to ${this.#peripheralAddress}`);
            return;
        }
        if (this.#btpSession === undefined) {
            throw new BtpFlowError(`Cannot send data, no BTP session initialized`);
        }
        await this.#btpSession.sendMatterMessage(data);
    }

    get name() {
        return `ble-proxy://${this.#peripheralAddress}`;
    }

    async close() {
        this.#cleanupObservers();
        this.#terminateIterator();
        for (const listener of this.#closeListeners) {
            listener();
        }
        this.#btpSession.closed.off(this.#onBtpSessionClosed);
        try {
            // The session's disconnect callback tests {@link connected} to decide whether the peripheral still needs
            // a Disconnect, so the flag must survive until the session has closed
            await this.#btpSession.close();
        } finally {
            this.#connected = false;
        }
        this.emitClosed();
    }
}
