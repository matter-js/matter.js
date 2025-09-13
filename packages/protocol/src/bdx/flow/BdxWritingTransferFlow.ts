/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StorageContext } from "#general";
import { BdxMessageTypes, BdxStatusCode } from "#types";
import { BdxError } from "../BdxError.js";
import { BdxMessenger } from "../BdxMessenger.js";
import { BdxTransferFlow } from "./BdxTransferFlow.js";

/** Base class for BDX transfer flows that write data to a Blob. */
export abstract class BdxWritingTransferFlow extends BdxTransferFlow {
    #storage: StorageContext;
    #blobName: string;
    #closeStreams?: (error?: unknown) => Promise<void>;

    constructor(
        storage: StorageContext,
        blobName: string,
        messenger: BdxMessenger,
        transferParameters: BdxTransferFlow.TransferOptions,
    ) {
        super(messenger, transferParameters);
        this.#storage = storage;
        this.#blobName = blobName;
    }

    /**
     * Returns initialized streams for the transfer and initializes the #closeStream class function
     */
    protected get writeStream() {
        // Create a ReadableStream that we can write to and start to write the data into the blob
        let writeController!: ReadableStreamDefaultController<Bytes>; // variable is set on creation of the ReadableStream
        const stream = new ReadableStream<Bytes>({
            start: controller => {
                writeController = controller;
            },
        });
        const writePromise = this.#storage.writeBlobFromStream(this.#blobName, stream);

        // Method to be used by main close() method to make sure all streams are correctly closed or cancelled
        this.#closeStreams = async (error?: unknown) => {
            if (writeController !== undefined) {
                if (error != undefined) {
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

        return { writeController, writePromise };
    }

    protected writeDataChunk(
        writeController: ReadableStreamDefaultController<Bytes>,
        data: Bytes,
        messageType: BdxMessageTypes,
        bytesLeft: number | undefined,
    ) {
        // Enqueue the received data chunk into the writing stream
        writeController.enqueue(data);
        if (bytesLeft !== undefined) {
            bytesLeft -= data.byteLength;
        }

        let done = false;

        // Last block received
        if (messageType === BdxMessageTypes.BlockEof) {
            if (bytesLeft !== undefined && bytesLeft !== 0) {
                throw new BdxError(
                    `Received BlockEof with ${bytesLeft}bytes left, but no more data available`,
                    bytesLeft > 0 ? BdxStatusCode.LengthTooShort : BdxStatusCode.LengthTooLarge,
                );
            }

            done = true;
            writeController.close();
        }

        return { done, bytesLeft };
    }

    override async close(error?: unknown) {
        await super.close(error);
        await this.#closeStreams?.(error);
    }
}
