/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Diagnostic, Logger, serialize, UnexpectedDataError } from "#general";
import { TlvAny, TlvArrayReader, TlvElement, TlvStream, TlvType } from "#types";
import type { Argv } from "yargs";

const logger = Logger.get("tlv");

const TlvTypeNames: { [key: number]: string } = {
    [TlvType.Null]: "Null(",
    [TlvType.Boolean]: "Boolean(",
    [TlvType.UnsignedInt]: "UnsignedInt(",
    [TlvType.SignedInt]: "SignedInt(",
    [TlvType.Float]: "Float(",
    [TlvType.Utf8String]: "Utf8String(",
    [TlvType.ByteString]: "ByteString(",
    [TlvType.Array]: "Array {",
    [TlvType.List]: "List {",
    [TlvType.Structure]: "Structure {",
    [TlvType.EndOfContainer]: "}",
};

function logAnyTlvStream(encoded: TlvStream) {
    if (encoded.length === 0) {
        return undefined;
    }
    const reader = new TlvArrayReader(encoded);
    logGenericElement(reader);
    const nextElement = reader.readTagType();
    if (nextElement !== undefined) {
        throw new UnexpectedDataError(`Unexpected data left after parsing all data: ${Diagnostic.json(nextElement)}`);
    }
}

function logGenericElement(reader: TlvArrayReader, preReadElement?: TlvElement<any>, allowTag = false) {
    const element = preReadElement ?? reader.readTagType();
    const {
        tag,
        typeLength: { type },
    } = element;

    switch (type) {
        case TlvType.Null:
        case TlvType.Boolean:
        case TlvType.UnsignedInt:
        case TlvType.SignedInt:
        case TlvType.Float:
        case TlvType.Utf8String:
        case TlvType.ByteString:
            if (tag !== undefined && !allowTag) {
                throw new UnexpectedDataError(`Tag detected for a native type: ${Diagnostic.json(element)}`);
            }
            const value = reader.readPrimitive(element.typeLength);
            const logValue = Bytes.isBytes(value) ? Bytes.toHex(value) : value;
            const logNumberHex =
                typeof value === "number" || typeof value === "bigint" ? value.toString(16) : undefined;
            logger.info(
                tag?.id !== undefined ? `${tag.id}/0x${tag?.id?.toString(16)} => ` : "",
                TlvTypeNames[type],
                `${logValue}${logNumberHex !== undefined ? `/0x${logNumberHex}` : ""}`,
                ")",
            );
            break;
        case TlvType.Array:
        case TlvType.List:
            if (tag?.id !== undefined) {
                logger.info(`${tag.id}/0x${tag.id.toString(16)} => `, TlvTypeNames[type]);
            } else {
                logger.info(TlvTypeNames[type]);
            }
            Logger.nest(() => logGenericArrayOrList(reader, type === TlvType.List));
            logger.info(TlvTypeNames[TlvType.EndOfContainer]);
            break;
        case TlvType.Structure:
            if (tag?.id !== undefined) {
                logger.info(`${tag.id}/0x${tag.id.toString(16)} => `, TlvTypeNames[type]);
            } else {
                logger.info(TlvTypeNames[type]);
            }
            Logger.nest(() => logGenericStructure(reader));
            logger.info(TlvTypeNames[TlvType.EndOfContainer]);
            break;
        default:
            throw new UnexpectedDataError(`Unknown type: ${type}`);
    }
}

function logGenericArrayOrList(reader: TlvArrayReader, allowTag = false) {
    const result = new Array<any>();
    while (true) {
        const element = reader.readTagType();
        const {
            tag,
            typeLength: { type },
        } = element;
        if (type === TlvType.EndOfContainer) break;
        if (tag !== undefined && !allowTag) {
            throw new UnexpectedDataError(`Tag detected : ${Diagnostic.json(element)}`);
        }
        logGenericElement(reader, element, allowTag);
    }
    return result;
}

function logGenericStructure(reader: TlvArrayReader) {
    const result: { [key: string]: any } = {};
    while (true) {
        const element = reader.readTagType();
        const {
            tag,
            typeLength: { type },
        } = element;
        if (type === TlvType.EndOfContainer) break;
        if (tag === undefined || tag.id === undefined) {
            throw new UnexpectedDataError(`Tag missing for a structure: ${Diagnostic.json(element)}`);
        }
        logGenericElement(reader, element, true);
    }
    return result;
}

export default function commands() {
    return {
        command: "tlv",
        describe: "TLV decoding tools",
        builder: (yargs: Argv) => {
            return yargs
                .command(
                    "decode [value]",
                    "Decodes a TLV string (hex) into matter.js JavaScript object",
                    yargs => {
                        return yargs.positional("value", {
                            describe: "The TLV value as hex string",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { value } = argv;
                        const bytes = Bytes.fromHex(value);
                        const tlvEncoded = TlvAny.decode(bytes);
                        const decoded = TlvAny.decodeAnyTlvStream(tlvEncoded);

                        console.log("Decoded:", serialize(decoded));
                    },
                )
                .command(
                    "log [value]",
                    "Decodes a TLV string (hex string) and logs it's structure",
                    yargs => {
                        return yargs.positional("value", {
                            describe: "The TLV value as hex string",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { value } = argv;
                        const bytes = Bytes.fromHex(value);
                        const tlvEncoded = TlvAny.decode(bytes);
                        logAnyTlvStream(tlvEncoded);
                    },
                );
        },
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
