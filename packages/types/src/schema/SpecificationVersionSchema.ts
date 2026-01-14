/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, toHex } from "#general";
import { BitField, ByteArrayBitmapSchema } from "./BitmapSchema.js";

export type SpecificationVersion = {
    major: number;
    minor: number;
    patch: number;
};

const SpecificationVersionSchema = ByteArrayBitmapSchema({
    major: BitField(0, 8),
    minor: BitField(8, 8),
    patch: BitField(16, 8),
    reserved: BitField(24, 8),
});

export namespace SpecificationVersion {
    export const encode = (version: SpecificationVersion) =>
        parseInt(Bytes.toHex(SpecificationVersionSchema.encode({ ...version, reserved: 0 })), 16);
    export const decode = (version: number) => SpecificationVersionSchema.decode(Bytes.fromHex(toHex(version)));
}
