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
    ServerAddress,
    Time,
    createPromise,
} from "#general";
import {
    BLE_MATTER_C1_CHARACTERISTIC_UUID,
    BLE_MATTER_C2_CHARACTERISTIC_UUID,
    BLE_MATTER_C3_CHARACTERISTIC_UUID,
    BLE_MATTER_SERVICE_UUID,
    BLE_MAXIMUM_BTP_MTU,
    BTP_CONN_RSP_TIMEOUT,
    BTP_MAXIMUM_WINDOW_SIZE,
    BTP_SUPPORTED_VERSIONS,
    Ble,
    BleChannel,
    BleError,
    BtpCodec,
    BtpFlowError,
    BtpSessionHandler,
} from "#protocol";
import {
    BleErrorCode,
    Characteristic,
    Device,
    BleError as ReactNativeBleError,
    Subscription,
} from "react-native-ble-plx";
import { BleScanner } from "./BleScanner.js";

const logger = Logger.get("BleChannel");

export class ReactNativeBleCentralInterface implements ConnectionlessTransport {
    #ble: Ble;
    #openChannels: Map<ServerAddress, Device> = new Map();
    #onMatterMessageListener: ((socket: Channel<Bytes>, data: Bytes) => void) | undefined;

    constructor(ble: Ble) {
        this.#ble = ble;
    }

    async openChannel(address: ServerAddress): Promise<Channel<Bytes>> {
        if (address.type !== "ble") {
            throw new InternalError(`Unsupported address type ${address.type}.`);
        }
        if (this.#onMatterMessageListener === undefined) {
            throw new InternalError(`Network Interface was not added to the system yet.`);
        }

        // Get the peripheral by address and connect to it.
        const { peripheral, hasAdditionalAdvertisementData } = (this.#ble.scanner as BleScanner).getDiscoveredDevice(
            address.peripheralAddress,
        );
        if (this.#openChannels.has(address)) {
            throw new BleError(
                `Peripheral ${address.peripheralAddress} is already connected. Only one connection supported right now.`,
            );
        }
        logger.debug(`Connect to Peripheral now`);
        let device: Device;
        try {
            device = await peripheral.connect();
            await device.requestMTU(BLE_MAXIMUM_BTP_MTU);
        } catch (error) {
            if (error instanceof ReactNativeBleError && error.errorCode === BleErrorCode.DeviceAlreadyConnected) {
                device = peripheral;
            } else {
                throw new BleError(`Error connecting to peripheral: ${(error as any).message}`);
            }
        }
        logger.debug(`Peripheral connected successfully, MTU = ${device.mtu}`);

        // Once the peripheral has been connected, then discover the services and characteristics of interest.
        device = await device.discoverAllServicesAndCharacteristics();

        const services = await device.services();

        for (const service of services) {
            logger.debug(`found service: ${service.uuid}`);
            if (service.uuid.toUpperCase() !== BLE_MATTER_SERVICE_UUID) continue;

            // So, discover its characteristics.
            const characteristics = await device.characteristicsForService(service.uuid);

            let characteristicC1ForWrite: Characteristic | undefined;
            let characteristicC2ForSubscribe: Characteristic | undefined;
            let additionalCommissioningRelatedData: Bytes | undefined;

            for (const characteristic of characteristics) {
                // Loop through each characteristic and match them to the UUIDs that we know about.
                logger.debug("found characteristic:", characteristic.uuid);

                switch (characteristic.uuid.toUpperCase()) {
                    case BLE_MATTER_C1_CHARACTERISTIC_UUID:
                        logger.debug("found C1 characteristic");
                        characteristicC1ForWrite = characteristic;
                        break;

                    case BLE_MATTER_C2_CHARACTERISTIC_UUID:
                        logger.debug("found C2 characteristic");
                        characteristicC2ForSubscribe = characteristic;
                        break;

                    case BLE_MATTER_C3_CHARACTERISTIC_UUID:
                        logger.debug("found C3 characteristic");
                        if (hasAdditionalAdvertisementData) {
                            logger.debug("reading additional commissioning related data");
                            const characteristicWithValue = await service.readCharacteristic(characteristic.uuid);
                            if (characteristicWithValue.value !== null) {
                                additionalCommissioningRelatedData = Bytes.fromBase64(characteristicWithValue.value);
                            } else {
                                logger.debug("no value in characteristic C3");
                            }
                        }
                }
            }

            if (!characteristicC1ForWrite || !characteristicC2ForSubscribe) {
                logger.debug("missing characteristics");
                continue;
            }

            this.#openChannels.set(address, device);
            return await ReactNativeBleChannel.create(
                device,
                characteristicC1ForWrite,
                characteristicC2ForSubscribe,
                this.#onMatterMessageListener,
                additionalCommissioningRelatedData,
            );
        }

        throw new BleError(`No Matter service found on peripheral ${device.id}`);
    }

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): ConnectionlessTransport.Listener {
        this.#onMatterMessageListener = listener;
        return {
            close: async () => await this.close(),
        };
    }

    async close() {
        for (const peripheral of this.#openChannels.values()) {
            await peripheral.cancelConnection();
        }
    }

    supports(type: ChannelType) {
        return type === ChannelType.BLE;
    }
}

export class ReactNativeBleChannel extends BleChannel<Bytes> {
    static async create(
        peripheral: Device,
        characteristicC1ForWrite: Characteristic,
        characteristicC2ForSubscribe: Characteristic,
        onMatterMessageListener: (socket: Channel<Bytes>, data: Bytes) => void,
        _additionalCommissioningRelatedData?: Bytes,
    ): Promise<ReactNativeBleChannel> {
        let mtu = peripheral.mtu ?? 0;
        if (mtu > BLE_MAXIMUM_BTP_MTU) {
            mtu = BLE_MAXIMUM_BTP_MTU;
        }
        logger.debug(`Using MTU=${mtu} (Peripheral MTU=${peripheral.mtu})`);
        const btpHandshakeRequest = BtpCodec.encodeBtpHandshakeRequest({
            versions: BTP_SUPPORTED_VERSIONS,
            attMtu: mtu,
            clientWindowSize: BTP_MAXIMUM_WINDOW_SIZE,
        });
        logger.debug(`sending BTP handshake request: ${Diagnostic.json(btpHandshakeRequest)}`);
        characteristicC1ForWrite = await characteristicC1ForWrite.writeWithResponse(
            Bytes.toBase64(btpHandshakeRequest),
        );

        const btpHandshakeTimeout = Time.getTimer("BLE handshake timeout", BTP_CONN_RSP_TIMEOUT, async () => {
            await peripheral.cancelConnection();
            logger.debug("Handshake Response not received. Disconnected from peripheral");
        }).start();

        logger.debug("subscribing to C2 characteristic");

        const { promise: handshakeResponseReceivedPromise, resolver } = createPromise<Bytes>();

        let handshakeReceived = false;
        // ignore the response because it seems when we remove a subscription the whole connection is closed
        characteristicC2ForSubscribe.monitor((error, characteristic) => {
            if (handshakeReceived) {
                // Make sure data potentially submitted here after handshake was received are ignored
                return;
            }
            if (error !== null || characteristic === null) {
                if (error instanceof ReactNativeBleError && error.errorCode === 2 && handshakeReceived) {
                    // Subscription got removed after handshake was received, all good
                    return;
                }
                logger.debug("Error while monitoring C2 characteristic", error);
                return;
            }
            const characteristicData = characteristic.value;
            if (characteristicData === null) {
                logger.debug("C2 characteristic value is null");
                return;
            }
            const data = Bytes.of(Bytes.fromBase64(characteristicData));
            logger.debug(`received first data on C2: ${Bytes.toHex(data)}`);

            if (data[0] === 0x65 && data[1] === 0x6c && data.length === 6) {
                // Check if the first two bytes and length match the Matter handshake
                logger.info(`Received Matter handshake response: ${Bytes.toHex(data)}.`);
                btpHandshakeTimeout.stop();
                resolver(data);
            }
        });

        const handshakeResponse = await handshakeResponseReceivedPromise;
        handshakeReceived = true;

        let connectionCloseExpected = false;
        const btpSession = await BtpSessionHandler.createAsCentral(
            handshakeResponse,
            // callback to write data to characteristic C1
            async data => {
                characteristicC1ForWrite = await characteristicC1ForWrite.writeWithResponse(Bytes.toBase64(data));
            },
            // callback to disconnect the BLE connection
            async () => {
                connectionCloseExpected = true;
                await peripheral.cancelConnection();
                logger.debug("disconnected from peripheral");
            },

            // callback to forward decoded and de-assembled Matter messages to ExchangeManager
            async data => {
                if (onMatterMessageListener === undefined) {
                    throw new InternalError(`No listener registered for Matter messages`);
                }
                onMatterMessageListener(bleChannel, data);
            },
        );

        // ignore the response because it seems when we remove a subscription the whole connection is closed
        characteristicC2ForSubscribe.monitor((error, characteristic) => {
            if (error !== null || characteristic === null) {
                if (error instanceof ReactNativeBleError && error.errorCode === 2 && connectionCloseExpected) {
                    // Subscription got removed and received, all good
                    return;
                }
                logger.debug("Error while monitoring C2 characteristic", error);
                return;
            }
            const characteristicData = characteristic.value;
            if (characteristicData === null) {
                logger.debug("C2 characteristic value is null");
                return;
            }
            const data = Bytes.fromBase64(characteristicData);
            logger.debug(`received data on C2: ${Bytes.toHex(data)}`);

            void btpSession.handleIncomingBleData(data);
        });

        const bleChannel = new ReactNativeBleChannel(peripheral, btpSession);
        return bleChannel;
    }

    private connected = true;
    private disconnectSubscription: Subscription;

    constructor(
        private readonly peripheral: Device,
        private readonly btpSession: BtpSessionHandler,
    ) {
        super();
        this.disconnectSubscription = peripheral.onDisconnected(error => {
            logger.debug(`Disconnected from peripheral ${peripheral.id}: ${error}`);
            this.connected = false;
            this.disconnectSubscription.remove();
            void this.btpSession.close();
        });
    }

    /**
     * Send a Matter message to the connected device - need to do BTP assembly first.
     *
     * @param data
     */
    async send(data: Bytes) {
        if (!this.connected) {
            logger.debug("Cannot send data because not connected to peripheral.");
            return;
        }
        if (this.btpSession === undefined) {
            throw new BtpFlowError(`Cannot send data, no BTP session initialized`);
        }
        await this.btpSession.sendMatterMessage(data);
    }

    // Channel<Bytes>
    get name() {
        return `ble://${this.peripheral.id}`;
    }

    async close() {
        await this.btpSession.close();
        this.disconnectSubscription.remove();
        await this.peripheral.cancelConnection();
    }
}
