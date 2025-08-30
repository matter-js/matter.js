/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Logger } from "#general";
import { BdxStatusCode } from "#types";
import { BdxReadingTransferFlow } from "./BdxReadingTransferFlow.js";

const logger = Logger.get("BdxFollowingReceivingTransferFlow");
/**
 * BDX Transport flow logic for a "BDX Following Receiver":
 * - Reads BlockQuery(WithSkip) messages and responds with Block or (for last block) BlockEof.
 *   Data are skipped over when requested by the peer.
 * - After the last block is send it expects an AckEof
 */
export class BdxFollowingReceivingTransferFlow extends BdxReadingTransferFlow {
    async processTransfer() {
        const { blockSize, dataLength } = this.transferParameters;
        const { iterator, streamReader } = this.readStream;
        let bytesLeft = dataLength;

        while (true) {
            let done: boolean;
            let data: Bytes;

            if (this.isClosed) {
                return; // Session is closed, so we stop processing
            }

            // Read the data query from the peer
            const message = await this.messenger.readBlockQuery();
            const bytesToSkip =
                "bytesToSkip" in message
                    ? this.messenger.asNumber(
                          message.bytesToSkip,
                          "BytesToSkip",
                          BdxStatusCode.TransferFailedUnknownError,
                      )
                    : 0;

            const { blockCounter } = message;
            this.validateCounter(blockCounter);

            if (bytesToSkip > 0) {
                const skipped = await streamReader.skip(bytesToSkip);
                logger.debug(`Skipped ${skipped}bytes of data (requested ${bytesToSkip}bytes)`);
            }
            ({ data, done, bytesLeft } = await this.readDataChunk(iterator, blockSize, bytesLeft, dataLength));

            if (done) {
                await this.messenger.sendBlockEof({ data, blockCounter });
                const { blockCounter: ackedBlockCounter } = await this.messenger.readBlockAckEof();
                this.validateCounter(ackedBlockCounter, blockCounter);
                break; // End of transfer
            }

            await this.messenger.sendBlock({ data, blockCounter });
            // Ack or next BlockQuery is read on the next iteration
        }
    }
}
