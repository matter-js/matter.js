/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, DataWriter, Endian } from "#general";
import { BdxStatusCode, BitField, BitFlag, BitmapSchema, Schema, TypeFromPartialBitSchema } from "#types";
import { BdxError } from "../BdxError.js";

export const BDX_VERSION = 0;

/**
 * BDX Transfer protocol bitmap definition
 * Bit 7 is reserved for future use
 *
 * @see {@link MatterSpecification.v141.Core}, section 11.22.5.1
 */
export const BdxTransferControlBitmap = {
    /** Protocol Version, Only allowed version is 0.0 for now */
    version: BitField(0, 4),

    /** Indicates if Sender drive is supported by Initiator */
    senderDrive: BitFlag(4),

    /** Indicates if Receiver drive is supported by Initiator */
    receiverDrive: BitFlag(5),

    /**
     * Indicates if Asynchronous Transfer is supported by Initiator
     * Synchronous mode is always implicitly supported.
     */
    asynchronousTransfer: BitFlag(6),
};
export const BdxTransferControlSchema = BitmapSchema(BdxTransferControlBitmap);

/**
 * BDX Range control bitmap definition
 * Bits 2-3 and 5-7 is reserved for future use
 *
 * @see {@link MatterSpecification.v141.Core}, section 11.22.5.1
 */
export const BdxRangeControlBitmap = {
    /** Indicates if the transfer has a definite length */
    definiteLength: BitFlag(0),

    /** Indicates if the transfer has a start offset */
    startOffset: BitFlag(1),

    /**
     * Indicates if wide (64-bit) range enabled for values
     * Offset (STARTFOFS) and length (DEFLEN) are 4 octets (32-bit) little-endian unsigned quantities.
     */
    wideRange: BitFlag(4),
};
export const BdxRangeControlSchema = BitmapSchema(BdxRangeControlBitmap);

/** @see {@link MatterSpecification.v141.Core}, section 11.22.5.1 */
export type BdxInit = {
    /**
     * Transfer protocol details
     * PTC
     * 1 octet
     */
    transferProtocol: TypeFromPartialBitSchema<typeof BdxTransferControlBitmap>;

    /**
     * Range Control details - Removed because it is used by encoding/decoding implicitly
     * RTC, 1 octet
     */
    //rangeControl: TypeFromPartialBitSchema<typeof BdxRangeControlBitmap>;

    /**
     * Specifies the maximum data size (in bytes) of the block that the Initiator supports, exclusive of block header
     * fields, such as a block counter.
     * PMBS, 2 octets
     */
    maxBlockSize: number;

    /**
     * Optional 32-bit/64-bit length that specifies the offset in bytes from start of the file from which the Sender
     * would start the transfer.
     * STARTOFS, 4/8 octets
     */
    startOffset?: number | bigint;

    /**
     * Specifies a predetermined definite length for the transfer
     * DEFLEN, 4/8 octets
     */
    maxLength?: number | bigint;

    /**
     * Identifier chosen by the Initiator to identify the payload to be transferred.
     * FD, 2 octets + Variable length
     */
    fileDesignator: Bytes;

    /**
     * Allows the Initiator to send additional application-specific information about the file to be transferred
     * MD, Variable length, TLV
     */
    metaData?: Bytes;
};

/** Schema for BDX SendInit and ReceiveInit messages. */
export class BdxInitMessageSchema extends Schema<BdxInit> {
    encodeInternal(message: BdxInit) {
        this.validate(message);
        const { transferProtocol, maxBlockSize, startOffset, maxLength, fileDesignator, metaData } = message;

        const rangeControl = {
            startOffset: startOffset !== undefined,
            definiteLength: maxLength !== undefined && maxLength !== 0,
            wideRange: typeof startOffset === "bigint" || typeof maxLength === "bigint",
        };

        const writer = new DataWriter(Endian.Little);
        writer.writeUInt8(BdxTransferControlSchema.encode(transferProtocol));
        writer.writeUInt8(BdxRangeControlSchema.encode(rangeControl));
        writer.writeUInt16(maxBlockSize);

        if (startOffset !== undefined) {
            if (rangeControl.wideRange) {
                writer.writeUInt64(startOffset);
            } else {
                writer.writeUInt32(startOffset);
            }
        }
        if (maxLength !== undefined && maxLength !== 0) {
            if (rangeControl.wideRange) {
                writer.writeUInt64(maxLength);
            } else {
                writer.writeUInt32(maxLength);
            }
        }

        writer.writeUInt16(fileDesignator.byteLength);
        writer.writeByteArray(fileDesignator);

        if (metaData && metaData.byteLength > 0) {
            writer.writeByteArray(metaData);
        }

        return writer.toByteArray();
    }

    decodeInternal(bytes: Bytes): BdxInit {
        const reader = new DataReader(bytes, Endian.Little);
        const transferProtocol = BdxTransferControlSchema.decode(reader.readUInt8());
        const rangeControl = BdxRangeControlSchema.decode(reader.readUInt8());
        const maxBlockSize = reader.readUInt16();

        const startOffset = rangeControl.startOffset
            ? rangeControl.wideRange
                ? reader.readUInt64()
                : reader.readUInt32()
            : undefined;
        let maxLength = rangeControl.definiteLength
            ? rangeControl.wideRange
                ? reader.readUInt64()
                : reader.readUInt32()
            : undefined;
        if (maxLength === 0) {
            maxLength = undefined; // 0 also means indefinite length
        }

        const fileDesignatorLength = reader.readUInt16();
        const fileDesignator = reader.readByteArray(fileDesignatorLength);

        const metaData = reader.remainingBytesCount > 0 ? reader.remainingBytes : undefined;

        const result = {
            transferProtocol,
            maxBlockSize,
            startOffset,
            maxLength,
            fileDesignator,
            metaData,
        };
        this.validate(result);
        return result;
    }

    override validate({ transferProtocol, maxBlockSize, fileDesignator }: BdxInit) {
        if (transferProtocol.version !== BDX_VERSION) {
            throw new BdxError(
                `Unsupported BDX version: ${transferProtocol.version}`,
                BdxStatusCode.VersionNotSupported,
            );
        }
        if (!transferProtocol.senderDrive && !transferProtocol.receiverDrive) {
            throw new BdxError(
                "BDX transfer protocol needs to allow either sender or receiver drive",
                BdxStatusCode.BadMessageContent,
            );
        }
        if (fileDesignator.byteLength === 0) {
            throw new BdxError("File Designator cannot be empty", BdxStatusCode.BadMessageContent);
        }
        if (fileDesignator.byteLength > 0xffff) {
            throw new BdxError(
                "File Designator length exceeds maximum allowed size of 65535bytes",
                BdxStatusCode.BadMessageContent,
            );
        }
        if (maxBlockSize < 1 || maxBlockSize > 0xffff) {
            throw new BdxError("Max Block Size must be between 1 and 65535bytes", BdxStatusCode.BadMessageContent);
        }
    }
}
export const BdxSendInitMessage = new BdxInitMessageSchema();
export const BdxReceiveInitMessage = BdxSendInitMessage;
