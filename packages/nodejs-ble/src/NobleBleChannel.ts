/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Channel,
    ChannelType,
    ConnectionlessTransport,
    Diagnostic,
    InternalError,
    Logger,
    Minutes,
    NetworkError,
    ServerAddress,
    Time,
    Timer,
    asError,
    createPromise,
} from "#general";
import {
    BLE_MATTER_C1_CHARACTERISTIC_UUID,
    BLE_MATTER_C2_CHARACTERISTIC_UUID,
    BLE_MATTER_C3_CHARACTERISTIC_UUID,
    BLE_MATTER_SERVICE_UUID_SHORT,
    BLE_MAXIMUM_BTP_MTU,
    BTP_CONN_RSP_TIMEOUT,
    BTP_MAXIMUM_WINDOW_SIZE,
    BTP_SUPPORTED_VERSIONS,
    BleChannel,
    BleError,
    BtpCodec,
    BtpFlowError,
    BtpSessionHandler,
} from "#protocol";
import type { Characteristic, Peripheral } from "@stoprocent/noble";
import { BleScanner } from "./BleScanner.js";

const logger = Logger.get("BleChannel");

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

export class NobleBleCentralInterface implements ConnectionlessTransport {
    #bleScanner: BleScanner;
    #connectionsInProgress = new Set<ServerAddress>();
    #connectionGuards = new Set<BleConnectionGuard>();
    #openChannels = new Map<ServerAddress, Peripheral>();
    #onMatterMessageListener: ((socket: Channel<Bytes>, data: Bytes) => void) | undefined;
    #closed = false;

    constructor(bleScanner: BleScanner) {
        this.#bleScanner = bleScanner;
    }

    openChannel(address: ServerAddress, tryCount = 1): Promise<Channel<Bytes>> {
        if (this.#closed) {
            throw new NetworkError("Network interface is closed");
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
                if (!resolvedOrRejected) {
                    resolvedOrRejected = true;
                    resolve(value);
                } else {
                    logger.debug(`Already resolved or rejected, ignore success`);
                }
            }

            if (this.#onMatterMessageListener === undefined) {
                rejectOnce(
                    new InternalError(`Network Interface was not added to the system yet, so can not connect it.`),
                );
                return;
            }
            if (address.type !== "ble") {
                rejectOnce(new InternalError(`Unsupported address type ${address.type}.`));
                return;
            }
            const { peripheralAddress } = address;
            if (tryCount > 3) {
                rejectOnce(new BleError(`Failed to connect to peripheral ${peripheralAddress}`));
                return;
            }

            // Get the peripheral by address and connect to it.
            const { peripheral, hasAdditionalAdvertisementData } =
                this.#bleScanner.getDiscoveredDevice(peripheralAddress);

            if (this.#openChannels.has(address)) {
                rejectOnce(
                    new BleError(
                        `Peripheral ${peripheralAddress} is already connected. Only one connection supported right now.`,
                    ),
                );
                return;
            }
            if (this.#connectionsInProgress.has(address)) {
                logger.debug(`Connection to peripheral ${peripheralAddress} is already in progress.`);
                return;
            }

            if (peripheral.state === "error") {
                // Weired state, so better cancel here and try a re-discovery
                rejectOnce(
                    new BleError(
                        `Can not connect to peripheral "${peripheralAddress}" because unexpected state "${peripheral.state}"`,
                    ),
                );
                return;
            }

            // Guard object to indicate if the connection was cancelled. This is used as safe guard in some places
            // if data come in delayed after we already gave up.
            const connectionGuard: BleConnectionGuard = {
                // Timeout when trying to connect to the device because sometimes connect fails and noble does
                // not emit an event. If device does not connect we do not try any longer and reject the promise
                // because a re-discovery is the best option to get teh device into a good state again
                connectTimeout: Time.getTimer("BLE connect timeout", Minutes(2), () => {
                    logger.debug(`Timeout while connecting to peripheral ${peripheralAddress}`);
                    // eslint-disable-next-line @typescript-eslint/no-misused-promises
                    peripheral.removeListener("connect", connectHandler);
                    peripheral.removeListener("disconnect", reTryHandler);
                    clearConnectionGuard();
                    rejectOnce(new BleError(`Timeout while connecting to peripheral ${peripheralAddress}`));
                }),
                disconnectTimeout: Time.getTimer("BLE disconnect timeout", Minutes.one, () => {
                    logger.debug(`Timeout while disconnecting to peripheral ${peripheralAddress}`);
                    peripheral.removeListener("disconnect", reTryHandler);
                    clearConnectionGuard();
                    rejectOnce(new BleError(`Timeout while disconnecting to peripheral ${peripheralAddress}`));
                }),
                // Timeout when trying to interview the device because sometimes when no response from device
                // comes noble does not resolve promises
                interviewTimeout: Time.getTimer("BLE interview timeout", Minutes.one, () => {
                    logger.debug(`Timeout while interviewing peripheral ${peripheralAddress}`);
                    peripheral.removeListener("disconnect", reTryHandler);
                    clearConnectionGuard();
                    if (peripheral.state === "connected") {
                        // We accept the dangling promise potentially because we got a timeout on reading data,
                        // so chance is high also disconnect does not work reliably for now
                        peripheral
                            .disconnectAsync()
                            .catch(error => logger.error(`Ignored error while disconnecting`, error));
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
            };

            // Handler to retry the connection. Called on disconnections and errors.
            const reTryHandler = (error?: any) => {
                // Cancel tracking states because we are done in this context
                clearConnectionGuard();
                this.#connectionsInProgress.delete(address);
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                peripheral.removeListener("connect", connectHandler);
                peripheral.removeListener("disconnect", reTryHandler);

                if (error) {
                    logger.error(
                        `Peripheral ${peripheralAddress} disconnected while trying to connect, try again`,
                        error,
                    );
                } else {
                    logger.info(`Peripheral ${peripheralAddress} disconnected while trying to connect, try again`);
                }

                // Try again and chain promises
                this.openChannel(address, tryCount + 1)
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
                    clearConnectionGuard();
                    rejectOnce(new BleError(`Error while connecting to peripheral ${peripheralAddress}`, error));
                    return;
                }
                if (this.#onMatterMessageListener === undefined) {
                    clearConnectionGuard();
                    rejectOnce(new InternalError(`Network Interface was not added to the system yet or was cleared.`));
                    return;
                }

                if (this.#connectionsInProgress.has(address)) {
                    return;
                }
                this.#connectionsInProgress.add(address);

                try {
                    connectionGuard.interviewTimeout.start();
                    const services = await peripheral.discoverServicesAsync([BLE_MATTER_SERVICE_UUID_SHORT]);
                    if (!this.#connectionGuards.has(connectionGuard)) {
                        // Seems that the response was delayed and this process was cancelled in the meantime
                        return;
                    }
                    logger.debug(
                        `Peripheral ${peripheralAddress}: Found services: ${services.map(s => s.uuid).join(", ")}`,
                    );

                    for (const service of services) {
                        logger.debug(`Peripheral ${peripheralAddress}: Handle service: ${service.uuid}`);
                        if (service.uuid !== BLE_MATTER_SERVICE_UUID_SHORT) continue;

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
                                case BLE_MATTER_C1_CHARACTERISTIC_UUID:
                                    logger.debug(`Peripheral ${peripheralAddress}: Found C1 characteristic`);
                                    characteristicC1ForWrite = characteristic;
                                    break;

                                case BLE_MATTER_C2_CHARACTERISTIC_UUID:
                                    logger.debug(`Peripheral ${peripheralAddress}: Found C2 characteristic`);
                                    characteristicC2ForSubscribe = characteristic;
                                    break;

                                case BLE_MATTER_C3_CHARACTERISTIC_UUID:
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
                        this.#openChannels.set(address, peripheral);
                        try {
                            resolveOnce(
                                await NobleBleChannel.create(
                                    peripheral,
                                    characteristicC1ForWrite,
                                    characteristicC2ForSubscribe,
                                    this.#onMatterMessageListener,
                                    additionalCommissioningRelatedData,
                                ),
                            );
                            clearConnectionGuard();
                            this.#connectionsInProgress.delete(address);
                        } catch (error) {
                            this.#connectionsInProgress.delete(address);
                            this.#openChannels.delete(address);
                            if (peripheral.state === "connected") {
                                logger.debug(
                                    `Disconnect because of initialization error of peripheral ${ServerAddress.urlFor(address)}`,
                                );
                                await peripheral
                                    .disconnectAsync()
                                    .catch(error =>
                                        logger.debug(
                                            `Peripheral ${peripheral.address}: Error while disconnecting`,
                                            error,
                                        ),
                                    );
                            }
                            reTryHandler(error);
                            return;
                        }
                    }
                } finally {
                    this.#connectionsInProgress.delete(address);
                    clearConnectionGuard();
                }

                peripheral.removeListener("disconnect", reTryHandler);
                rejectOnce(
                    new BleError(`Peripheral ${peripheralAddress} does not have the required Matter characteristics`),
                );
            };

            if (peripheral.state === "connected") {
                logger.debug(`Peripheral ${peripheralAddress}: Already connected`);
                connectHandler().catch(error => logger.warn(`Error while connecting`, error)); // Error should never happen
            } else if (peripheral.state === "disconnecting") {
                logger.debug(`Peripheral ${peripheralAddress}: Disconnect in progress`);
                connectionGuard.disconnectTimeout.start();
                tryCount--;
                peripheral.once("disconnect", reTryHandler);
            } else {
                if (peripheral.state === "connecting") {
                    peripheral.cancelConnect(); // Send cancel to noble to make sure we can connect
                }
                // connecting, disconnected
                connectionGuard.connectTimeout.start();
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                peripheral.once("connect", connectHandler);
                peripheral.once("disconnect", reTryHandler);
                logger.debug(`Peripheral ${peripheralAddress}: Connect to Peripheral now (try ${tryCount})`);
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

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): ConnectionlessTransport.Listener {
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
                    .catch(error => logger.error(`Peripheral ${peripheral.address}: Error while disconnecting`, error));
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

export class NobleBleChannel extends BleChannel<Bytes> {
    static async create(
        peripheral: Peripheral,
        characteristicC1ForWrite: Characteristic,
        characteristicC2ForSubscribe: Characteristic,
        onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void,
        _additionalCommissioningRelatedData?: Bytes,
    ): Promise<NobleBleChannel> {
        const { address: peripheralAddress } = peripheral;
        let mtu = peripheral.mtu ?? 0;
        if (mtu > BLE_MAXIMUM_BTP_MTU) {
            mtu = BLE_MAXIMUM_BTP_MTU;
        }
        logger.debug(
            `Peripheral ${peripheralAddress}: Using MTU=${mtu} bytes (Peripheral supports up to ${peripheral.mtu} bytes)`,
        );

        const {
            promise: handshakeResponseReceivedPromise,
            resolver: handshakeResolver,
            rejecter: handshakeRejecter,
        } = createPromise<Buffer>();

        const handshakeHandler = (data: Buffer, isNotification: boolean) => {
            if (data[0] === 0x65 && data[1] === 0x6c && data.length === 6) {
                // Check if the first two bytes and length match the Matter handshake
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

        const btpHandshakeTimeout = Time.getTimer("BLE handshake timeout", BTP_CONN_RSP_TIMEOUT, async () => {
            characteristicC2ForSubscribe.removeListener("data", handshakeHandler);

            await characteristicC2ForSubscribe
                .unsubscribeAsync()
                .catch(error => logger.error(`Peripheral ${peripheralAddress}: Error while unsubscribing`, error));

            logger.debug(
                `Peripheral ${peripheralAddress}: Handshake Response not received. Disconnect from peripheral`,
            );

            handshakeRejecter(new BleError(`Peripheral ${peripheralAddress}: Handshake Response not received`));
        }).start();

        const btpHandshakeRequest = BtpCodec.encodeBtpHandshakeRequest({
            versions: BTP_SUPPORTED_VERSIONS,
            attMtu: mtu,
            clientWindowSize: BTP_MAXIMUM_WINDOW_SIZE,
        });

        logger.debug(
            `Peripheral ${peripheralAddress}: Sending BTP handshake request: ${Diagnostic.json(btpHandshakeRequest)}`,
        );
        await characteristicC1ForWrite.writeAsync(Buffer.from(Bytes.of(btpHandshakeRequest)), false);

        characteristicC2ForSubscribe.once("data", handshakeHandler);

        logger.debug(`Peripheral ${peripheralAddress}: Subscribing to C2 characteristic`);
        await characteristicC2ForSubscribe.subscribeAsync();

        const handshakeResponse = await handshakeResponseReceivedPromise;

        const btpSession = await BtpSessionHandler.createAsCentral(
            new Uint8Array(handshakeResponse),
            // callback to write data to characteristic C1
            async (data: Bytes) => {
                return await characteristicC1ForWrite.writeAsync(Buffer.from(Bytes.of(data)), false);
            },
            // callback to disconnect the BLE connection
            async () => {
                if (peripheral.state !== "connected" || !nobleChannel.connected) return;
                logger.debug(`Peripheral ${peripheralAddress}: Disconnect from peripheral because btp session closed`);
                characteristicC2ForSubscribe.unsubscribeAsync().then(
                    () =>
                        peripheral.disconnectAsync().then(
                            () => logger.debug(`Peripheral ${peripheralAddress}: Disconnected from peripheral`),
                            error => logger.debug(`Peripheral ${peripheralAddress}: Error while unsubscribing`, error),
                        ),
                    error => logger.debug(`Peripheral ${peripheralAddress}: Error while disconnecting`, error),
                );
            },

            // callback to forward decoded and de-assembled Matter messages to ExchangeManager
            async (data: Bytes) => {
                if (onMatterMessageListener === undefined) {
                    throw new InternalError(`No listener registered for Matter messages`);
                }
                onMatterMessageListener(nobleChannel, data);
            },
        );

        characteristicC2ForSubscribe.on("data", (data, isNotification) => {
            logger.debug(
                `Peripheral ${peripheralAddress}: received data on C2: ${data.toString("hex")} (isNotification: ${isNotification})`,
            );

            void btpSession.handleIncomingBleData(new Uint8Array(data));
        });

        const nobleChannel = new NobleBleChannel(peripheral, btpSession);
        return nobleChannel;
    }

    #connected = true;

    constructor(
        private readonly peripheral: Peripheral,
        private readonly btpSession: BtpSessionHandler,
    ) {
        super();
        peripheral.once("disconnect", () => {
            logger.debug(`Disconnected from peripheral ${peripheral.address}. Closing BTP session`);
            this.#connected = false;
            void this.btpSession.close();
        });
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
        if (!this.connected) {
            logger.debug(
                `Peripheral ${this.peripheral.address}: Cannot send data because not connected to peripheral.`,
            );
            return;
        }
        if (this.btpSession === undefined) {
            throw new BtpFlowError(
                `Peripheral ${this.peripheral.address}: Cannot send data, no BTP session initialized`,
            );
        }
        await this.btpSession.sendMatterMessage(data);
    }

    // Channel<Bytes>
    get name() {
        return `${this.type}://${this.peripheral.address}`;
    }

    async close() {
        await this.btpSession.close();
        if (this.connected) {
            this.peripheral
                .disconnectAsync()
                .catch(error =>
                    logger.error(`Peripheral ${this.peripheral.address}: Error while disconnecting`, error),
                );
        }
    }
}
