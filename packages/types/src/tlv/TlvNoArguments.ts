/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "#general";
import { TlvTag } from "./TlvCodec.js";
import { TlvObject } from "./TlvObject.js";
import { TlvWriter } from "./TlvSchema.js";
import { VoidSchema } from "./TlvVoid.js";

const TlvEmptyObject = TlvObject({});

/**
 * Schema to encode void.
 */
export class NoArgumentsSchema extends VoidSchema {
    override encodeTlvInternal(writer: TlvWriter, value: void, tag?: TlvTag): void {
        if (value !== undefined) throw new UnexpectedDataError("No value should be passed");
        TlvEmptyObject.encodeTlvInternal(writer, {}, tag);
    }
}

/** Void TLV schema. */
export const TlvNoArguments = new NoArgumentsSchema();
