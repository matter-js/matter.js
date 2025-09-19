/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BytesStreamReader, InternalError } from "#general";
import { BdxStatusCode } from "#types";
import { BdxError } from "../BdxError.js";
import { Flow } from "./Flow.js";

/**
 * Base class for outbound BDX transfer flows where data is read from our node and sent to the peer.
 */
export abstract class OutboundFlow extends Flow {
    #closeStreams?: (error?: unknown) => Promise<void>;
    #iterator?: AsyncGenerator<Uint8Array<ArrayBufferLike>, void, unknown>;
    #streamReader?: BytesStreamReader;

    protected get stream() {
        if (this.#iterator === undefined || this.#streamReader === undefined) {
            throw new InternalError("Read stream not initialized");
        }
        return { iterator: this.#iterator, streamReader: this.#streamReader };
    }

    /**
     * Returns initialized streams for the transfer and initializes the #closeStream class function
     */
    protected async initTransfer() {
        const { blockSize } = this.transferParameters;

        const blob = await this.transferParameters.fileDesignator.openBlob();
        const blobSize = blob.size;

        // Get the full or relevant part of the stream by startOffset and length
        const { startOffset = 0, dataLength = blobSize } = this.transferParameters;

        const dataBlob =
            startOffset > 0 || dataLength !== blobSize ? blob.slice(startOffset, startOffset + dataLength) : blob;

        const stream = dataBlob.stream();

        const reader = stream.getReader();
        // Method to be used by main close() method to make sure all streams are correctly closed or cancelled
        this.#closeStreams = async (_error?: unknown) => {
            if (stream.locked) {
                reader?.releaseLock();
                try {
                    await reader?.cancel();
                } catch (error) {
                    // A TypeError is expected when the stream is already cancelled, so we ignore it
                    if (!(error instanceof TypeError)) {
                        throw error;
                    }
                }
            }
            await stream.cancel();
        };

        const streamReader = new BytesStreamReader(reader);
        this.#iterator = streamReader.read(blockSize);
        this.#streamReader = streamReader;
    }

    /**
     * Reads one data chunk from the reader and does some basic checks.
     */
    protected async readDataChunk(reader: AsyncGenerator<Uint8Array<ArrayBufferLike>, void, unknown>) {
        const { blockSize, dataLength } = this.transferParameters;
        let { value, done = false } = await reader.next();
        if (value === undefined) {
            // Done needs to be true when value is undefined or there is something broken
            if (!done) {
                throw new BdxError(
                    `Data length too short, expected ${blockSize}bytes, but got less`,
                    BdxStatusCode.LengthTooShort,
                );
            }
            value = new Uint8Array(); // Simulate an empty value when we reached the end of the stream
        } else if (value.byteLength < blockSize) {
            // When we get less data than blocksize it is the last block, so validate that
            ({ done = false } = await reader.next());
            if (!done) {
                throw new BdxError(
                    `Data length too short, expected ${blockSize}bytes, but got less`,
                    BdxStatusCode.LengthTooShort,
                );
            }
        }

        if (this.bytesLeft !== undefined && dataLength !== undefined) {
            this.bytesLeft -= value.byteLength;
            if (this.bytesLeft < 0) {
                throw new BdxError(
                    `Data length exceeded, expected ${dataLength}bytes, but got ${-this.bytesLeft}bytes more`,
                    BdxStatusCode.LengthTooLarge,
                );
            }
            if (done && this.bytesLeft > 0) {
                throw new BdxError(
                    `Data length too short, expected ${dataLength}bytes, but got ${this.bytesLeft}bytes less`,
                    BdxStatusCode.LengthTooShort,
                );
            }
            if (this.bytesLeft === 0) {
                done = true;
            }
        }

        return { data: value, done };
    }

    protected async finalizeTransfer() {
        const blockCounter = this.finalBlockCounter;
        const { blockCounter: ackedBlockCounter } = await this.messenger.readBlockAckEof();
        this.validateCounter(ackedBlockCounter, blockCounter);
    }

    override async close(error?: unknown) {
        await super.close(error);
        await this.#closeStreams?.(error);
    }
}
