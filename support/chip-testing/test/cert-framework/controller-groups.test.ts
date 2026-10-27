/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError } from "@matter/general";
import type { CertControllerGroup } from "@matter/testing";
import { expect } from "chai";
import {
    assertDeclaredKeySet,
    declaredGroup,
    KeyedGroups,
    validateControllerGroups,
} from "../../src/cert/controller-groups.js";

const KEY_SET = {
    groupKeySetId: 1,
    groupKeySecurityPolicy: 0,
    epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
    epochStartTime0: 1_600_000_000_000_000n,
};

const GROUPS: CertControllerGroup[] = [{ groupId: 1, keySet: KEY_SET, addressPolicy: "ianaAddr" }];

describe("controller group declarations", () => {
    it("answers the declaration of a declared group", () => {
        expect(declaredGroup("dut", GROUPS, 1)).equals(GROUPS[0]);
        expect(
            assertDeclaredKeySet("dut", GROUPS, 1, {
                ...KEY_SET,
                epochKey0: Bytes.fromHex(Bytes.toHex(KEY_SET.epochKey0)),
            }),
        ).equals(GROUPS[0]);
    });

    it("refuses a group the case did not declare", () => {
        expect(() => declaredGroup("dut", GROUPS, 2))
            .throw(ImplementationError)
            .property("message")
            .contains('"dut" was not built for group 2');
        expect(() => declaredGroup("dut", undefined, 1)).throw(ImplementationError);
        expect(() => assertDeclaredKeySet("dut", undefined, 1, KEY_SET)).throw(ImplementationError);
    });

    it("refuses a key set that differs from the declared one in any field", () => {
        const differing: [string, typeof KEY_SET][] = [
            ["groupKeySetId", { ...KEY_SET, groupKeySetId: 2 }],
            ["groupKeySecurityPolicy", { ...KEY_SET, groupKeySecurityPolicy: 1 }],
            ["epochKey0", { ...KEY_SET, epochKey0: new Uint8Array(16) }],
            ["epochStartTime0", { ...KEY_SET, epochStartTime0: KEY_SET.epochStartTime0 + 1n }],
        ];
        for (const [field, keySet] of differing) {
            expect(() => assertDeclaredKeySet("dut", GROUPS, 1, keySet), field)
                .throw(ImplementationError)
                .property("message")
                .contains(field);
        }
    });

    it("accepts a valid declaration, two groups sharing a key set, and none at all", () => {
        validateControllerGroups("dut", undefined);
        validateControllerGroups("dut", [
            { groupId: 1, keySet: KEY_SET },
            { groupId: 0xfeff, keySet: { ...KEY_SET, epochKey0: Bytes.fromHex(Bytes.toHex(KEY_SET.epochKey0)) } },
        ]);
    });

    it("refuses a declaration a controller would refuse or read differently", () => {
        const refused: [string, CertControllerGroup[]][] = [
            ["group 0, which is not an application group id", [{ groupId: 0, keySet: KEY_SET }]],
            ["group 65280, which is not an application group id", [{ groupId: 0xff00, keySet: KEY_SET }]],
            [
                "group 1 twice",
                [
                    { groupId: 1, keySet: KEY_SET },
                    { groupId: 1, keySet: KEY_SET },
                ],
            ],
            ["key set 0, which is the fabric's IPK", [{ groupId: 1, keySet: { ...KEY_SET, groupKeySetId: 0 } }]],
            ["security policy 2", [{ groupId: 1, keySet: { ...KEY_SET, groupKeySecurityPolicy: 2 } }]],
            [
                "not Unix-epoch microseconds",
                [{ groupId: 1, keySet: { ...KEY_SET, epochStartTime0: 946_684_799_999_999n } }],
            ],
            [
                "key set 1 with two different keys",
                [
                    { groupId: 1, keySet: KEY_SET },
                    { groupId: 2, keySet: { ...KEY_SET, epochStartTime0: KEY_SET.epochStartTime0 + 1n } },
                ],
            ],
        ];
        for (const [message, groups] of refused) {
            expect(() => validateControllerGroups("dut", groups), message)
                .throw(ImplementationError)
                .property("message")
                .contains(message);
        }
    });

    it("bounds the key set start time to a safe JSON number", () => {
        const startingAt = (epochStartTime0: bigint) => [{ groupId: 1, keySet: { ...KEY_SET, epochStartTime0 } }];

        validateControllerGroups("dut", startingAt(BigInt(Number.MAX_SAFE_INTEGER)));
        validateControllerGroups("dut", startingAt(946_684_800_000_000n));
        expect(() => validateControllerGroups("dut", startingAt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)))
            .throw(ImplementationError)
            .property("message")
            .contains("not Unix-epoch microseconds");
    });

    it("refuses a send on a group the case has not keyed yet", () => {
        const keyed = new KeyedGroups();
        expect(() => keyed.assertKeyed("dut", 1))
            .throw(ImplementationError)
            .property("message")
            .contains("before defineKeySet");
        keyed.add(1);
        keyed.assertKeyed("dut", 1);
    });
});
