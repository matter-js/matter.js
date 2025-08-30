/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxError, BdxMessenger } from "#bdx/index.js";
import { BdxStatusCode } from "#types";

/** Base class for BDX transfer flows. */
export abstract class BdxTransferFlow {
    readonly #transferParameters: BdxTransferFlow.TransferOptions;
    readonly #messenger: BdxMessenger;
    #isClosed = false;
    #blockCounter = 0;

    constructor(messenger: BdxMessenger, transferParameters: BdxTransferFlow.TransferOptions) {
        this.#messenger = messenger;
        this.#transferParameters = transferParameters;
    }

    protected get transferParameters(): BdxTransferFlow.TransferOptions {
        return this.#transferParameters;
    }

    protected get isClosed() {
        return this.#isClosed;
    }

    protected get messenger() {
        return this.#messenger;
    }

    /** Determines the next message counter to use for the next message, also handles wrapping around at 2^32. */
    protected get nextMessageCounter() {
        this.#blockCounter = (this.#blockCounter + 1) % 0x100000000; // wrap around at 2^32
        return this.#blockCounter;
    }

    /** Utility function to check if a block counter is valid */
    protected validateCounter(messageBlockCounter: number, expectedCounter = this.nextMessageCounter) {
        if (messageBlockCounter !== expectedCounter) {
            throw new BdxError(
                `Received Block with unexpected block counter: ${messageBlockCounter}, expected: ${expectedCounter}`,
                BdxStatusCode.BadBlockCounter,
            );
        }
        return messageBlockCounter;
    }

    async close(_error?: unknown) {
        this.#isClosed = true;
    }

    /**
     * Main logic method to execute the flow.
     * The promise resolves when the flow is complete, or rejects on any error or unexpected conditions.
     */
    abstract processTransfer(): Promise<void>;
}

export namespace BdxTransferFlow {
    export interface TransferOptions {
        transferMode: DriverMode;
        asynchronousTransfer: false; // Not supported currently, so always false
        dataLength?: number;
        startOffset: number;
        blockSize: number;
    }

    export enum DriverMode {
        SenderDrive = "senderDrive",
        ReceiverDrive = "receiverDrive",
    }
}
