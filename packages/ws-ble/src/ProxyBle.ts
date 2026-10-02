/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, type Environment, type Transport } from "@matter/general";
import { Ble, type BlePeripheralInterface, type Scanner } from "@matter/protocol";
import type { BleProxyHandler } from "./BleProxyHandler.js";
import { ProxyBleCentralInterface } from "./ProxyBleChannel.js";
import { ProxyBleClient } from "./ProxyBleClient.js";
import { ProxyBleScanner } from "./ProxyBleScanner.js";

/**
 * BLE implementation that proxies all operations over a WebSocket connection, for environments where BLE hardware is
 * reachable only through a remote proxy client.
 *
 * Only central (client) mode is supported; {@link peripheralInterface} throws.
 */
export class ProxyBle extends Ble {
    readonly #handler: BleProxyHandler;
    #proxyBleClient?: ProxyBleClient;
    #bleScanner?: ProxyBleScanner;
    #bleCentralInterface?: ProxyBleCentralInterface;
    #closed = false;

    constructor(handler: BleProxyHandler, environment?: Environment) {
        super();
        this.#handler = handler;
        // Runtime registration makes shutdown drive scanner.close(), which clears pending discovery waiters
        environment?.runtime.add(this);
    }

    get peripheralInterface(): BlePeripheralInterface {
        throw new ImplementationError("BLE Proxy only supports central mode, not peripheral");
    }

    get centralInterface(): Transport {
        if (!this.#bleCentralInterface) {
            this.#bleCentralInterface = new ProxyBleCentralInterface(this.scanner as ProxyBleScanner, this.#handler);
        }
        return this.#bleCentralInterface;
    }

    get scanner(): Scanner {
        if (!this.#bleScanner) {
            if (!this.#proxyBleClient) {
                this.#proxyBleClient = new ProxyBleClient(this.#handler);
            }
            this.#bleScanner = new ProxyBleScanner(this.#proxyBleClient);
        }
        return this.#bleScanner;
    }

    async close(): Promise<void> {
        if (this.#closed) return;
        this.#closed = true;
        await this.#bleCentralInterface?.close();
        // scanner.close() also closes the underlying ProxyBleClient
        await this.#bleScanner?.close();
    }
}
