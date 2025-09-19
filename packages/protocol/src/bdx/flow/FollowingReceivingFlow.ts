/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { BdxMessageType, BdxStatusCode } from "#types";
import { BdxMessenger } from "../BdxMessenger.js";
import { BdxMessage } from "../schema/BdxMessage.js";
import { OutboundFlow } from "./OutboundFlow.js";

const logger = Logger.get("BdxFollowingReceivingFlow");
/**
 * BDX Transport flow logic for a "BDX Following Receiver":
 * - Reads BlockQuery(WithSkip) messages and responds with Block or (for last block) BlockEof.
 *   Data are skipped over when requested by the peer.
 * - After the last block is send it expects an AckEof
 */
export class FollowingReceivingFlow extends OutboundFlow {
    protected async transferNextChunk() {
        const { iterator, streamReader } = this.stream;

        // Read the data query from the peer
        const blockQuery = await this.messenger.readBlockQuery();
        const bytesToSkip = BdxMessage.is(blockQuery, BdxMessageType.BlockQueryWithSkip)
            ? BdxMessenger.asSafeNumber(
                  blockQuery.message.bytesToSkip,
                  "BytesToSkip",
                  BdxStatusCode.TransferFailedUnknownError,
              )
            : 0;

        const { blockCounter } = blockQuery.message;
        this.validateCounter(blockCounter);

        if (bytesToSkip > 0) {
            const skipped = await streamReader.skip(bytesToSkip);
            logger.debug(`Skipped ${skipped}bytes of data (requested ${bytesToSkip}bytes)`);
        }
        const { data, done } = await this.readDataChunk(iterator);

        if (done) {
            await this.messenger.sendBlockEof({ data, blockCounter });
            this.finalBlockCounter = blockCounter;
            return true;
        }

        await this.messenger.sendBlock({ data, blockCounter });
        // Ack or next BlockQuery is read on the next iteration
        return false;
    }
}
