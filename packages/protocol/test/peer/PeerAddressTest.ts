/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerAddress, PeerAddressMap, PeerAddressSet } from "#peer/PeerAddress.js";
import { FabricIndex, GroupId, NodeId } from "@matter/types";

describe("PeerAddress", () => {
    describe("interning", () => {
        it("returns a canonical instance for equal addresses", () => {
            const a = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });
            const b = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });

            expect(a).equal(b);
        });

        it("distinguishes addresses by fabric and node", () => {
            const base = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });

            expect(PeerAddress({ fabricIndex: FabricIndex(2), nodeId: NodeId(5n) })).not.equal(base);
            expect(PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(6n) })).not.equal(base);
        });

        it("returns an already-interned address unchanged", () => {
            const a = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });

            expect(PeerAddress(a)).equal(a);
        });

        it("passes undefined through", () => {
            expect(PeerAddress(undefined)).undefined;
        });

        it("renders as @<fabric>:<node> in hex", () => {
            const address = PeerAddress({ fabricIndex: FabricIndex(0x0a), nodeId: NodeId(0xffn) });

            expect(`${address}`).equal("@a:ff");
        });
    });

    describe("is", () => {
        it("compares by fabric and node", () => {
            const a = { fabricIndex: FabricIndex(1), nodeId: NodeId(5n) };
            const b = { fabricIndex: FabricIndex(1), nodeId: NodeId(5n) };
            const c = { fabricIndex: FabricIndex(1), nodeId: NodeId(6n) };

            expect(PeerAddress.is(a, b)).equal(true);
            expect(PeerAddress.is(a, c)).equal(false);
        });

        it("returns false when either operand is undefined", () => {
            const a = { fabricIndex: FabricIndex(1), nodeId: NodeId(5n) };

            expect(PeerAddress.is(undefined, a)).equal(false);
            expect(PeerAddress.is(a, undefined)).equal(false);
            expect(PeerAddress.is(undefined, undefined)).equal(false);
        });
    });

    describe("isGroup", () => {
        it("detects group node IDs", () => {
            const group = { fabricIndex: FabricIndex(1), nodeId: NodeId.fromGroupId(GroupId(5)) };
            const operational = { fabricIndex: FabricIndex(1), nodeId: NodeId(5n) };

            expect(PeerAddress.isGroup(group)).equal(true);
            expect(PeerAddress.isGroup(operational)).equal(false);
        });
    });

    describe("PeerAddressMap", () => {
        it("keys by address value, not identity", () => {
            const map = new PeerAddressMap<string>();
            map.set({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) }, "value");

            expect(map.get({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) })).equal("value");
            expect(map.has({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) })).equal(true);
            expect(map.delete({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) })).equal(true);
            expect(map.has({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) })).equal(false);
        });
    });

    describe("PeerAddressSet", () => {
        it("deduplicates by address value", () => {
            const set = new PeerAddressSet();
            set.add({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });
            set.add({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) });

            expect(set.size).equal(1);
            expect(set.has({ fabricIndex: FabricIndex(1), nodeId: NodeId(5n) })).equal(true);
        });
    });
});
