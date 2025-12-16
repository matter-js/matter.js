/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InboundFlow } from "./InboundFlow.js";

/**
 * BDX Transport flow logic for a "BDX Following Sender":
 * - Reads the Block and sends an Ack (if synchronous transfer is used)
 * - Last message is confirmed with an AckEof
 */
export class FollowingSendingFlow extends InboundFlow {
    protected async transferNextChunk() {
        const { asynchronousTransfer } = this.transferParameters;
        const { writeController } = this.stream;

        const {
            kind: messageType,
            message: { data, blockCounter },
        } = await this.messenger.readBlock();
        this.validateCounter(blockCounter);

        this.transferredBytes += data.byteLength;

        // Write the received data chunk into the writing stream
        if (this.writeDataChunk(writeController, data, messageType)) {
            this.finalBlockCounter = blockCounter;
            return true;
        }

        if (!asynchronousTransfer) {
            // Sync transfer just requires Ack to be sent back
            await this.messenger.sendBlockAck({ blockCounter });
        }

        return false;
    }
}
