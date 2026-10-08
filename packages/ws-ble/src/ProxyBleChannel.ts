/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    AbortedError,
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
    WsProxyConnectionClosedError,
    type Channel,
    type Transport,
} from "@matter/general";
import { BleChannel, BleDisconnectedError, BleError, BtpCodec, BtpSessionHandler, MatterBle } from "@matter/protocol";
import type { BleProxyConnection } from "./BleProxyConnection.js";
import type { BleProxyHandler } from "./BleProxyHandler.js";
import { BinaryFrameOpcode, BleProxyCommand, BleProxyEvent, type BinaryFrame } from "./BleProxyProtocol.js";
import type { ProxyBleScanner } from "./ProxyBleScanner.js";

const logger = Logger.get("ProxyBleChannel");

/**
 * Bounds the courtesy Disconnect and the C2 unsubscribe, so neither channel teardown nor a renegotiation stalls on an
 * unresponsive proxy client.
 */
const PROXY_LINK_COMMAND_TIMEOUT = Seconds(5);

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

/** A GATT connection to one peripheral, held by a proxy client, that carries the channel's BTP sessions. */
interface ProxyGattLink {
    readonly connection: BleProxyConnection;
    readonly peripheralAddress: string;
    readonly connectionHandle: number;

    /** C1 and C2 in the form the proxy client reported them, which is the form it accepts back. */
    readonly c1Uuid: string;
    readonly c2Uuid: string;
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

    async openChannel(address: ServerAddress): Promise<ProxyBleChannel> {
        if (this.#closed) {
            throw new NetworkError("Network interface is closed");
        }
        if (!ServerAddress.isBle(address)) {
            throw new InternalError(`Unsupported address type for BLE channel.`);
        }
        const onMatterMessageListener = this.#onMatterMessageListener;
        if (onMatterMessageListener === undefined) {
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

        // Waiting out a late ATT_MTU exchange is the proxy client's job, as only it sees the exchange complete
        const { connection_handle, mtu: peripheralMtu } = await connection.sendCommand(BleProxyCommand.Connect, {
            address: peripheralAddress,
        });

        const segmentSize = MatterBle.btpSegmentSizeFromAttMtu(peripheralMtu ?? 0);
        logger.info(
            `Connected to ${peripheralAddress}, handle=${connection_handle}, BTP segment size=${segmentSize} bytes (peripheral ATT_MTU up to ${peripheralMtu ?? "n/a"}), rssi=${rssi ?? "n/a"}`,
        );

        try {
            // The client chooses the handle and every frame of this channel is addressed with it
            if (!Number.isInteger(connection_handle) || connection_handle < 0 || connection_handle > 0xffff) {
                throw new BleError(
                    `BLE proxy client returned invalid connection handle ${connection_handle} for ${peripheralAddress}`,
                );
            }

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

            return await ProxyBleChannel.create(
                { connection, peripheralAddress, connectionHandle: connection_handle, c1Uuid, c2Uuid },
                segmentSize,
                onMatterMessageListener,
            );
        } catch (error) {
            try {
                await withTimeout(
                    PROXY_LINK_COMMAND_TIMEOUT,
                    connection.sendCommand(BleProxyCommand.Disconnect, { connection_handle }),
                );
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
 * Unsubscribe from C2, which is how a GATT client closes a BTP session (§4.19.4.10).  Bounded because a proxy client
 * may never answer.
 */
async function unsubscribeC2(link: ProxyGattLink) {
    await withTimeout(
        PROXY_LINK_COMMAND_TIMEOUT,
        link.connection.sendCommand(BleProxyCommand.UnsubscribeCharacteristic, {
            connection_handle: link.connectionHandle,
            characteristic_uuid: link.c2Uuid,
        }),
    );
}

/**
 * Run the BTP session handshake over the proxied GATT link and return the peripheral's handshake response.
 */
async function performBtpHandshake(link: ProxyGattLink, segmentSize: number, abort?: AbortSignal): Promise<Bytes> {
    const { connection, peripheralAddress, connectionHandle } = link;

    // Every await below must end on abort or timeout: the proxy client can leave a command unanswered forever
    using handshake = new Abort({ abort });
    const handshakeTimeout = Time.getTimer("BLE proxy handshake timeout", MatterBle.BTP_CONN_RSP_TIMEOUT, () =>
        handshake.abort(),
    ).start();

    // Registered before sending: the C2 indication is a separate binary frame that can beat the WriteAndSubscribe
    // response, and binaryFrameReceived drops frames emitted with no listener attached
    const { promise: handshakeResponseReceived, resolver: handshakeResolver } = createPromise<Bytes>();
    const handshakeObserver = (frame: BinaryFrame) => {
        if (frame.handle !== connectionHandle || frame.opcode !== BinaryFrameOpcode.Notification) {
            return;
        }
        const data = new Uint8Array(frame.payload);
        if (BtpCodec.isHandshakeResponse(data)) {
            handshakeResolver(data);
        }
    };
    connection.binaryFrameReceived.on(handshakeObserver);

    try {
        handshake.throwIfAborted();

        const btpHandshakeRequest = BtpCodec.encodeBtpHandshakeRequest({
            versions: MatterBle.BTP_SUPPORTED_VERSIONS,
            attMtu: segmentSize,
            clientWindowSize: MatterBle.BTP_MAXIMUM_WINDOW_SIZE,
        });
        logger.debug(`Sending BTP handshake request on C1 and subscribing C2 atomically`);

        // Write C1 and subscribe C2 in one command so the peripheral can't fire its indication before notifications
        // are enabled (no round-trip between Write Response and CCCD enable)
        const writeAndSubscribe = connection.sendCommand(BleProxyCommand.WriteAndSubscribe, {
            connection_handle: connectionHandle,
            write_uuid: link.c1Uuid,
            write_value: Bytes.toBase64(btpHandshakeRequest),
            write_response: true,
            subscribe_uuid: link.c2Uuid,
        });
        const [, response] = await handshake.attempt(Promise.all([writeAndSubscribe, handshakeResponseReceived]));
        return response;
    } catch (error) {
        if (abort?.aborted) {
            throw new AbortedError(`Peripheral ${peripheralAddress}: BTP handshake was aborted`, { cause: error });
        }
        if (handshake.aborted) {
            throw new BleError(`BTP handshake response not received from ${peripheralAddress}`);
        }
        throw error;
    } finally {
        handshakeTimeout.stop();
        connection.binaryFrameReceived.off(handshakeObserver);
    }
}

/**
 * BLE channel that communicates through the proxy WebSocket.
 */
export class ProxyBleChannel extends BleChannel<Bytes> {
    static async create(
        link: ProxyGattLink,
        segmentSize: number,
        onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void,
    ): Promise<ProxyBleChannel> {
        const handshakeResponse = await performBtpHandshake(link, segmentSize);

        const channel = new ProxyBleChannel(link, onMatterMessageListener);
        try {
            await channel.#adoptSession(handshakeResponse, segmentSize);
        } catch (error) {
            // The proxy connection outlives a rejected attempt, so a channel nobody receives must leave no observer
            channel.#releaseObservers();
            throw error;
        }
        return channel;
    }

    readonly #link: ProxyGattLink;
    readonly #onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void;
    readonly #releaseObservers: () => void;

    /** True while the proxy client holds the GATT connection for us. */
    #connected = true;
    readonly #closeListeners = new Set<() => void>();
    #iteratorQueue = new Array<Bytes>();
    #iteratorWaiter?: (value: IteratorResult<Bytes>) => void;
    #iteratorDone = false;

    #btpSession?: BtpSessionHandler;

    /** Where C2 notifications go: the current session, a buffer while one is being installed, or nowhere. */
    #inbound?: BtpSessionHandler | Array<Uint8Array>;

    #renegotiation?: Promise<void>;
    #closing = false;
    #sessionLost = false;
    readonly #lifetime = new AbortController();

    private constructor(link: ProxyGattLink, onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void) {
        super();
        this.#link = link;
        this.#onMatterMessageListener = onMatterMessageListener;

        const { connection, connectionHandle, peripheralAddress } = link;

        const frameObserver = (frame: BinaryFrame) => {
            if (frame.handle === connectionHandle && frame.opcode === BinaryFrameOpcode.Notification) {
                this.#receiveC2(new Uint8Array(frame.payload));
            }
        };

        const eventObserver = (event: string, data: Record<string, unknown>) => {
            if (event === BleProxyEvent.Disconnected && data.connection_handle === connectionHandle) {
                this.#onLinkLost(`Peripheral ${peripheralAddress} disconnected unexpectedly`);
            }
        };

        // The Disconnected event covers one peripheral; this covers the whole owning client vanishing
        const ownerClosedObserver = () => this.#onLinkLost(`Owning proxy client for ${peripheralAddress} disconnected`);

        connection.binaryFrameReceived.on(frameObserver);
        connection.eventReceived.on(eventObserver);
        connection.closed.on(ownerClosedObserver);
        this.#releaseObservers = () => {
            connection.binaryFrameReceived.off(frameObserver);
            connection.eventReceived.off(eventObserver);
            connection.closed.off(ownerClosedObserver);
        };
    }

    #onLinkLost(reason: string) {
        // A Disconnected event that answers our own Disconnect is expected
        if (this.#connected) {
            logger.info(reason);
        } else {
            logger.debug(reason);
        }
        this.#connected = false;
        this.#lifetime.abort();
        this.close().catch(error =>
            logger.debug(`Peripheral ${this.#link.peripheralAddress}: Error closing channel`, error),
        );
    }

    #receiveC2(payload: Uint8Array) {
        const inbound = this.#inbound;
        if (inbound === undefined) {
            return;
        }
        if (Array.isArray(inbound)) {
            inbound.push(payload);
            return;
        }
        inbound.handleIncomingBleData(payload).catch(error => {
            logger.info(`Peripheral ${this.#link.peripheralAddress}: Error handling incoming BLE data`, error);
        });
    }

    /** The session is installed before {@link create} hands the channel out, so absence means an internal error. */
    get #session() {
        if (this.#btpSession === undefined) {
            throw new InternalError(`Peripheral ${this.#link.peripheralAddress}: No BTP session initialized`);
        }
        return this.#btpSession;
    }

    /** Install a freshly handshaken BTP session and route incoming C2 data to it. */
    async #adoptSession(handshakeResponse: Bytes, requestedSegmentSize: number) {
        const { connection, connectionHandle, peripheralAddress } = this.#link;

        // Notifications that arrive while the session is created are delivered to it once it exists
        const earlyFrames = new Array<Uint8Array>();
        this.#inbound = earlyFrames;

        const session = await BtpSessionHandler.createAsCentral(
            handshakeResponse,
            async (data: Bytes) => {
                try {
                    connection.sendBinaryFrame(BinaryFrameOpcode.WriteData, connectionHandle, Bytes.of(data));
                } catch (error) {
                    // BtpSessionHandler treats only BleDisconnectedError as the link going away
                    if (error instanceof WsProxyConnectionClosedError) {
                        throw new BleDisconnectedError(error.message, { cause: error });
                    }
                    throw error;
                }
            },
            async () => {
                logger.debug(`Peripheral ${peripheralAddress}: Disconnect from peripheral because btp session closed`);
                await this.#disconnectPeripheral();
            },
            async (data: Bytes) => {
                this.pushMessage(data);
                this.#onMatterMessageListener(this, data);
            },
            requestedSegmentSize,
        );

        if (!this.#usable) {
            // The loss that ended the channel ran before this session existed, so nothing else would stop its timers
            session.suspend();
            throw new BleDisconnectedError(
                `Peripheral ${peripheralAddress}: Channel was lost while establishing the BTP session`,
            );
        }

        this.#btpSession = session;

        // A closed session ends the channel even while the proxy client still holds the GATT connection
        session.closed.once(() => {
            this.#sessionLost = true;
            this.#terminateIterator();
            this.emitClosed();
        });
        session.stalledAfterHandshake.once(messagesToReplay => this.#startRenegotiation(messagesToReplay));

        this.#inbound = session;
        for (const payload of earlyFrames) {
            this.#receiveC2(payload);
        }
    }

    /**
     * Establish a fresh BTP session with the smallest permitted segment size, replaying what the peer never
     * acknowledged. See {@link BtpSessionHandler.stalledAfterHandshake} for why, and for the fact that this is an
     * interop workaround rather than specified behaviour.
     *
     * Runs at most once per channel: a session already at the minimum segment size never reports the condition.
     */
    #startRenegotiation(messagesToReplay: readonly Bytes[]) {
        if (this.#renegotiation !== undefined) {
            return;
        }
        const { peripheralAddress } = this.#link;
        // Every send awaits this promise: it must exist before the first step runs, settle once the channel ends, and
        // never settle rejected
        this.#renegotiation = Promise.resolve()
            .then(() => Abort.attempt(this.#lifetime, this.#renegotiate(messagesToReplay)))
            .catch(async error => {
                if (this.#closing) {
                    logger.debug(`Peripheral ${peripheralAddress}: Renegotiation ended by closing the channel`);
                    return;
                }
                if (this.connected) {
                    logger.warn(`Peripheral ${peripheralAddress}: Renegotiating the BTP session failed`, error);
                } else {
                    logger.debug(`Peripheral ${peripheralAddress}: Renegotiation ended by disconnect`, error);
                }
                await this.close().catch(closeError =>
                    logger.debug(
                        `Peripheral ${peripheralAddress}: Error closing after a failed renegotiation`,
                        closeError,
                    ),
                );
            });
    }

    async #renegotiate(messagesToReplay: readonly Bytes[]) {
        this.#inbound = undefined;

        logger.info(
            `Peripheral ${this.#link.peripheralAddress}: Peer did not respond to any BTP packet, retrying with a ${MatterBle.MINIMUM_ATT_MTU} byte BTP segment size`,
        );

        // §4.19.4.10: unsubscribing from C2 closes the BTP session for the peripheral; the BLE connection is
        // unaffected.
        // A failure here may leave the peer holding the old session, so a new handshake is not attempted
        await unsubscribeC2(this.#link);
        this.#assertRenegotiable();

        const handshakeResponse = await performBtpHandshake(
            this.#link,
            MatterBle.MINIMUM_ATT_MTU,
            this.#lifetime.signal,
        );
        this.#assertRenegotiable();

        await this.#adoptSession(handshakeResponse, MatterBle.MINIMUM_ATT_MTU);
        this.#assertRenegotiable();

        for (const message of messagesToReplay) {
            await this.#session.sendMatterMessage(message);
        }
    }

    #assertRenegotiable() {
        if (!this.#usable) {
            throw new BleDisconnectedError(
                `Peripheral ${this.#link.peripheralAddress}: Channel was lost while renegotiating the BTP session`,
            );
        }
    }

    /** Ask the proxy client to drop the GATT connection, at most once and only while it still holds it. */
    async #disconnectPeripheral() {
        if (!this.#connected) {
            return;
        }
        this.#connected = false;
        const { connection, connectionHandle, peripheralAddress } = this.#link;
        logger.debug(`Disconnecting from ${peripheralAddress} via proxy`);
        try {
            await withTimeout(
                PROXY_LINK_COMMAND_TIMEOUT,
                connection.sendCommand(BleProxyCommand.Disconnect, { connection_handle: connectionHandle }),
            );
        } catch (error) {
            logger.debug(`Peripheral ${peripheralAddress}: Error sending Disconnect to proxy client`, error);
        }
    }

    get connected() {
        return this.#connected;
    }

    get #usable() {
        return !this.#closing && !this.#sessionLost && this.#connected;
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
                    return Promise.resolve({ value: undefined, done: true });
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

    /**
     * Send a Matter message to the connected device.
     *
     * Waits for a pending renegotiation of the BTP session and fails with {@link BleDisconnectedError} if the channel
     * is lost meanwhile.
     */
    async send(data: Bytes) {
        // A renegotiation replaces the session, so sending into the outgoing one would be rejected as inactive
        await this.#renegotiation;
        if (!this.#usable) {
            throw new BleDisconnectedError(
                `Peripheral ${this.#link.peripheralAddress}: Cannot send data because not connected to peripheral.`,
            );
        }
        await this.#session.sendMatterMessage(data);
    }

    get name() {
        return `ble-proxy://${this.#link.peripheralAddress}`;
    }

    async close() {
        if (this.#closing) {
            return;
        }
        this.#closing = true;
        this.#lifetime.abort();
        this.#inbound = undefined;
        this.#releaseObservers();
        this.#terminateIterator();
        for (const listener of this.#closeListeners) {
            listener();
        }
        try {
            await this.#btpSession?.close();
        } finally {
            // A suspended or already closed session runs no disconnect callback
            await this.#disconnectPeripheral();
            this.emitClosed();
        }
    }
}
