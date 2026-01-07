/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "#general";
import { ValidationDatatypeMismatchError } from "../common/ValidationError.js";
import { TlvTag, TlvType, TlvTypeLength } from "./TlvCodec.js";
import { TlvReader, TlvSchema, TlvWriter } from "./TlvSchema.js";

/**
 * Schema to encode a boolean in TLV.
 *
 * @see {@link MatterSpecification.v10.Core} § A.11.3
 */
export class BooleanSchema extends TlvSchema<boolean> {
    override encodeTlvInternal(writer: TlvWriter, value: boolean, tag?: TlvTag): void {
        writer.writeTag({ type: TlvType.Boolean, value }, tag);
    }

    override decodeTlvInternalValue(_reader: TlvReader, typeLength: TlvTypeLength) {
        if (typeLength.type !== TlvType.Boolean) throw new UnexpectedDataError(`Unexpected type ${typeLength.type}.`);
        return typeLength.value;
    }

    override validate(value: boolean): void {
        if (typeof value !== "boolean")
            throw new ValidationDatatypeMismatchError(`Expected boolean, got ${typeof value}.`);
    }
}

/** Boolean TLV schema. */
export const TlvBoolean = new BooleanSchema();
