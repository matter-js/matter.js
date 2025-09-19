/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, DataWriter, Endian } from "#general";
import { Schema } from "#types";

interface BdxCounterOnly {
    blockCounter: number;
}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.6.2 */
export interface BdxBlockQuery extends BdxCounterOnly {}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.6.6 */
export interface BdxBlockAck extends BdxCounterOnly {}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.6.7 */
export interface BdxBlockAckEof extends BdxCounterOnly {}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.6.3 */
export interface BdxBlockQueryWithSkip extends BdxCounterOnly {
    bytesToSkip: number | bigint;
}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.6.4 */
export interface BdxBlock extends BdxCounterOnly {
    data: Bytes;
}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.6.5 */
export interface BdxBlockEof extends BdxBlock {}

/** Schema for BDX messages that only contain a block counter: BlockQuery, BlockAck, BlockAckEof. */
export class BdxCounterOnlyMessageSchema extends Schema<BdxCounterOnly> {
    encodeInternal(message: BdxCounterOnly) {
        const { blockCounter } = message;

        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(blockCounter);
        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes): BdxCounterOnly {
        const reader = new DataReader(bytes, Endian.Little);
        return {
            blockCounter: reader.readUInt32(),
        };
    }
}
const BdxCounterOnlyMessage = new BdxCounterOnlyMessageSchema();
export const BdxBlockQueryMessage = BdxCounterOnlyMessage;
export const BdxBlockAckMessage = BdxCounterOnlyMessage;
export const BdxBlockAckEofMessage = BdxCounterOnlyMessage;

/** Schema for BDX BlockQueryWithSkip message. */
export class BdxBlockQueryWithSkipMessageSchema extends Schema<BdxBlockQueryWithSkip> {
    encodeInternal(message: BdxBlockQueryWithSkip) {
        const { blockCounter, bytesToSkip } = message;

        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(blockCounter);
        writer.writeUInt64(bytesToSkip);
        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes): BdxBlockQueryWithSkip {
        const reader = new DataReader(bytes, Endian.Little);
        return {
            blockCounter: reader.readUInt32(),
            bytesToSkip: reader.readUInt64(),
        };
    }
}
export const BdxBlockQueryWithSkipMessage = new BdxBlockQueryWithSkipMessageSchema();

/** Schema for BDX Block and BlockEof message that contain Block data. */
export class BdxBlockMessageSchema extends Schema<BdxBlock> {
    encodeInternal(message: BdxBlock) {
        const { blockCounter, data } = message;

        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(blockCounter);
        writer.writeByteArray(data);
        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes): BdxBlock {
        const reader = new DataReader(bytes, Endian.Little);
        return {
            blockCounter: reader.readUInt32(),
            data: reader.remainingBytes,
        };
    }
}
export const BdxBlockMessage = new BdxBlockMessageSchema();
export const BdxBlockEofMessage = BdxBlockMessage;
