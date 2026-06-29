/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeKeys } from "../src/otbr-rest/caseNormalizer.js";

describe("normalizeKeys", () => {
    it("rewrites BaId to baId", () => {
        const result = normalizeKeys({ BaId: "00112233" });
        expect(result).to.deep.equal({ baId: "00112233" });
    });

    it("rewrites IP6AddressList to ip6AddressList", () => {
        const result = normalizeKeys({ IP6AddressList: ["fe80::1"] });
        expect(result).to.deep.equal({ ip6AddressList: ["fe80::1"] });
    });

    it("rewrites MACCounters to macCounters", () => {
        const result = normalizeKeys({ MACCounters: { IfInErrors: 1 } });
        expect(result).to.deep.equal({ macCounters: { ifInErrors: 1 } });
    });

    it("rewrites PSKc to pskc", () => {
        const result = normalizeKeys({ PSKc: "abcdef" });
        expect(result).to.deep.equal({ pskc: "abcdef" });
    });

    it("rewrites RxOnWhenIdle to rxOnWhenIdle by lowercasing first letter", () => {
        const result = normalizeKeys({ RxOnWhenIdle: 1 });
        expect(result).to.deep.equal({ rxOnWhenIdle: 1 });
    });

    it("is idempotent — running it twice is the same as once", () => {
        const input = {
            BaId: "x",
            IP6AddressList: ["a", "b"],
            MACCounters: { IfInErrors: 1, IfOutErrors: 2 },
            NetworkName: "TestNet",
        };
        const once = normalizeKeys(input);
        const twice = normalizeKeys(once);
        expect(twice).to.deep.equal(once);
    });

    it("recurses into nested objects", () => {
        const result = normalizeKeys({
            LeaderData: {
                PartitionId: 1,
                LeaderRouterId: 2,
            },
        });
        expect(result).to.deep.equal({
            leaderData: { partitionId: 1, leaderRouterId: 2 },
        });
    });

    it("normalizes each item in an array of objects", () => {
        const result = normalizeKeys([{ ChildId: 1 }, { ChildId: 2 }]);
        expect(result).to.deep.equal([{ childId: 1 }, { childId: 2 }]);
    });

    it("passes primitives through unchanged", () => {
        expect(normalizeKeys(42)).to.equal(42);
        expect(normalizeKeys("hello")).to.equal("hello");
        expect(normalizeKeys(true)).to.equal(true);
        expect(normalizeKeys(null)).to.equal(null);
    });

    it("passes empty objects and arrays through", () => {
        expect(normalizeKeys({})).to.deep.equal({});
        expect(normalizeKeys([])).to.deep.equal([]);
    });

    it("normalizes deeply nested combinations of arrays and objects", () => {
        const result = normalizeKeys({
            Outer: [{ Inner: { DeepKey: 1 } }, { Inner: { DeepKey: 2 } }],
        });
        expect(result).to.deep.equal({
            outer: [{ inner: { deepKey: 1 } }, { inner: { deepKey: 2 } }],
        });
    });
});
