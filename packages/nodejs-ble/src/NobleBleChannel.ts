/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Channel,
    ChannelType,
    Diagnostic,
    InternalError,
    Logger,
    Minutes,
    AbortedError,
    NetworkError,
    Seconds,
    ServerAddress,
    Time,
    Timer,
    Transport,
    asError,
    createPromise,
    withTimeout,
} from "@matter/general";
import { BleChannel, BleDisconnectedError, BleError, BtpCodec, BtpSessionHandler, MatterBle } from "@matter/protocol";
import type { Characteristic, Peripheral } from "@stoprocent/noble";
import { BleScanner } from "./BleScanner.js";
import { nobleDisconnectReason } from "./NobleBleClient.js";

const logger = Logger.get("BleChannel");

/** noble waits for a disconnect event that a vanished peripheral never sends, so the wait needs its own bound. */
const BLE_DISCONNECT_TIMEOUT = Seconds(5);

/** How long to wait for a pending ATT_MTU exchange before deriving the BTP segment size without it. */
const ATT_MTU_SETTLE_TIMEOUT = Seconds(2);

/**
 * Detect noble errors that indicate the BLE connection is no longer usable.
 * On macOS/Linux noble throws errors starting with "Disconnected".
 * On Windows the native WinRT binding throws "status: <N>" where N is the
 * AsyncStatus enum (0=Started, 1=Completed, 2=Canceled, 3=Error).
 * Values >= 2 indicate the async operation did not complete successfully.
 */
function isNobleDisconnectError(error: unknown): error is Error {
    if (!(error instanceof Error)) {
        return false;
    }
    if (error.message.startsWith("Disconnected")) {
        return true;
    }
    const match = error.message.match(/^status:\s*(\d+)/);
    return match !== null && Number(match[1]) >= 2;
}

/**
 * Convert a UUID in noble's format to a proper UUID.
 *
 * @param {string} uuid - UUID to convert
 * @returns {string} UUID
 */
function nobleUuidToUuid(uuid: string): string {
    uuid = uuid.toUpperCase();

    if (uuid.length !== 32) {
        return uuid;
    }

    const parts = [
        uuid.substring(0, 8),
        uuid.substring(8, 12),
        uuid.substring(12, 16),
        uuid.substring(16, 20),
        uuid.substring(20, 32),
    ];

    return parts.join("-");
}

type BleConnectionGuard = {
    connectTimeout: Timer;
    interviewTimeout: Timer;
    disconnectTimeout: Timer;
};

export class NobleBleCentralInterface implements Transport {
    #bleScanner: BleScanner;
    #connectionsInProgress = new Set<string>();
    #connectionGuards = new Set<BleConnectionGuard>();
    #openChannels = new Map<string, Peripheral>();
    #onMatterMessageListener: ((socket: Channel<Bytes>, data: Bytes) => void) | undefined;
    #closed = false;

    constructor(bleScanner: BleScanner) {
        this.#bleScanner = bleScanner;
    }

    openChannel(address: ServerAddress, options?: Transport.OpenChannelOptions): Promise<Channel<Bytes>> {
        return this.#openChannel(address, 1, options?.abort);
    }

    #openChannel(
        address: ServerAddress,
        tryCount: number,
        abort?: AbortSignal,
        lastError?: unknown,
    ): Promise<Channel<Bytes>> {
        if (this.#closed) {
            // A retry can reach this from an event listener, where a synchronous throw escapes into noble's emit
            return Promise.reject(new NetworkError("Network interface is closed"));
        }
        return new Promise((resolve, reject) => {
            let resolvedOrRejected = false;
            function rejectOnce(error: unknown) {
                if (!resolvedOrRejected) {
                    resolvedOrRejected = true;
                    reject(asError(error));
                } else {
                    logger.debug(`Already resolved or rejected, ignore error:`, error);
                }
            }
            function resolveOnce(value: Channel<Bytes>) {
                if (resolvedOrRejected) {
                    logger.debug(`Already resolved or rejected, ignore success`);
                    return false;
                }
                resolvedOrRejected = true;
                resolve(value);
                return true;
            }

            if (this.#onMatterMessageListener === undefined) {
                rejectOnce(
                    new InternalError(`Network Interface was not added to the system yet, so can not connect it.`),
                );
                return;
            }
            if (!ServerAddress.isBle(address)) {
                rejectOnce(new InternalError(`Unsupported address type for BLE channel.`));
                return;
            }
            const { peripheralAddress } = address;
            if (abort?.aborted) {
                rejectOnce(new AbortedError(`Connection to peripheral ${peripheralAddress} was aborted`));
                return;
            }
            if (tryCount > 3) {
                rejectOnce(
                    new BleError(
                        `Failed to connect to peripheral ${peripheralAddress}`,
                        lastError === undefined ? undefined : { cause: lastError },
                    ),
                );
                return;
            }

            // Get the peripheral by address and connect to it.
            const { peripheral, hasAdditionalAdvertisementData } =
                this.#bleScanner.getDiscoveredDevice(peripheralAddress);

            if (this.#openChannels.has(peripheralAddress)) {
                rejectOnce(
                    new BleError(
                        `Peripheral ${peripheralAddress} is already connected. Only one connection supported right now.`,
                    ),
                );
                return;
            }
            if (this.#connectionsInProgress.has(peripheralAddress)) {
                rejectOnce(new BleError(`Connection to peripheral ${peripheralAddress} is already in progress.`));
                return;
            }
            // Reserve slot immediately so parallel openChannel calls for the same peripheral are rejected
            this.#connectionsInProgress.add(peripheralAddress);

            /**
             * Release the reservation this attempt made, once. A later attempt may already own the address, and an
             * abandoned attempt resuming after an abort or a timeout must not take the reservation away from it.
             */
            let ownsSlot = true;
            const releaseSlot = () => {
                if (ownsSlot) {
                    ownsSlot = false;
                    this.#connectionsInProgress.delete(peripheralAddress);
                }
            };

            // Wrapped listener for "connect" event — assigned after connectHandler is defined.
            // Stored here so timeout/retry handlers can remove it by reference.
            let connectListener: (error?: any) => void;

            // Guard object to indicate if the connection was cancelled. This is used as safe guard in some places
            // if data come in delayed after we already gave up.
            const connectionGuard: BleConnectionGuard = {
                // Timeout when trying to connect to the device because sometimes connect fails and noble does
                // not emit an event. If device does not connect we do not try any longer and reject the promise
                // because a re-discovery is the best option to get teh device into a good state again
                connectTimeout: Time.getTimer("BLE connect timeout", Minutes(2), () => {
                    logger.debug(`Timeout while connecting to peripheral ${peripheralAddress}`);
                    peripheral.removeListener("connect", connectListener);
                    peripheral.removeListener("disconnect", reTryHandler);
                    clearConnectionGuard();
                    releaseSlot();
                    rejectOnce(new BleError(`Timeout while connecting to peripheral ${peripheralAddress}`));
                }),
                disconnectTimeout: Time.getTimer("BLE disconnect timeout", Minutes.one, () => {
                    logger.debug(`Timeout while disconnecting to peripheral ${peripheralAddress}`);
                    peripheral.removeListener("disconnect", reTryHandler);
                    clearConnectionGuard();
                    releaseSlot();
                    rejectOnce(new BleError(`Timeout while disconnecting to peripheral ${peripheralAddress}`));
                }),
                // Timeout when trying to interview the device because sometimes when no response from device
                // comes noble does not resolve promises
                interviewTimeout: Time.getTimer("BLE interview timeout", Minutes.one, () => {
                    logger.debug(`Timeout while interviewing peripheral ${peripheralAddress}`);
                    peripheral.removeListener("disconnect", reTryHandler);
                    clearConnectionGuard();
                    releaseSlot();
                    if (peripheral.state === "connected") {
                        // We accept the dangling promise potentially because we got a timeout on reading data,
                        // so chance is high also disconnect does not work reliably for now
                        peripheral
                            .disconnectAsync()
                            .catch(error => logger.debug(`Ignored error while disconnecting`, error));
                    }
                    rejectOnce(new BleError(`Timeout while interviewing peripheral ${peripheralAddress}`));
                }),
            };
            this.#connectionGuards.add(connectionGuard);

            const clearConnectionGuard = () => {
                const { connectTimeout, interviewTimeout, disconnectTimeout } = connectionGuard;
                connectTimeout?.stop();
                interviewTimeout?.stop();
                disconnectTimeout?.stop();
                this.#connectionGuards.delete(connectionGuard);
                abort?.removeEventListener("abort", onAbort);
            };

            const onAbort = () => {
                logger.debug(`Peripheral ${peripheralAddress}: Connection aborted`);
                peripheral.removeListener("connect", connectListener);
                peripheral.removeListener("disconnect", reTryHandler);
                clearConnectionGuard();
                releaseSlot();
                releasePeripheral();
                rejectOnce(new AbortedError(`Connection to peripheral ${peripheralAddress} was aborted`));
            };
            abort?.addEventListener("abort", onAbort, { once: true });

            /**
             * Hand back a link this attempt may already hold. The peripheral is not in {@link #openChannels} until the
             * interview completes, so nothing else would ever disconnect it.
             */
            const releasePeripheral = () => {
                if (peripheral.state === "connecting") {
                    peripheral.cancelConnect();
                    return;
                }
                if (peripheral.state === "connected") {
                    withTimeout(BLE_DISCONNECT_TIMEOUT, peripheral.disconnectAsync()).catch(error =>
                        logger.debug(`Peripheral ${peripheralAddress}: Error while disconnecting`, error),
                    );
                }
            };

            // Handler to retry the connection. Called on disconnections (with a noble disconnect reason) and errors.
            const reTryHandler = (errorOrReason?: unknown) => {
                // Cancel tracking states because we are done in this context
                clearConnectionGuard();
                releaseSlot();
                peripheral.removeListener("connect", connectListener);
                peripheral.removeListener("disconnect", reTryHandler);

                let cause: unknown;
                if (errorOrReason instanceof Error) {
                    cause = errorOrReason;
                    logger.info(`Peripheral ${peripheralAddress}: connection attempt failed, try again`, errorOrReason);
                } else {
                    const reason = nobleDisconnectReason(errorOrReason);
                    cause = new BleError(`Peripheral ${peripheralAddress} disconnected (reason ${reason})`);
                    logger.info(
                        `Peripheral ${peripheralAddress} disconnected while trying to connect (reason ${reason}), try again`,
                    );
                }

                // Try again and chain promises
                this.#openChannel(address, tryCount + 1, abort, cause)
                    .then(resolveOnce)
                    .catch(rejectOnce);
            };

            const connectHandler = async (error?: any) => {
                connectionGuard.connectTimeout.stop(); // Connection done, so clear timeout
                if (!this.#connectionGuards.has(connectionGuard)) {
                    // Seems that the response was delayed and this process was cancelled in the meantime
                    return;
                }
                if (error) {
                    // noble emits no disconnect for a connection that never established, so the disconnect-driven
                    // retry below never sees this failure
                    reTryHandler(asError(error));
                    return;
                }
                if (this.#onMatterMessageListener === undefined) {
                    clearConnectionGuard();
                    releaseSlot();
                    peripheral.removeListener("disconnect", reTryHandler);
                    rejectOnce(new InternalError(`Network Interface was not added to the system yet or was cleared.`));
                    return;
                }

                try {
                    connectionGuard.interviewTimeout.start();
                    const services = await peripheral.discoverServicesAsync([MatterBle.SERVICE_UUID_SHORT]);
                    if (!this.#connectionGuards.has(connectionGuard)) {
                        // Seems that the response was delayed and this process was cancelled in the meantime
                        return;
                    }
                    logger.debug(
                        `Peripheral ${peripheralAddress}: Found services: ${services.map(s => s.uuid).join(", ")}`,
                    );

                    for (const service of services) {
                        logger.debug(`Peripheral ${peripheralAddress}: Handle service: ${service.uuid}`);
                        if (!MatterBle.isServiceUuid(service.uuid)) continue;

                        // It's Matter, discover its characteristics.
                        const characteristics = await service.discoverCharacteristicsAsync();
                        if (!this.#connectionGuards.has(connectionGuard)) {
                            // Seems that the response was delayed and this process was cancelled in the meantime
                            return;
                        }

                        let characteristicC1ForWrite: Characteristic | undefined;
                        let characteristicC2ForSubscribe: Characteristic | undefined;
                        let additionalCommissioningRelatedData: Bytes | undefined;

                        for (const characteristic of characteristics) {
                            // Loop through each characteristic and match them to the UUIDs that we know about.
                            logger.debug(
                                `Peripheral ${peripheralAddress}: Handle characteristic:`,
                                characteristic.uuid,
                                characteristic.properties,
                            );

                            switch (nobleUuidToUuid(characteristic.uuid)) {
                                case MatterBle.C1_CHARACTERISTIC_UUID:
                                    logger.debug(`Peripheral ${peripheralAddress}: Found C1 characteristic`);
                                    characteristicC1ForWrite = characteristic;
                                    break;

                                case MatterBle.C2_CHARACTERISTIC_UUID:
                                    logger.debug(`Peripheral ${peripheralAddress}: Found C2 characteristic`);
                                    characteristicC2ForSubscribe = characteristic;
                                    break;

                                case MatterBle.C3_CHARACTERISTIC_UUID:
                                    logger.debug(`Peripheral ${peripheralAddress}: Found C3 characteristic`);
                                    if (hasAdditionalAdvertisementData) {
                                        logger.debug(
                                            `Peripheral ${peripheralAddress}: Reading additional commissioning related data`,
                                        );
                                        const data = await characteristic.readAsync();
                                        if (!this.#connectionGuards.has(connectionGuard)) {
                                            // Seems that the response was delayed and this process was cancelled in the meantime
                                            return;
                                        }
                                        additionalCommissioningRelatedData = new Uint8Array(data);
                                        logger.debug(`Peripheral ${peripheralAddress}: Additional data:`, data);
                                    }
                            }
                        }

                        if (!characteristicC1ForWrite || !characteristicC2ForSubscribe) {
                            logger.debug(
                                `Peripheral ${peripheralAddress}: Missing required Matter characteristics. Ignore.`,
                            );
                            continue;
                        }

                        connectionGuard.interviewTimeout.stop();
                        peripheral.removeListener("disconnect", reTryHandler);
                        this.#openChannels.set(peripheralAddress, peripheral);
                        peripheral.once("disconnect", () => this.#openChannels.delete(peripheralAddress));
                        try {
                            const channel = await NobleBleChannel.create(
                                peripheral,
                                characteristicC1ForWrite,
                                characteristicC2ForSubscribe,
                                this.#onMatterMessageListener,
                                additionalCommissioningRelatedData,
                                abort,
                            );
                            clearConnectionGuard();
                            releaseSlot();
                            if (!resolveOnce(channel)) {
                                // The caller already gave up on this channel, so nothing else will close it
                                await channel.close();
                            }
                            return;
                        } catch (error) {
                            releaseSlot();
                            this.#openChannels.delete(peripheralAddress);
                            if (peripheral.state === "connected") {
                                logger.debug(
                                    `Disconnect because of initialization error of peripheral ${ServerAddress.urlFor(address)}`,
                                );
                                await withTimeout(BLE_DISCONNECT_TIMEOUT, peripheral.disconnectAsync()).catch(error =>
                                    logger.debug(`Peripheral ${peripheral.address}: Error while disconnecting`, error),
                                );
                            }
                            reTryHandler(error);
                            return;
                        }
                    }
                } catch (error) {
                    // Noble operations (discoverServicesAsync, discoverCharacteristicsAsync, readAsync)
                    // are wrapped in noble's _withDisconnectHandler, which rejects the promise when the
                    // peripheral disconnects. If reTryHandler was already called from the disconnect event,
                    // the connectionGuard is already cleared. Otherwise, handle the error.
                    if (this.#connectionGuards.has(connectionGuard)) {
                        reTryHandler(error);
                    }
                    return;
                } finally {
                    releaseSlot();
                    clearConnectionGuard();
                }

                peripheral.removeListener("disconnect", reTryHandler);
                rejectOnce(
                    new BleError(`Peripheral ${peripheralAddress} does not have the required Matter characteristics`),
                );
            };

            // Wrap the async connectHandler so rejected promises from the event listener are caught
            connectListener = (error?: any) => {
                connectHandler(error).catch(handlerError => {
                    logger.warn(`Peripheral ${peripheralAddress}: Unexpected error in connect handler`, handlerError);
                    clearConnectionGuard();
                    releaseSlot();
                    peripheral.removeListener("disconnect", reTryHandler);
                    rejectOnce(handlerError);
                });
            };

            if (peripheral.state === "connected") {
                logger.debug(`Peripheral ${peripheralAddress}: Already connected`);
                connectHandler().catch(error => {
                    logger.warn(`Peripheral ${peripheralAddress}: Unexpected error in connect handler`, error);
                    clearConnectionGuard();
                    releaseSlot();
                    peripheral.removeListener("disconnect", reTryHandler);
                    rejectOnce(error);
                });
            } else if (peripheral.state === "disconnecting") {
                logger.debug(`Peripheral ${peripheralAddress}: Disconnect in progress`);
                connectionGuard.disconnectTimeout.start();
                tryCount--;
                peripheral.once("disconnect", reTryHandler);
            } else {
                const stateBeforeConnect = peripheral.state;
                if (stateBeforeConnect === "connecting") {
                    peripheral.cancelConnect(); // Send cancel to noble to make sure we can connect
                }
                connectionGuard.connectTimeout.start();
                peripheral.once("connect", connectListener);
                peripheral.once("disconnect", reTryHandler);
                logger.debug(
                    `Peripheral ${peripheralAddress}: Connect to Peripheral now (try ${tryCount}, state ${stateBeforeConnect})`,
                );
                peripheral.connectAsync().catch(error => {
                    if (!this.#connectionGuards.has(connectionGuard)) {
                        // Seems that the response was delayed and this process was cancelled in the meantime
                        return;
                    }
                    logger.info(`Peripheral ${peripheralAddress}: Error while connecting to peripheral`, error);
                    reTryHandler(error);
                });
            }
        });
    }

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): Transport.Listener {
        this.#onMatterMessageListener = listener;
        return {
            close: async () => await this.close(),
        };
    }

    async close() {
        this.#closed = true;
        for (const peripheral of this.#openChannels.values()) {
            if (peripheral.state === "connected") {
                logger.debug(`Peripheral ${peripheral.address}: Disconnect from peripheral while closing central`);
                peripheral
                    .disconnectAsync()
                    .catch(error => logger.warn(`Peripheral ${peripheral.address}: Error while disconnecting`, error));
            }
        }
        this.#openChannels.clear();
    }

    supports(type: ChannelType, _address?: string) {
        if (type !== ChannelType.BLE) {
            return false;
        }
        return true;
    }
}

/**
 * Resolve the peripheral's ATT_MTU, waiting briefly when the exchange is still in flight.
 *
 * noble reports the negotiated MTU through an event and leaves `Peripheral.mtu` null until it arrives, which can be
 * after the interview completes. Deriving the BTP segment size from an unknown MTU would pin the session to the 20-byte
 * minimum for its whole life, so give the exchange a moment to land.
 */
async function attMtuOf(peripheral: Peripheral) {
    if (peripheral.mtu !== null) {
        return peripheral.mtu;
    }

    const { promise, resolver } = createPromise<number | undefined>();
    let settled = false;
    const settle = (mtu?: number) => {
        if (settled) {
            return;
        }
        settled = true;
        settleTimeout.stop();
        peripheral.removeListener("mtu", onMtu);
        peripheral.removeListener("disconnect", onDisconnect);
        resolver(mtu);
    };
    const onMtu = (mtu: number) => settle(mtu);
    const onDisconnect = () => settle();
    const settleTimeout = Time.getTimer("BLE ATT_MTU exchange", ATT_MTU_SETTLE_TIMEOUT, () => settle()).start();

    peripheral.on("mtu", onMtu);
    peripheral.on("disconnect", onDisconnect);

    return await promise;
}

/**
 * Unsubscribe from C2, which is how a GATT client closes a BTP session (§4.19.3.3). Bounded because noble leaves the
 * operation pending when the peripheral has vanished without a disconnect event.
 */
async function unsubscribeC2(
    peripheral: Peripheral,
    characteristicC2ForSubscribe: Characteristic,
    onFailure: "throw" | "log" = "log",
) {
    try {
        await withTimeout(BLE_DISCONNECT_TIMEOUT, characteristicC2ForSubscribe.unsubscribeAsync());
    } catch (error) {
        if (onFailure === "throw") {
            throw error;
        }
        if (!isNobleDisconnectError(error)) {
            logger.warn(`Peripheral ${peripheral.address}: Error while unsubscribing from C2`, error);
        }
    }
}

/**
 * Run the BTP session handshake over an established GATT connection and return the peripheral's handshake response.
 */
async function performBtpHandshake(
    peripheral: Peripheral,
    characteristicC1ForWrite: Characteristic,
    characteristicC2ForSubscribe: Characteristic,
    segmentSize: number,
    abort?: AbortSignal,
): Promise<Bytes> {
    const { address: peripheralAddress } = peripheral;
    if (abort?.aborted) {
        throw new AbortedError(`Peripheral ${peripheralAddress}: BTP handshake was aborted`);
    }

    const {
        promise: handshakeResponseReceivedPromise,
        resolver: handshakeResolver,
        rejecter: handshakeRejecter,
    } = createPromise<Buffer>();

    const handshakeHandler = (data: Buffer, isNotification: boolean) => {
        if (BtpCodec.isHandshakeResponse(data)) {
            logger.info(
                `Peripheral ${peripheralAddress}: Received Matter handshake response: ${data.toString("hex")}.`,
            );
            btpHandshakeTimeout.stop();
            handshakeResolver(data);
        } else {
            logger.debug(
                `Peripheral ${peripheralAddress}: Received first data on C2: ${data.toString("hex")} (isNotification: ${isNotification}) - No handshake response, ignoring`,
            );
        }
    };

    const btpHandshakeTimeout = Time.getTimer("BLE handshake timeout", MatterBle.BTP_CONN_RSP_TIMEOUT, async () => {
        logger.debug(`Peripheral ${peripheralAddress}: Handshake Response not received. Disconnect from peripheral`);

        // Reject before unsubscribing: the caller's bound must not depend on an unsubscribe that can hang
        handshakeRejecter(new BleError(`Peripheral ${peripheralAddress}: Handshake Response not received`));

        if (peripheral.state === "connected") {
            await unsubscribeC2(peripheral, characteristicC2ForSubscribe);
        }
    }).start();

    const onAbort = () => {
        btpHandshakeTimeout.stop();
        handshakeRejecter(new AbortedError(`Peripheral ${peripheralAddress}: BTP handshake was aborted`));
    };
    abort?.addEventListener("abort", onAbort, { once: true });

    const btpHandshakeRequest = BtpCodec.encodeBtpHandshakeRequest({
        versions: MatterBle.BTP_SUPPORTED_VERSIONS,
        attMtu: segmentSize,
        clientWindowSize: MatterBle.BTP_MAXIMUM_WINDOW_SIZE,
    });

    logger.debug(
        `Peripheral ${peripheralAddress}: Sending BTP handshake request: ${Diagnostic.json(btpHandshakeRequest)}`,
    );

    try {
        await characteristicC1ForWrite.writeAsync(Buffer.from(Bytes.of(btpHandshakeRequest)), false);

        characteristicC2ForSubscribe.on("data", handshakeHandler);

        logger.debug(`Peripheral ${peripheralAddress}: Subscribing to C2 characteristic`);
        // Awaited together: a subscribe noble leaves pending must not strand the handshake rejection
        const [, response] = await Promise.all([
            characteristicC2ForSubscribe.subscribeAsync(),
            handshakeResponseReceivedPromise,
        ]);

        return new Uint8Array(response);
    } catch (error) {
        btpHandshakeTimeout.stop();
        if (isNobleDisconnectError(error)) {
            throw new BleDisconnectedError(error.message, { cause: error });
        }
        throw error;
    } finally {
        abort?.removeEventListener("abort", onAbort);
        characteristicC2ForSubscribe.removeListener("data", handshakeHandler);
    }
}

export class NobleBleChannel extends BleChannel<Bytes> {
    static async create(
        peripheral: Peripheral,
        characteristicC1ForWrite: Characteristic,
        characteristicC2ForSubscribe: Characteristic,
        onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void,
        _additionalCommissioningRelatedData?: Bytes,
        abort?: AbortSignal,
    ): Promise<NobleBleChannel> {
        const attMtu = await attMtuOf(peripheral);
        const segmentSize =
            attMtu === undefined ? MatterBle.MINIMUM_ATT_MTU : MatterBle.btpSegmentSizeFromAttMtu(attMtu);
        if (attMtu === undefined) {
            logger.info(
                `Peripheral ${peripheral.address}: ATT_MTU still unknown, using the minimum BTP segment size of ${segmentSize} bytes`,
            );
        } else {
            logger.debug(
                `Peripheral ${peripheral.address}: Using BTP segment size=${segmentSize} bytes (Peripheral ATT_MTU up to ${attMtu} bytes)`,
            );
        }

        const handshakeResponse = await performBtpHandshake(
            peripheral,
            characteristicC1ForWrite,
            characteristicC2ForSubscribe,
            segmentSize,
            abort,
        );

        const channel = new NobleBleChannel(
            peripheral,
            characteristicC1ForWrite,
            characteristicC2ForSubscribe,
            onMatterMessageListener,
        );
        try {
            await channel.#adoptSession(handshakeResponse, segmentSize);
        } catch (error) {
            // The peripheral outlives a rejected attempt and is reused by the next one, so a channel nobody receives
            // must leave no listener behind
            channel.#releasePeripheralListener();
            throw error;
        }
        return channel;
    }

    #connected = true;
    readonly #closeListeners = new Set<() => void>();
    #iteratorQueue = new Array<Bytes>();
    #iteratorWaiter?: (value: IteratorResult<Bytes>) => void;
    #iteratorDone = false;

    #btpSession?: BtpSessionHandler;
    #c2DataHandler?: (data: Buffer, isNotification: boolean) => void;
    #renegotiation?: Promise<void>;
    #closing = false;
    readonly #lifetime = new AbortController();
    readonly #onPeripheralDisconnect: (reason: unknown) => void;

    private constructor(
        private readonly peripheral: Peripheral,
        private readonly characteristicC1ForWrite: Characteristic,
        private readonly characteristicC2ForSubscribe: Characteristic,
        private readonly onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void,
    ) {
        super();
        this.#onPeripheralDisconnect = (reason: unknown) => {
            logger.debug(
                `Disconnected from peripheral ${peripheral.address} (reason ${nobleDisconnectReason(reason)}). Closing BTP session`,
            );
            this.#connected = false;
            this.#detachDataHandler();
            this.#terminateIterator();
            for (const listener of this.#closeListeners) {
                listener();
            }
            this.#btpSession?.close().catch(error => {
                logger.debug(`Peripheral ${peripheral.address}: Error closing BTP session on disconnect`, error);
            });
            this.emitClosed();
        };
        peripheral.once("disconnect", this.#onPeripheralDisconnect);
    }

    #releasePeripheralListener() {
        this.peripheral.removeListener("disconnect", this.#onPeripheralDisconnect);
    }

    /** The session is installed before {@link create} hands the channel out, so absence means an internal error. */
    get #session() {
        if (this.#btpSession === undefined) {
            throw new InternalError(`Peripheral ${this.peripheral.address}: No BTP session initialized`);
        }
        return this.#btpSession;
    }

    /** Install a freshly handshaken BTP session and route incoming C2 data to it. */
    async #adoptSession(handshakeResponse: Bytes, requestedSegmentSize: number) {
        const { address: peripheralAddress } = this.peripheral;
        this.#detachDataHandler();

        const session = await BtpSessionHandler.createAsCentral(
            handshakeResponse,
            // callback to write data to characteristic C1; translates noble's disconnect/transport
            // errors into BleDisconnectedError so BtpSessionHandler can handle them specifically
            async (data: Bytes) => {
                try {
                    return await this.characteristicC1ForWrite.writeAsync(Buffer.from(Bytes.of(data)), false);
                } catch (error) {
                    if (isNobleDisconnectError(error)) {
                        throw new BleDisconnectedError(error.message, { cause: error });
                    }
                    throw error;
                }
            },
            // callback to disconnect the BLE connection
            async () => {
                if (this.peripheral.state !== "connected" || !this.connected) return;
                logger.debug(`Peripheral ${peripheralAddress}: Disconnect from peripheral because btp session closed`);
                unsubscribeC2(this.peripheral, this.characteristicC2ForSubscribe)
                    .then(() => {
                        if (this.peripheral.state !== "connected") {
                            return;
                        }
                        return this.peripheral.disconnectAsync().then(
                            () => logger.debug(`Peripheral ${peripheralAddress}: Disconnected from peripheral`),
                            error => logger.debug(`Peripheral ${peripheralAddress}: Error while disconnecting`, error),
                        );
                    })
                    .catch(error =>
                        logger.debug(`Peripheral ${peripheralAddress}: Error during disconnect cleanup`, error),
                    );
            },

            // callback to forward decoded and de-assembled Matter messages
            async (data: Bytes) => {
                if (this.onMatterMessageListener === undefined) {
                    throw new InternalError(`No listener registered for Matter messages`);
                }
                this.pushMessage(data);
                this.onMatterMessageListener(this, data);
            },
            requestedSegmentSize,
        );

        if (this.#closing || !this.connected) {
            // The disconnect that ended the channel ran before this session existed, so nothing else would stop its
            // timers or remove a data listener we attached now
            session.suspend();
            throw new BleDisconnectedError(
                `Peripheral ${peripheralAddress}: Channel was lost while establishing the BTP session`,
            );
        }

        this.#btpSession = session;

        // Forward BTP-initiated close (e.g. ack-receive timeout) to our Observable.
        session.closed.once(() => this.emitClosed());
        session.stalledAfterHandshake.once(messagesToReplay => this.#startRenegotiation(messagesToReplay));

        const c2DataHandler = (data: Buffer, isNotification: boolean) => {
            logger.debug(
                `Peripheral ${peripheralAddress}: received data on C2: ${data.toString("hex")} (isNotification: ${isNotification})`,
            );

            session.handleIncomingBleData(new Uint8Array(data)).catch(error => {
                logger.info(`Peripheral ${peripheralAddress}: Error handling incoming BLE data`, error);
            });
        };
        this.#c2DataHandler = c2DataHandler;
        this.characteristicC2ForSubscribe.on("data", c2DataHandler);
    }

    #detachDataHandler() {
        if (this.#c2DataHandler !== undefined) {
            this.characteristicC2ForSubscribe.removeListener("data", this.#c2DataHandler);
            this.#c2DataHandler = undefined;
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
        // A send must be able to observe the renegotiation before its first step runs, or it reaches the session that
        // was just suspended
        this.#renegotiation = Promise.resolve()
            .then(() => this.#renegotiate(messagesToReplay))
            .catch(async error => {
                logger.warn(`Peripheral ${this.peripheral.address}: Renegotiating the BTP session failed`, error);
                // Every send awaits this promise, so it must not settle rejected
                await this.close().catch(closeError =>
                    logger.debug(
                        `Peripheral ${this.peripheral.address}: Error closing after a failed renegotiation`,
                        closeError,
                    ),
                );
            });
    }

    async #renegotiate(messagesToReplay: readonly Bytes[]) {
        this.#detachDataHandler();

        logger.info(
            `Peripheral ${this.peripheral.address}: Peer did not respond to any BTP packet, retrying with a ${MatterBle.MINIMUM_ATT_MTU} byte BTP segment size`,
        );

        // §4.19.3.3: unsubscribing from C2 closes the BTP session for the peripheral; the BLE connection is unaffected.
        // A failure here means the peer still holds the old session, so the new handshake would be rejected anyway
        await unsubscribeC2(this.peripheral, this.characteristicC2ForSubscribe, "throw");
        this.#assertRenegotiable();

        const handshakeResponse = await performBtpHandshake(
            this.peripheral,
            this.characteristicC1ForWrite,
            this.characteristicC2ForSubscribe,
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
        if (this.#closing || !this.connected) {
            throw new BleDisconnectedError(
                `Peripheral ${this.peripheral.address}: Channel was lost while renegotiating the BTP session`,
            );
        }
    }

    get connected() {
        return this.#connected && this.peripheral.state === "connected";
    }

    /**
     * Send a Matter message to the connected device - need to do BTP assembly first.
     *
     * @param data
     */
    async send(data: Bytes) {
        // A renegotiation replaces the session, so sending into the outgoing one would be rejected as inactive
        await this.#renegotiation;
        if (this.#closing || !this.connected) {
            throw new BleDisconnectedError(
                `Peripheral ${this.peripheral.address}: Cannot send data because not connected to peripheral.`,
            );
        }
        await this.#session.sendMatterMessage(data);
    }

    // Channel<Bytes>
    get name() {
        return `${this.type}://${this.peripheral.address}`;
    }

    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
    }

    /** Called by the BTP session when a complete Matter message is assembled. */
    pushMessage(message: Bytes): void {
        if (this.#iteratorWaiter) {
            const resolve = this.#iteratorWaiter;
            this.#iteratorWaiter = undefined;
            resolve({ value: message, done: false });
        } else if (!this.#iteratorDone) {
            this.#iteratorQueue.push(message);
        }
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
            this.#iteratorWaiter?.({ value: undefined as unknown as Bytes, done: true });
            this.#iteratorWaiter = undefined;
        }
    }

    async close() {
        // Connectivity is decided up front: the flags below make a parked send see the channel as gone, which would
        // otherwise also suppress the disconnect this method owes the peripheral
        const wasConnected = this.connected;
        this.#closing = true;
        this.#connected = false;
        // Interrupts a renegotiation parked on the handshake, whose timer would otherwise outlive the channel
        this.#lifetime.abort();
        this.#detachDataHandler();
        this.#terminateIterator();
        await this.#btpSession?.close();
        if (wasConnected && this.peripheral.state === "connected") {
            this.peripheral.disconnectAsync().catch(error => {
                if (!isNobleDisconnectError(error)) {
                    logger.warn(`Peripheral ${this.peripheral.address}: Error while disconnecting`, error);
                }
            });
        }
        this.emitClosed();
    }
}
