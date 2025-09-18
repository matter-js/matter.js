/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadingFlow } from "./ReadingFlow.js";

/**
 * BDX Transport flow logic for a "BDX Driving Sender":
 * - Send out the Block and wait for Ack (if synchronous transfer is used)
 * - Last message is sent with BlockEof and expects AckEof
 */
export class DrivenSendingFlow extends ReadingFlow {
    protected async transferNextChunk() {
        const { asynchronousTransfer } = this.transferParameters;
        const { iterator } = this.stream;

        const blockCounter = this.nextMessageCounter;
        // Read the next data chunk from the storage
        const { data, done } = await this.readDataChunk(iterator);

        if (done) {
            // Send the last Block and wait for AckEof and close down
            await this.messenger.sendBlockEof({ data: data ?? new Uint8Array(), blockCounter });
            this.finalBlockCounter = blockCounter;
            return true;
        }

        // Send the next Block
        await this.messenger.sendBlock({ data, blockCounter });

        // Sync transfer just continues when the Ack is received
        if (!asynchronousTransfer) {
            const { blockCounter: ackedBlockCounter } = await this.messenger.readBlockAck();
            this.validateCounter(ackedBlockCounter, blockCounter);
        }
        return false;
    }
}
