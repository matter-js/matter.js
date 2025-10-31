/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError, MaybePromise } from "#general";
import { BdxMessageType, BdxStatusCode } from "#types";
import { BdxError } from "../BdxError.js";
import { Flow } from "./Flow.js";

/**
 * Base class for inbound BDX transfer flows where data is received from the peer and written to our node.
 */
export abstract class InboundFlow extends Flow {
    #closeStreams?: (error?: unknown) => Promise<void>;
    #writeController?: ReadableStreamDefaultController<Bytes>;
    #writePromise?: MaybePromise<void>;

    /**
     * Returns initialized streams for the transfer and initializes the #closeStream class function
     */
    protected async initTransfer() {
        // Create a ReadableStream that we can write to and start to write the data into the blob
        let writeController!: ReadableStreamDefaultController<Bytes>; // variable is set on creation of the ReadableStream
        const stream = new ReadableStream<Bytes>({
            start: controller => {
                writeController = controller;
            },
        });
        const { fileDesignator } = this.transferParameters;
        const writePromise = fileDesignator.writeFromStream(stream);

        // Method to be used by main close() method to make sure all streams are correctly closed or cancelled
        this.#closeStreams = async (error?: unknown) => {
            if (writeController !== undefined) {
                if (error !== undefined) {
                    // When this is called, we are either done successfully or failed, error the write controller in error case
                    writeController.error(error);
                    try {
                        await writePromise;
                    } catch {
                        // Ignore the error because we generated it
                    }
                }
            }
            // When writing and errored the stream might stay locked, so we cannot cancel it without an exception
            if (!stream.locked) {
                await stream.cancel();
            }
        };

        this.#writeController = writeController;
        this.#writePromise = writePromise;
    }

    protected get stream() {
        if (!this.#writeController || !this.#writePromise) {
            throw new InternalError("Transfer not initialized. Call initTransfer() before starting the transfer.");
        }
        return { writeController: this.#writeController, writePromise: this.#writePromise };
    }

    protected async finalizeTransfer() {
        const { writePromise } = this.stream;
        const blockCounter = this.finalBlockCounter;
        await writePromise;
        await this.messenger.sendBlockAckEof({ blockCounter });
    }

    protected writeDataChunk(
        writeController: ReadableStreamDefaultController<Bytes>,
        data: Bytes,
        messageType: BdxMessageType,
    ) {
        // Enqueue the received data chunk into the writing stream
        writeController.enqueue(data);
        if (this.bytesLeft !== undefined) {
            this.bytesLeft -= data.byteLength;
        }

        let done = false;

        // Last block received
        if (messageType === BdxMessageType.BlockEof) {
            if (this.bytesLeft !== undefined && this.bytesLeft !== 0) {
                throw new BdxError(
                    `Received BlockEof with ${this.bytesLeft}bytes left, but no more data available`,
                    this.bytesLeft > 0 ? BdxStatusCode.LengthTooShort : BdxStatusCode.LengthTooLarge,
                );
            }

            done = true;
            writeController.close();
        }

        return done;
    }

    override async close(error?: unknown) {
        await super.close(error);
        await this.#closeStreams?.(error);
    }
}
