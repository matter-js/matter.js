/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConnectionlessTransport, Environment } from "#general";
import { Ble, Scanner } from "#protocol";
import { BlenoBleServer } from "./BlenoBleServer.js";
import { BlenoPeripheralInterface } from "./BlenoPeripheralInterface.js";
import { BleScanner } from "./BleScanner.js";
import { NobleBleCentralInterface } from "./NobleBleChannel.js";
import { NobleBleClient } from "./NobleBleClient.js";

export type BleOptions = {
    hciId?: number;
    environment?: Environment;
};

export class NodeJsBle extends Ble {
    #options?: BleOptions;
    #blePeripheralInstance?: BlenoBleServer;
    #bleCentralInstance?: NobleBleClient;
    #bleScanner?: BleScanner;
    #bleCentralInterface?: NobleBleCentralInterface;
    #blePeripheralInterface?: BlenoPeripheralInterface;

    constructor(options?: BleOptions) {
        super();
        this.#options = options;
        if (options?.environment && options.hciId === undefined) {
            const hciId = options.environment.vars.number("ble.hci.id");
            if (hciId !== undefined) {
                this.#options = {
                    ...options,
                    hciId,
                };
            }
        }
    }

    get #blePeripheralServer() {
        if (this.#blePeripheralInstance === undefined) {
            this.#blePeripheralInstance = new BlenoBleServer(this.#options);
        }
        return this.#blePeripheralInstance;
    }

    get #bleCentralClient() {
        if (this.#bleCentralInstance === undefined) {
            this.#bleCentralInstance = new NobleBleClient(this.#options);
        }
        return this.#bleCentralInstance;
    }

    get peripheralInterface(): BlenoPeripheralInterface {
        if (this.#blePeripheralInterface === undefined) {
            this.#blePeripheralInterface = new BlenoPeripheralInterface(this.#blePeripheralServer);
        }
        return this.#blePeripheralInterface;
    }

    get centralInterface(): ConnectionlessTransport {
        if (this.#bleCentralInterface === undefined) {
            this.#bleCentralInterface = new NobleBleCentralInterface(this.scanner as BleScanner);
        }
        return this.#bleCentralInterface;
    }

    get scanner(): Scanner {
        if (this.#bleScanner === undefined) {
            this.#bleScanner = new BleScanner(this.#bleCentralClient);
        }
        return this.#bleScanner;
    }
}
