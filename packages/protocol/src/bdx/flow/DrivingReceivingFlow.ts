/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InboundFlow } from "./InboundFlow.js";

/**
 * BDX Transport flow logic for a "BDX Driving Receiver":
 * - Requests the next Blow using BlockQuery and then reads the Block
 * - Last message is confirmed with an AckEof
 */
export class DrivingReceivingFlow extends InboundFlow {
    async transferNextChunk() {
        const { writeController } = this.stream;

        const blockCounter = this.nextMessageCounter;

        // Query next block (We never Ack block from before because we are usually never sleepy)
        // Think about cases to use BlockQueryWithSkip
        await this.messenger.sendBlockQuery({ blockCounter });

        // Read returned Block
        const {
            kind: messageType,
            message: { blockCounter: dataBlockCounter, data },
        } = await this.messenger.readBlock();
        this.validateCounter(dataBlockCounter, blockCounter);
        this.transferredBytes += data.byteLength;

        // Write the received data chunk into the writing stream
        if (this.writeDataChunk(writeController, data, messageType)) {
            this.finalBlockCounter = dataBlockCounter;
            return true;
        }

        return false;
    }
}
