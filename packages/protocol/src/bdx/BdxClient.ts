/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxMessenger } from "./BdxMessenger.js";
import { BdxSession } from "./BdxSession.js";
import { BdxSessionConfiguration } from "./BdxSessionConfiguration.js";

/**
 * BDX Client to initiate a BDX transfer.
 * Unless differently configured it tries to be the Driver of the transfer.
 * Asynchronous transfer is provisional, implemented in theory but disabled internally.
 */
export class BdxClient {
    #session: BdxSession;

    /**
     * Create a BDX client to initiate a BDX transfer as sender.
     * A file designator needs to be provided and needs to exist in the storage context.
     */
    static asSender(messenger: BdxMessenger, options: BdxSessionConfiguration.SenderInitiatorOptions) {
        return new BdxClient(BdxSession.asSender(messenger, options));
    }

    /**
     * Create a BDX client to initiate a BDX transfer as receiver.
     * A file designator needs to be provided. The content will be written to the storage context.
     */
    static asReceiver(messenger: BdxMessenger, options: BdxSessionConfiguration.InitiatorOptions) {
        return new BdxClient(BdxSession.asReceiver(messenger, options));
    }

    constructor(bdxSession: BdxSession) {
        this.#session = bdxSession;
    }

    get progressInfo() {
        return this.#session.progressInfo;
    }

    get progressFinished() {
        return this.#session.progressFinished;
    }

    /** This is the main entry point to initiate and process the BDX transfer. */
    processTransfer() {
        return this.#session.processTransfer();
    }

    close() {
        return this.#session.close();
    }
}
