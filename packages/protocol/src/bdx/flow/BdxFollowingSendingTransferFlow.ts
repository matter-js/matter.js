/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxWritingTransferFlow } from "./BdxWritingTransferFlow.js";

/**
 * BDX Transport flow logic for a "BDX Following Sender":
 * - Reads the Block and sends an Ack (if synchronous transfer is used)
 * - Last message is confirmed with an AckEof
 */
export class BdxFollowingSendingTransferFlow extends BdxWritingTransferFlow {
    async processTransfer() {
        const { dataLength, asynchronousTransfer } = this.transferParameters;
        const { writeController, writePromise } = this.writeStream;
        let bytesLeft = dataLength;

        while (true) {
            let done: boolean;

            if (this.isClosed) {
                return; // Session is closed, so we stop processing
            }

            const { messageType, data, blockCounter } = await this.messenger.readBlock();
            this.validateCounter(blockCounter);

            // Write the received data chunk into the writing stream
            ({ bytesLeft, done } = this.writeDataChunk(writeController, data, messageType, bytesLeft));

            // Transfer is done, so we wait till writing is final and send the AckEof and close down
            if (done) {
                await writePromise;
                await this.messenger.sendBlockAckEof({ blockCounter });
                break;
            }

            // Sync transfer just requires Ack to be sent back
            if (!asynchronousTransfer) {
                await this.messenger.sendBlockAck({ blockCounter });
            }
        }
    }
}
