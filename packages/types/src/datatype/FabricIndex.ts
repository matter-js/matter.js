/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";

/**
 * Each fabric supported on a node is referenced by fabric-index that is unique on the node. This
 * fabric-index enables the look-up of the full fabric information from the fabric-index. A fabric-index
 * of 0 (zero) or null SHALL indicate that there is no fabric associated with the context in which the
 * fabric-index is being used. If fabric-index is used in a context that is exclusively associated with
 * a fabric, such as fabric-scoped data model elements, then the fabric-index values SHALL NOT include 0
 * (zero) or null.
 *
 * @see {@link MatterSpecification.v10.Core} § 7.5.2
 */
export type FabricIndex = Branded<number, "FabricIndex">;

export function FabricIndex(value: number): FabricIndex {
    return value as FabricIndex;
}

export namespace FabricIndex {
    export const NO_FABRIC = 0 as FabricIndex;
    export const OMIT_FABRIC = -1 as FabricIndex;
}

class FabricIndexTlvWrapper extends TlvWrapper<FabricIndex, number | undefined> {
    constructor() {
        super(
            TlvUInt8.bound({ min: 0, max: 254 }),
            fabricIndex => (fabricIndex === FabricIndex.OMIT_FABRIC ? undefined : fabricIndex),
            value => {
                switch (value) {
                    case undefined:
                        return FabricIndex.OMIT_FABRIC;
                    case 0:
                        return FabricIndex.NO_FABRIC;
                    default:
                        return value as FabricIndex;
                }
            },
        );
    }

    override validate(value: FabricIndex): void {
        const wrappedValue = this.wrap(value);
        // Because the FabricIndex is omitted sometimes we do not validate id it is absent
        if (wrappedValue !== undefined) {
            this.underlyingSchema.validate(wrappedValue);
        }
    }
}

/** Tlv Schema for a Fabric Index. */
export const TlvFabricIndex = new FabricIndexTlvWrapper();
