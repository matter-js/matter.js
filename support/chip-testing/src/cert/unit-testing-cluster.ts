/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ClusterBehavior } from "@matter/main";
import {
    attribute,
    bool,
    cluster,
    double,
    field,
    listOf,
    octstr,
    single,
    string,
    uint8,
    writable,
} from "@matter/main/model";
import { DatatypeModel, FieldModel } from "@matter/model";

/** CHIP's `SimpleEnum`, whose values a matter.js server validates a write against. */
const SimpleEnum = new DatatypeModel({
    name: "SimpleEnum",
    type: "enum8",
    children: [
        new FieldModel({ name: "Unspecified", id: 0 }),
        new FieldModel({ name: "ValueA", id: 1 }),
        new FieldModel({ name: "ValueB", id: 2 }),
        new FieldModel({ name: "ValueC", id: 3 }),
    ],
});

/** CHIP's `SimpleStruct`, without the optional field 8. */
export class SimpleStruct {
    @field(0, uint8)
    a!: number;

    @field(1, bool)
    b!: boolean;

    @field(2, SimpleEnum)
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

/** The endpoint both all-clusters apps serve {@link UnitTestingServer} on (`all-clusters-app.matter` for chip). */
export const UNIT_TESTING_ENDPOINT = 1;

/**
 * The one value each entry of `list_long_octet_string` may hold on a chip TH, which rejects any other entry
 * (`WriteListLongOctetStringAttribute` in CHIP's `test-cluster-server.cpp`).
 */
export const LONG_OCTET_STRING_ENTRY = Bytes.fromString("0123456789abcdef".repeat(32));

/**
 * The attributes of CHIP's `UnitTesting` cluster the data-type steps of TC-IDM-3.1 and TC-IDM-4.1 write. The cluster
 * is CHIP's own test cluster and in no Matter specification, so it is declared here rather than in the shipped model.
 *
 * One declaration serves both sides: the controller adapters register it as a custom cert cluster to encode its
 * attributes by id, and the matter.js all-clusters test app serves it, so a matter.js TH also has a
 * manufacturer-specific cluster. The matter.js server stores what a write carries; it does not copy the chip TH's
 * write restrictions noted on the attributes, which the steps stay within.
 *
 * @see {@link https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/test-cluster.xml}
 */
@cluster(0xfff1fc05, "UnitTesting")
export class UnitTestingServer extends ClusterBehavior {
    static override readonly id = "unitTesting";

    declare state: UnitTestingServer.State;
}

export namespace UnitTestingServer {
    export class State {
        @attribute(0x17, single, writable)
        floatSingle = 0;

        /** A chip TH accepts at most 10 bytes. */
        @attribute(0x19, octstr, writable)
        octetString: Bytes = Bytes.empty;

        /** A chip TH accepts only an empty `e` and at most 6 bytes in `d`. */
        @attribute(0x25, SimpleStruct, writable)
        structAttr: SimpleStruct = { a: 0, b: false, c: 0, d: Bytes.empty, e: "", f: 0, g: 0, h: 0 };

        /** Starts with 4 entries, as on a chip TH, so a write of fewer shows in the read-back. */
        @attribute(0x2a, listOf(octstr), writable)
        listLongOctetString: Bytes[] = Array.from({ length: 4 }, () => LONG_OCTET_STRING_ENTRY);
    }
}
