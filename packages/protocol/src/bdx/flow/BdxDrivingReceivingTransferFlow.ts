/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxWritingTransferFlow } from "./BdxWritingTransferFlow.js";

/**
 * BDX Transport flow logic for a "BDX Driving Receiver":
 * - Requests the next Blow using BlockQuery and then reads the Block
 * - Last message is confirmed with an AckEof
 */
export class BdxDrivingReceivingTransferFlow extends BdxWritingTransferFlow {
    async processTransfer() {
        const { dataLength } = this.transferParameters;
        const { writeController, writePromise } = this.writeStream;
        let bytesLeft = dataLength;

        while (true) {
            let done: boolean;

            if (this.isClosed) {
                return; // Session is closed, so we stop processing
            }

            const blockCounter = this.nextMessageCounter;

            // Query next block (We never Ack block from before because we are usually never sleepy)
            // Think about cases to use BlockQueryWithSkip
            await this.messenger.sendBlockQuery({ blockCounter });

            // Read returned Block
            const { messageType, blockCounter: dataBlockCounter, data } = await this.messenger.readBlock();
            this.validateCounter(dataBlockCounter, blockCounter);

            // Write the received data chunk into the writing stream
            ({ bytesLeft, done } = this.writeDataChunk(writeController, data, messageType, bytesLeft));

            if (done) {
                // Transfer is done, so we wait till writing is final and send the AckEof and close down
                await writePromise;
                await this.messenger.sendBlockAckEof({ blockCounter: dataBlockCounter });
                break;
            }
        }
    }
}
