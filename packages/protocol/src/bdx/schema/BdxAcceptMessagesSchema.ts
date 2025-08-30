/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, DataWriter, Endian } from "#general";
import { BdxStatusCode, Schema, TypeFromPartialBitSchema } from "#types";
import { BdxError } from "../BdxError.js";
import {
    BDX_VERSION,
    BdxRangeControlSchema,
    BdxTransferControlBitmap,
    BdxTransferControlSchema,
} from "./BdxInitMessagesSchema.js";

/** @see {@link MatterSpecification.v141.Core}, section 11.22.5.2 */
export interface BdxSendAccept {
    /**
     * Transfer control details
     * TC
     * 1 octet
     */
    transferControl: TypeFromPartialBitSchema<typeof BdxTransferControlBitmap>;

    /**
     * Specifies the maximum data size (in bytes) of the block that the Initiator supports, exclusive of block header
     * fields, such as a block counter.
     * MBS, 2 octets
     */
    maxBlockSize: number;

    /**
     * Allows the Initiator to send additional application-specific information about the file to be transferred
     * MD, Variable length, TLV
     */
    metaData?: Bytes;
}

/** @see {@link MatterSpecification.v141.Core}, section 11.22.5.3 */
export interface BdxReceiveAccept extends BdxSendAccept {
    /**
     * Specifies a predetermined definite length for the transfer
     * DEFLEN, 4/8 octets
     */
    length?: number | bigint;
}

/** Schema for BDX SendAccept message */
export class BdxSendAcceptMessageSchema<M extends BdxSendAccept> extends Schema<M, Bytes> {
    encodeInternal(message: M) {
        this.validate(message);
        const { transferControl, maxBlockSize, metaData } = message;

        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(BdxTransferControlSchema.encode(transferControl));
        writer.writeUInt16(maxBlockSize);

        if (metaData && metaData.byteLength > 0) {
            writer.writeByteArray(metaData);
        }

        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes): M {
        const reader = new DataReader(bytes, Endian.Little);
        const transferControl = BdxTransferControlSchema.decode(reader.readUInt8());
        const maxBlockSize = reader.readUInt16();

        const metaData = reader.remainingBytesCount > 0 ? reader.remainingBytes : undefined;

        const result = {
            transferControl,
            maxBlockSize,
            metaData,
        } as M;
        this.validate(result);
        return result;
    }

    override validate({ transferControl, maxBlockSize }: M) {
        if (transferControl.version !== BDX_VERSION) {
            throw new BdxError(
                `Unsupported BDX version: ${transferControl.version}`,
                BdxStatusCode.VersionNotSupported,
            );
        }
        if (!transferControl.senderDrive && !transferControl.receiverDrive && !transferControl.asynchronousTransfer) {
            throw new BdxError(
                "BDX transfer control need to specify at least one of sender drive, receiver drive or asynchronousTransfer",
                BdxStatusCode.BadMessageContent,
            );
        }
        if (maxBlockSize < 1 || maxBlockSize > 0xffff) {
            throw new BdxError("Max Block Size must be between 1 and 65535bytes", BdxStatusCode.BadMessageContent);
        }
    }
}
export const BdxSendAcceptMessage = new BdxSendAcceptMessageSchema();

/** Schema for Bdx ReceiveAccept message */
export class BdxReceiveAcceptMessageSchema extends BdxSendAcceptMessageSchema<BdxReceiveAccept> {
    override encodeInternal(message: BdxReceiveAccept) {
        this.validate(message);
        const { transferControl, maxBlockSize, metaData, length } = message;

        const rangeControl = {
            definiteLength: length !== undefined && length !== 0,
            wideRange: typeof length === "bigint",
        };

        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(BdxTransferControlSchema.encode(transferControl));
        writer.writeUInt8(BdxRangeControlSchema.encode(rangeControl));
        writer.writeUInt16(maxBlockSize);

        if (length !== undefined && length !== 0) {
            if (rangeControl.wideRange) {
                writer.writeUInt64(length);
            } else {
                writer.writeUInt32(length);
            }
        }

        if (metaData && metaData.byteLength > 0) {
            writer.writeByteArray(metaData);
        }

        return writer.toByteArray();
    }

    override decodeInternal(bytes: Bytes): BdxReceiveAccept {
        const reader = new DataReader(bytes, Endian.Little);
        const transferControl = BdxTransferControlSchema.decode(reader.readUInt8());
        const rangeControl = BdxRangeControlSchema.decode(reader.readUInt8());
        const maxBlockSize = reader.readUInt16();

        let length = rangeControl.definiteLength
            ? rangeControl.wideRange
                ? reader.readUInt64()
                : reader.readUInt32()
            : undefined;
        if (length === 0) {
            length = undefined; // 0 also means indefinite length
        }
        const metaData = reader.remainingBytesCount > 0 ? reader.remainingBytes : undefined;

        const result = {
            transferControl,
            maxBlockSize,
            metaData,
            length,
        };
        this.validate(result);
        return result;
    }
}
export const BdxReceiveAcceptMessage = new BdxReceiveAcceptMessageSchema();
