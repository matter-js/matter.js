/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, DataReader, DataWriter, Endian } from "#general";
import { Schema } from "../schema/Schema.js";
import { TlvCodec, TlvTag, TlvToPrimitive, TlvTypeLength } from "./TlvCodec.js";

export type TlvEncodingOptions = {
    /**
     * When true, the fabricIndex field will be excluded from the TLV encoding for list entries.
     * This flag must not be set together with the following flag.
     */
    forWriteInteraction?: boolean;

    /**
     * When true, mandatory field validation is skipped when encoding TLV for list entries.
     * This flag must not be set together with the former flag.
     */
    allowMissingFieldsForNonFabricFilteredRead?: boolean;
};

export abstract class TlvSchema<T> extends Schema<T> implements TlvSchema<T> {
    override decodeInternal(encoded: Bytes): T {
        return this.decodeTlvInternal(new TlvByteArrayReader(encoded)).value;
    }

    override encodeInternal(value: T): Bytes {
        const writer = new TlvByteArrayWriter();
        this.encodeTlvInternal(writer, value);
        return writer.toByteArray();
    }

    encodeTlv(value: T, options?: TlvEncodingOptions): TlvStream {
        const writer = new TlvArrayWriter();
        this.encodeTlvInternal(writer, value, undefined, options);
        return writer.toTlvArray();
    }

    decodeTlv(encoded: TlvStream): T {
        return this.decodeTlvInternal(new TlvArrayReader(encoded)).value;
    }

    decodeTlvInternal(reader: TlvReader): { value: T; tag?: TlvTag } {
        const { tag, typeLength } = reader.readTagType();
        return { tag, value: this.decodeTlvInternalValue(reader, typeLength) };
    }

    abstract decodeTlvInternalValue(reader: TlvReader, typeLength: TlvTypeLength): T;

    abstract encodeTlvInternal(writer: TlvWriter, value: T, tag?: TlvTag, options?: TlvEncodingOptions): void;

    injectField(value: T, _fieldId: number, _fieldValue: any, _injectChecker: (fieldValue: any) => boolean): T {
        return value;
    }

    removeField(value: T, _fieldId: number, _removeChecker: (fieldValue: any) => boolean): T {
        return value;
    }
}

export type TlvStream = TlvElement<any>[];

export type TlvElement<T extends TlvTypeLength> = {
    tag?: TlvTag;
    typeLength: T;
    value?: TlvToPrimitive[T["type"]];
};

export class TlvArrayWriter implements TlvWriter {
    private readonly tlvArray = new Array<TlvElement<any>>();

    writeTag(typeLength: TlvTypeLength, tag?: TlvTag) {
        this.tlvArray.push({ tag, typeLength });
    }

    writePrimitive<T extends TlvTypeLength>(_typeLength: T, value: TlvToPrimitive[T["type"]]) {
        this.tlvArray[this.tlvArray.length - 1].value = value;
    }

    toTlvArray() {
        return this.tlvArray;
    }
}

export class TlvArrayReader implements TlvReader {
    private index = -1;

    constructor(private readonly tlvElements: TlvElement<any>[]) {}

    readTagType() {
        this.index++;
        return this.tlvElements[this.index];
    }

    readPrimitive<T extends TlvTypeLength, V = TlvToPrimitive[T["type"]]>(_typeLength: T): V {
        return this.tlvElements[this.index].value;
    }
}

/** Type defined by the TLV schema. */
export type TypeFromSchema<S extends TlvSchema<any>> = S extends TlvSchema<infer T> ? T : never;

export interface TlvReader {
    readTagType(): { tag?: TlvTag; typeLength: TlvTypeLength };

    readPrimitive<T extends TlvTypeLength, V = TlvToPrimitive[T["type"]]>(typeLength: T): V;
}

export interface TlvWriter {
    writeTag(typeLength: TlvTypeLength, tag?: TlvTag): void;

    writePrimitive<T extends TlvTypeLength>(typeLength: T, value: TlvToPrimitive[T["type"]]): void;
}

export class TlvByteArrayWriter implements TlvWriter {
    private readonly writer = new DataWriter(Endian.Little);

    writeTag(typeLength: TlvTypeLength, tag?: TlvTag) {
        TlvCodec.writeTag(this.writer, typeLength, tag);
    }

    writePrimitive<T extends TlvTypeLength>(typeLength: T, value: TlvToPrimitive[T["type"]]) {
        TlvCodec.writePrimitive(this.writer, typeLength, value);
    }

    toByteArray() {
        return this.writer.toByteArray();
    }
}

export class TlvByteArrayReader implements TlvReader {
    private readonly reader: DataReader<Endian.Little>;

    constructor(byteArray: Bytes) {
        this.reader = new DataReader(byteArray, Endian.Little);
    }

    readTagType() {
        return TlvCodec.readTagType(this.reader);
    }

    readPrimitive<T extends TlvTypeLength, V = TlvToPrimitive[T["type"]]>(typeLength: T): V {
        return TlvCodec.readPrimitive(this.reader, typeLength);
    }
}
