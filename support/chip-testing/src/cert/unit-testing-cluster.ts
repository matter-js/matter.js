/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "@matter/main";
import {
    attribute,
    bool,
    cluster,
    double,
    enum8,
    field,
    listOf,
    octstr,
    single,
    string,
    uint8,
    writable,
} from "@matter/main/model";

/** CHIP's `SimpleStruct`, without the optional field 8. */
export class SimpleStruct {
    @field(0, uint8)
    a!: number;

    @field(1, bool)
    b!: boolean;

    @field(2, enum8)
    c!: number;

    @field(3, octstr)
    d!: Bytes;

    @field(4, string)
    e!: string;

    /** CHIP's `SimpleBitmap`, as the unsigned integer it is on the wire; matter.js encodes a map8 without declared bits as 0. */
    @field(5, uint8)
    f!: number;

    @field(6, single)
    g!: number;

    @field(7, double)
    h!: number;
}

/**
 * The attributes of CHIP's `UnitTesting` cluster the data-type steps of TC-IDM-3.1 and TC-IDM-4.1 write. The cluster
 * is CHIP's own test cluster and in no Matter specification, so it is declared here rather than in the shipped model.
 *
 * @see {@link https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/test-cluster.xml}
 */
@cluster(0xfff1fc05, "UnitTesting")
export class UnitTestingCluster {
    @attribute(0x17, single, writable)
    floatSingle!: number;

    /** At most 10 bytes. */
    @attribute(0x19, octstr, writable)
    octetString!: Bytes;

    /** The TH accepts only an empty `e` and at most 6 bytes in `d`. */
    @attribute(0x25, SimpleStruct, writable)
    structAttr!: SimpleStruct;

    /** Every entry must be the 512-byte `0123456789abcdef…` buffer the TH holds. */
    @attribute(0x2a, listOf(octstr), writable)
    listLongOctetString!: Bytes[];
}
