/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Diagnostic, Logger } from "@matter/general";
import { require } from "@matter/nodejs-ble/require";
import { MatterBle } from "@matter/protocol";
import type { Noble, Peripheral } from "@stoprocent/noble";
import { BleOptions } from "./NodeJsBle.js";

const logger = Logger.get("NobleBleClient");
let noble: Noble;
let hciStatusMessage: (reason: number) => string;

function loadNoble(hciId?: number) {
    // load noble driver with the correct device selected
    if (hciId !== undefined) {
        process.env.NOBLE_HCI_DEVICE_ID = hciId.toString();
    }
    const nobleExports = require("@stoprocent/noble");
    hciStatusMessage = nobleExports.hciStatusMessage;
    noble = nobleExports;
    if (typeof noble.on !== "function") {
        // The following commit broke the default exported instance of noble:
        // https://github.com/abandonware/noble/commit/b67eea246f719947fc45b1b52b856e61637a8a8e
        noble = nobleExports({ extended: false });
    }
}

/**
 * Render a noble disconnect reason. Linux HCI bindings report a numeric controller status, other bindings a
 * descriptive string.
 */
export function nobleDisconnectReason(reason: unknown) {
    if (typeof reason === "number") {
        return `0x${reason.toString(16).padStart(2, "0")} (${hciStatusMessage(reason)})`;
    }
    return reason === undefined ? "unknown" : String(reason);
}

interface NobleListeners {
    stateChange: (state: string) => void;
    discover: (peripheral: Peripheral) => void;
    scanStart: () => void;
    scanStop: () => void;
}

export class NobleBleClient {
    private readonly discoveredPeripherals = new Map<string, { peripheral: Peripheral; matterServiceData: Bytes }>();
    private shouldScan = false;
    private isScanning = false;
    private nobleState = "unknown";
    #scanDeferred = false;
    private deviceDiscoveredCallback: ((peripheral: Peripheral, manufacturerData: Bytes) => void) | undefined;
    #closing = false;
    readonly #listeners: NobleListeners;

    constructor(options?: BleOptions) {
        const { environment } = options ?? {};
        environment?.runtime.add(this);

        loadNoble(options?.hciId);
        /*try {
            noble.reset();
        } catch (error: any) {
            logger.debug(
                `Error resetting BLE device via noble (can be ignored, we just tried): ${
                    (error as unknown as Error).message
                }`,
            );
        }*/
        this.#listeners = {
            stateChange: state => {
                this.nobleState = state;
                logger.debug(`Noble state changed to ${state}`);
                if (state === "poweredOn") {
                    if (this.shouldScan) {
                        const deferred = this.#scanDeferred;
                        this.startScanning().then(
                            () => {
                                if (deferred) {
                                    logger.notice("Bluetooth adapter is powered on, BLE discovery started");
                                }
                            },
                            error => logger.error("Cannot start BLE discovery after the adapter powered on:", error),
                        );
                    }
                } else {
                    this.stopScanning().catch(error => logger.error("Cannot stop BLE discovery:", error));
                }
            },

            discover: peripheral => this.handleDiscoveredDevice(peripheral),

            scanStart: () => {
                if (!this.shouldScan) {
                    // Noble sometimes emits scanStart when we did not asked for and misses the scanStop event
                    // TODO: Remove as soon as Noble fixed this behavior
                    return;
                }
                this.isScanning = true;
            },

            scanStop: () => (this.isScanning = false),
        };

        noble.on("stateChange", this.#listeners.stateChange);
        noble.on("discover", this.#listeners.discover);
        noble.on("scanStart", this.#listeners.scanStart);
        noble.on("scanStop", this.#listeners.scanStop);
    }

    public setDiscoveryCallback(callback: (peripheral: Peripheral, manufacturerData: Bytes) => void) {
        this.deviceDiscoveredCallback = callback;
        for (const { peripheral, matterServiceData } of this.discoveredPeripherals.values()) {
            this.deviceDiscoveredCallback(peripheral, matterServiceData);
        }
    }

    public async startScanning() {
        if (this.#closing) return;
        if (this.isScanning) {
            this.#scanDeferred = false;
            return;
        }

        this.shouldScan = true;
        if (this.nobleState === "poweredOn") {
            this.#scanDeferred = false;
            logger.debug("Start BLE scanning for Matter Services ...");
            await noble.startScanningAsync([MatterBle.SERVICE_UUID_SHORT], true);
        } else if (!this.#scanDeferred) {
            this.#scanDeferred = true;
            logger.notice(
                `BLE discovery deferred until the Bluetooth adapter reports "poweredOn" (it reports "${this.nobleState}"). Check that Bluetooth is enabled and that this process has the permissions needed to use it.`,
            );
        }
    }

    public async stopScanning() {
        if (this.#closing) return;
        this.shouldScan = false;
        this.#scanDeferred = false;
        if (this.isScanning) {
            logger.debug("Stop BLE scanning for Matter Services ...");
            await noble.stopScanningAsync();
        }
    }

    private handleDiscoveredDevice(peripheral: Peripheral) {
        // The advertisement data contains a name, power level (if available), certain advertised service uuids,
        // as well as manufacturer data.
        // {"localName":"MATTER-3840","serviceData":[{"uuid":"fff6","data":{"type":"Buffer","data":[0,0,15,241,255,1,128,0]}}],"serviceUuids":["fff6"],"solicitationServiceUuids":[],"serviceSolicitationUuids":[]}

        // TODO Remove this Windows hack once Noble Windows issue is fixed
        //  see https://github.com/stoprocent/noble/issues/20
        if (
            process.platform === "win32" &&
            !peripheral.advertisement.serviceData.some(({ uuid }) => MatterBle.isServiceUuid(uuid))
        ) {
            return;
        }

        const address = peripheral.address;
        logger.debug(
            `Found peripheral ${address} (${peripheral.advertisement.localName}): ${Diagnostic.json(
                peripheral.advertisement,
            )}`,
        );

        if (!peripheral.connectable) {
            logger.debug(`Peripheral ${address} is not connectable ... ignoring`);
            return;
        }
        const matterServiceData = peripheral.advertisement.serviceData.find(({ uuid }) =>
            MatterBle.isServiceUuid(uuid),
        );
        if (matterServiceData === undefined || matterServiceData.data.length !== 8) {
            logger.info(`Peripheral ${address} does not advertise Matter Service ... ignoring`);
            return;
        }

        const serviceDataBytes = Bytes.of(matterServiceData.data);
        this.discoveredPeripherals.set(address, { peripheral, matterServiceData: serviceDataBytes });

        this.deviceDiscoveredCallback?.(peripheral, serviceDataBytes);
    }

    close() {
        if (this.#closing) {
            return;
        }
        this.#closing = true;

        logger.debug(`Stopping Noble, adapter state is "${this.nobleState}"`);

        noble.off("stateChange", this.#listeners.stateChange);
        noble.off("discover", this.#listeners.discover);
        noble.off("scanStart", this.#listeners.scanStart);
        noble.off("scanStop", this.#listeners.scanStop);

        try {
            // Windows holds a referenced handle from the first listener on, radio or not, and only stop() releases it
            noble.stop();
        } catch (error) {
            logger.info("Error stopping Noble:", error);
        }
    }

    [Diagnostic.name] = "BLE client";
}
