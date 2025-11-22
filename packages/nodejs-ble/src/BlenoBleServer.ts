/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Channel, InternalError, Logger, Millis, Time, createPromise } from "#general";
import {
    BLE_MATTER_C1_CHARACTERISTIC_UUID,
    BLE_MATTER_C2_CHARACTERISTIC_UUID,
    BLE_MATTER_C3_CHARACTERISTIC_UUID,
    BLE_MATTER_SERVICE_UUID_SHORT,
    BTP_CONN_RSP_TIMEOUT,
    BleChannel,
    BleError,
    BtpFlowError,
    BtpSessionHandler,
    SessionClosedError,
} from "#protocol";
import { require } from "@matter/nodejs-ble/require";
import type { Bleno as BlenoType } from "@stoprocent/bleno";
import { BleOptions } from "./NodeJsBle.js";

const logger = Logger.get("BlenoBleServer");
let Bleno: BlenoType;

function initializeBleno(server: BlenoBleServer, hciId?: number) {
    // load Bleno driver with the correct device selected
    if (hciId !== undefined) {
        process.env.BLENO_HCI_DEVICE_ID = hciId.toString();
    }
    Bleno = require("@stoprocent/bleno");

    class BtpWriteCharacteristicC1 extends Bleno.Characteristic {
        constructor() {
            super({
                uuid: BLE_MATTER_C1_CHARACTERISTIC_UUID,
                properties: ["write"],
                onWriteRequest: (_handle, data, offset, withoutResponse, callback) =>
                    this.#onWriteRequest(data, offset, withoutResponse, callback),
            });
        }

        #onWriteRequest(
            data: Buffer<ArrayBufferLike>,
            offset: number,
            withoutResponse: boolean,
            callback: (result: number) => void,
        ) {
            logger.debug(`C1 write request: ${data.toString("hex")} ${offset} ${withoutResponse}`);

            try {
                server.handleC1WriteRequest(data, offset, withoutResponse);
                callback(this.RESULT_SUCCESS);
            } catch (e) {
                logger.error(`C1 write request failed: ${e}`);
                callback(this.RESULT_UNLIKELY_ERROR);
            }
        }
    }

    class BtpIndicateCharacteristicC2 extends Bleno.Characteristic {
        constructor() {
            super({
                uuid: BLE_MATTER_C2_CHARACTERISTIC_UUID,
                properties: ["indicate"],
                onSubscribe: (_handle, maxValueSize, updateValueCallback) =>
                    this.#onSubscribe(maxValueSize, updateValueCallback),
                onUnsubscribe: () => this.#onUnsubscribe(),
                onIndicate: () => this.#onIndicate(),
            });
        }

        #onSubscribe(maxValueSize: number, updateValueCallback: (data: Buffer) => void) {
            logger.debug(`C2 subscribe ${maxValueSize}`);

            server
                .handleC2SubscribeRequest(maxValueSize, updateValueCallback)
                .catch(e => logger.warn("Error happened in when handling C2 subscribe", e));
        }

        #onUnsubscribe() {
            logger.debug("C2 unsubscribe");
            server.close().catch(e => logger.warn("Error happened when closing server for C2 unsubscribe", e));
        }

        #onIndicate() {
            logger.debug("C2 indicate");
            server.handleC2Indicate();
        }
    }

    class BtpReadCharacteristicC3 extends Bleno.Characteristic {
        constructor() {
            super({
                uuid: BLE_MATTER_C3_CHARACTERISTIC_UUID,
                properties: ["read"],
                onReadRequest: (_handle, offset, callback) => this.#onReadRequest(offset, callback),
            });
        }

        #onReadRequest(offset: number, callback: (result: number, data?: Buffer) => void) {
            try {
                const data = server.handleC3ReadRequest(offset);
                logger.debug(`C3 read request: ${data.toString("hex")} ${offset}`);
                callback(this.RESULT_SUCCESS, data);
            } catch (e) {
                logger.debug(`C3 read request failed : ${e} ${offset}`);
                callback(this.RESULT_INVALID_OFFSET);
            }
        }
    }

    class BtpService extends Bleno.PrimaryService {
        constructor() {
            super({
                uuid: BLE_MATTER_SERVICE_UUID_SHORT,
                characteristics: [
                    new BtpWriteCharacteristicC1(),
                    new BtpIndicateCharacteristicC2(),
                    new BtpReadCharacteristicC3(),
                ],
            });
        }
    }

    return new BtpService();
}

/**
 * Implements the Matter over BLE server using Bleno as Peripheral.
 *
 * Note: Bleno is only supporting a single connection at a time right now - mainly because it also only can announce
 * one BLE device at a time!
 */
export class BlenoBleServer extends BleChannel<Bytes> {
    private state = "unknown";
    isAdvertising = false;
    private additionalAdvertisingData: Buffer = Buffer.alloc(0);
    private advertisingData: Buffer | undefined;

    private latestHandshakePayload: Buffer | undefined;
    private btpSession: BtpSessionHandler | undefined;

    private onMatterMessageListener: ((socket: Channel<Bytes>, data: Bytes) => void) | undefined;
    private writeConformationResolver: ((value: void) => void) | undefined;

    public clientAddress: string | undefined;
    private btpHandshakeTimeout = Time.getTimer("BTP handshake timeout", BTP_CONN_RSP_TIMEOUT, () =>
        this.btpHandshakeTimeoutTriggered(),
    );
    #disconnected = false;
    #closing = false;

    private readonly matterBleService;

    constructor(options?: BleOptions) {
        super();

        const { environment } = options ?? {};
        environment?.runtime.add(this);

        this.matterBleService = initializeBleno(this, options?.hciId);

        // Write Bleno into this class
        Bleno.on("stateChange", state => {
            if (state === this.state) return;
            this.state = state;
            logger.debug(`stateChange: ${state}, address = ${Bleno.address}`);
            if (state !== "poweredOn") {
                // When we shut down we expect a state change but can not call any command anmore
                if (this.#disconnected || this.#closing) return;
                Bleno.stopAdvertising();
            } else if (this.advertisingData) {
                Bleno.startAdvertisingWithEIRData(this.advertisingData);
                this.isAdvertising = true;
            }
        });

        // Linux only events /////////////////
        Bleno.on("accept", clientAddress => {
            logger.debug(`accept new connection, client: ${clientAddress}`);
            this.clientAddress = clientAddress;
            Bleno.updateRssi();
        });

        Bleno.on("disconnect", clientAddress => {
            logger.debug(`disconnect, client: ${clientAddress}`);
            this.isAdvertising = false;
            if (this.btpSession !== undefined) {
                this.btpSession
                    .close()
                    .then(() => {
                        this.btpSession = undefined;
                    })
                    .catch(() => {
                        this.btpSession = undefined;
                    });
            }
        });

        Bleno.on("rssiUpdate", rssi => {
            logger.debug(`rssiUpdate: ${rssi}`);
        });
        //////////////////////////////////////

        Bleno.on("mtuChange", mtu => {
            logger.debug(`mtuChange: ${mtu}`);
        });

        Bleno.on("advertisingStart", error => {
            logger.debug(`advertisingStart: ${error ? `error ${error}` : "success"}`);

            if (!error) {
                Bleno.setServices([this.matterBleService]);
            }
            // TODO handle transport error
        });

        Bleno.on("advertisingStop", () => {
            logger.debug("advertisingStop");
        });

        Bleno.on("servicesSet", error => {
            logger.debug(`servicesSet: ${error ? `error ${error}` : "success"}`);
        });
    }

    /**
     * Process a Write request on characteristic C1 from the Matter service.
     * The data are checked if it might be a handshake request and stored until the subscribe request comes in.
     * Otherwise, the data are forwarded to the BTP session handler to be decoded and processed.
     *
     * @param data
     * @param offset
     * @param withoutResponse
     */
    handleC1WriteRequest(data: Buffer<ArrayBufferLike>, offset: number, withoutResponse: boolean) {
        if (offset !== 0 || withoutResponse) {
            throw new BleError(`Offset ${offset} or withoutResponse ${withoutResponse} not supported`);
        }

        if (data[0] === 0x65 && data[1] === 0x6c && data.length === 9) {
            // Check if the first two bytes and length match the Matter handshake
            this.btpHandshakeTimeout.start(); // starts timer

            logger.info(
                `Received Matter handshake request: ${data.toString("hex")}, store until subscribe request comes in.`,
            );
            this.latestHandshakePayload = data;
            // TODO Handle edge case where handshake comes with an already open BTP session (should never happen?)
        } else {
            if (this.btpSession !== undefined) {
                logger.debug(`Received Matter data for BTP Session: ${data.toString("hex")}`);
                void this.btpSession.handleIncomingBleData(new Uint8Array(data));
            } else {
                throw new BtpFlowError(
                    `Received Matter data but no BTP session was initialized: ${data.toString("hex")}`,
                );
            }
        }
    }

    /**
     * Process a Subscribe request on characteristic C2 from the Matter service.
     * This is expected directly after a handshake request and initializes the BTP session handler with the stored
     * handshake payload.
     * The BtpSessionHandler instance is wired with the bleno instance for sending data and disconnecting.
     *
     * @param maxValueSize
     * @param updateValueCallback
     */
    async handleC2SubscribeRequest(maxValueSize: number, updateValueCallback: (data: Buffer) => void) {
        if (this.latestHandshakePayload === undefined) {
            throw new BtpFlowError(`Subscription request received before handshake Request`);
        }
        if (this.btpSession !== undefined) {
            throw new BtpFlowError(
                `Subscription request received but BTP session already initialized. Cannot handle two sessions!`,
            );
        }
        this.btpHandshakeTimeout.stop();

        this.btpSession = await BtpSessionHandler.createFromHandshakeRequest(
            Math.min(Bleno.mtu - 3, maxValueSize),
            new Uint8Array(this.latestHandshakePayload),

            // callback to write data to characteristic C2
            async (data: Bytes) => {
                updateValueCallback(Buffer.from(Bytes.of(data)));
                const { promise, resolver } = createPromise<void>();
                this.writeConformationResolver = resolver;

                return promise;
            },

            // callback to disconnect the BLE connection
            async () => this.close(),

            // callback to forward decoded and de-assembled Matter messages to ExchangeManager
            async (data: Bytes) => {
                if (this.onMatterMessageListener === undefined) {
                    throw new InternalError(`No listener registered for Matter messages`);
                }
                this.onMatterMessageListener(this, data);
            },
        );
        this.latestHandshakePayload = undefined; // BTP Session initialized, handshake payload not needed anymore
    }

    handleC2Indicate() {
        if (this.writeConformationResolver !== undefined) {
            this.writeConformationResolver();
            this.writeConformationResolver = undefined;
        } else {
            logger.warn(`Received C2 indication but no former write expected a confirmation`);
        }
    }

    /**
     * Process a Read request on characteristic C3 from the Matter service.
     * The relevant data needs optionally to be set before advertising, else empty data are used.
     *
     * @param offset
     */
    handleC3ReadRequest(offset: number) {
        if (offset > this.additionalAdvertisingData.length) {
            throw new BleError(`Offset ${offset} is larger than data ${this.additionalAdvertisingData.length}`);
        } else {
            return this.additionalAdvertisingData.subarray(offset);
        }
    }

    async advertise(advertiseData: Bytes, additionalAdvertisementData?: Bytes, interval = Millis(100)) {
        process.env["BLENO_ADVERTISING_INTERVAL"] = interval.toString();

        this.advertisingData = Buffer.from(Bytes.of(advertiseData));

        if (additionalAdvertisementData) {
            this.additionalAdvertisingData = Buffer.from(Bytes.of(additionalAdvertisementData));
        } else {
            this.additionalAdvertisingData = Buffer.alloc(0);
        }

        if (this.isAdvertising) {
            await this.stopAdvertising();
            this.isAdvertising = false;
        }

        if (this.state === "poweredOn") {
            Bleno.startAdvertisingWithEIRData(this.advertisingData);
            this.isAdvertising = true;
        } else {
            logger.debug(`State is ${this.state}, advertise when powered on`);
        }
        return new Promise<void>(resolve => {
            Bleno.once("advertisingStart", () => resolve());
        });
    }

    async stopAdvertising() {
        if (this.isAdvertising) {
            return new Promise<void>(resolve => {
                Bleno.stopAdvertising();
                Bleno.once("advertisingStop", () => {
                    this.isAdvertising = false;
                    resolve();
                });
            });
        }
    }

    setMatterMessageListener(listener: (socket: Channel<Bytes>, data: Bytes) => void) {
        if (this.onMatterMessageListener !== undefined) {
            throw new InternalError(`onData listener already set`);
        }
        this.onMatterMessageListener = listener;
    }

    async btpHandshakeTimeoutTriggered() {
        await this.disconnect();
        logger.error("Timeout for handshake subscribe request on C2 reached, disconnecting.");
    }

    async close() {
        if (this.#closing) {
            return;
        }
        this.#closing = true;
        this.btpHandshakeTimeout.stop();
        await this.disconnect();
        if (this.btpSession !== undefined) {
            await this.btpSession.close();
            this.btpSession = undefined;
        }
        this.onMatterMessageListener = undefined;
    }

    async disconnect() {
        this.isAdvertising = false;
        if (this.#disconnected) {
            return;
        }
        this.#disconnected = true;
        logger.debug(`Disconnecting Bleno`);
        Bleno.disconnect();
        logger.debug(`Stopping Bleno`);
        Bleno.stop();
        /*
        TODO: This is not working as expected, the disconnect event is not triggered, seems issue in Bleno
        return new Promise<void>(resolve => {
            Bleno.once("disconnect", () => {
                console.log("DISCONNECTED");
                resolve();
            });
        });*/
    }

    // Channel<Bytes>
    /**
     * Send a Matter message to the connected device - need to do BTP assembly first.
     *
     * @param data
     */
    async send(data: Bytes) {
        if (this.btpSession === undefined) {
            throw new SessionClosedError(`Cannot send data, no BTP session initialized`);
        }
        await this.btpSession.sendMatterMessage(data);
    }

    // Channel<Bytes>
    get name() {
        return `${this.type}://${this.clientAddress}`;
    }
}
