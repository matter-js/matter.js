/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { BdxReadingTransferFlow } from "./BdxReadingTransferFlow.js";

/**
 * BDX Transport flow logic for a "BDX Driving Sender":
 * - Send out the Block and wait for Ack (if synchronous transfer is used)
 * - Last message is sent with BlockEof and expects AckEof
 */
export class BdxDrivenSendingTransferFlow extends BdxReadingTransferFlow {
    async processTransfer() {
        const { blockSize, dataLength, asynchronousTransfer } = this.transferParameters;
        const { iterator } = this.readStream;
        let bytesLeft = dataLength;

        while (true) {
            let data: Bytes;
            let done: boolean;

            if (this.isClosed) {
                return; // Session is closed, so we stop processing
            }

            const blockCounter = this.nextMessageCounter;
            // Read the next data chunk from the storage
            ({ data, done, bytesLeft } = await this.readDataChunk(iterator, blockSize, bytesLeft, dataLength));

            if (done) {
                // Send the last Block and wait for AckEof and close down
                await this.messenger.sendBlockEof({ data: data ?? new Uint8Array(), blockCounter });
                const { blockCounter: ackedBlockCounter } = await this.messenger.readBlockAckEof();
                this.validateCounter(ackedBlockCounter, blockCounter);
                break; // End of transfer
            }

            // Send the next Block
            await this.messenger.sendBlock({ data, blockCounter });

            // Sync transfer just continues when the Ack is received
            if (!asynchronousTransfer) {
                const { blockCounter: ackedBlockCounter } = await this.messenger.readBlockAck();
                this.validateCounter(ackedBlockCounter, blockCounter);
            }
        }
    }
}
