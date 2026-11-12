/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Internal } from "#behavior/state/managed/Internal.js";
import { MockExchange } from "@matter/node/testing";
import { FabricIndex, NodeId } from "@matter/types";
import { aclEndpoint, TestStruct } from "./values/value-utils.js";

describe("Internal", () => {
    describe("referenceOf", () => {
        for (const [label, value] of [
            ["null", null],
            ["undefined", undefined],
            ["a number", 1],
            ["a string", "one"],
            ["a plain object", { foo: "bar" }],
            ["a plain array", ["one"]],
        ] as const) {
            it(`returns undefined for ${label}`, () => {
                expect(Internal.referenceOf(value)).undefined;
            });
        }

        it("returns the reference of a managed value", async () => {
            const struct = TestStruct({ foo: "string" }, { foo: "bar" });

            await struct.online(
                { exchange: new MockExchange({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }), node: aclEndpoint() },
                ref => {
                    expect(Internal.referenceOf(ref)?.value).deep.equals({ foo: "bar" });
                },
            );
        });
    });
});
