/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageContext } from "#general";
import { BdxMessenger } from "./BdxMessenger.js";
import { BdxSession } from "./BdxSession.js";
import { FileDesignator } from "./FileDesignator.js";

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
    static asSender(
        storage: StorageContext,
        messenger: BdxMessenger,
        fileDesignator: FileDesignator,
        options?: Omit<BdxSession.SenderInitiatorOptions, "fileDesignator">,
    ) {
        return new BdxClient(BdxSession.asSender(storage, messenger, { fileDesignator, ...options }));
    }

    /**
     * Create a BDX client to initiate a BDX transfer as receiver.
     * A file designator needs to be provided. The content will be written to the storage context.
     */
    static asReceiver(
        storage: StorageContext,
        messenger: BdxMessenger,
        fileDesignator: FileDesignator,
        options?: Omit<BdxSession.InitiatorOptions, "fileDesignator">,
    ) {
        return new BdxClient(BdxSession.asReceiver(storage, messenger, { fileDesignator, ...options }));
    }

    constructor(bdxSession: BdxSession) {
        this.#session = bdxSession;
    }

    /** This is the main entry point to initiate and process the BDX transfer. */
    processTransfer() {
        return this.#session.processTransfer();
    }
}
