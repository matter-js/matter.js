/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { BdxStatusCode } from "#types";
import { BdxError } from "../BdxError.js";
import { BdxMessenger } from "../BdxMessenger.js";
import { PersistedFileDesignator } from "../PersistedFileDesignator.js";

/** Base class for BDX transfer flows. */
export abstract class Flow {
    readonly #transferParameters: Flow.TransferOptions;
    readonly #messenger: BdxMessenger;
    #isClosed = false;
    #blockCounter = 0;
    #bytesLeft?: number;
    #finalBlockCounter?: number;

    constructor(messenger: BdxMessenger, transferParameters: Flow.TransferOptions) {
        this.#messenger = messenger;
        this.#transferParameters = transferParameters;
        this.#bytesLeft = transferParameters.dataLength;
    }

    protected get transferParameters(): Flow.TransferOptions {
        return this.#transferParameters;
    }

    protected get isClosed() {
        return this.#isClosed;
    }

    protected get messenger() {
        return this.#messenger;
    }

    protected get bytesLeft(): number | undefined {
        return this.#bytesLeft;
    }

    protected set bytesLeft(value: number) {
        this.#bytesLeft = value;
    }

    protected set finalBlockCounter(blockCounter: number) {
        if (this.#finalBlockCounter !== undefined) {
            throw new InternalError("Transfer already finalized. finalizeTransfer() should only be called once.");
        }
        this.#finalBlockCounter = blockCounter;
    }

    protected get finalBlockCounter() {
        if (this.#finalBlockCounter === undefined) {
            throw new InternalError("Transfer not finalized. Call finalizeTransfer() after completing the transfer.");
        }
        return this.#finalBlockCounter;
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
    async processTransfer() {
        await this.initTransfer();

        // Continue to transfer chunks until done or closed
        while (!this.isClosed) {
            if (await this.transferNextChunk()) {
                break;
            }
        }

        if (!this.isClosed) {
            await this.finalizeTransfer();
        }
    }

    protected abstract initTransfer(): Promise<void>;

    protected abstract transferNextChunk(): Promise<boolean>;

    protected abstract finalizeTransfer(): Promise<void>;
}

export namespace Flow {
    export interface TransferOptions {
        transferMode: DriverMode;
        asynchronousTransfer: false; // Not supported currently, so always false
        dataLength?: number;
        startOffset: number;
        blockSize: number;
        isDriver: boolean;
        fileDesignator: PersistedFileDesignator;
    }

    export enum DriverMode {
        SenderDrive = "senderDrive",
        ReceiverDrive = "receiverDrive",
    }
}
