/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { normalizeKeys } from "../src/otbr-rest/caseNormalizer.js";
import { __testables, translateNodeJson } from "../src/otbr-rest/translation.js";
import { data as diagnosticsJson } from "./fixtures/otbr-rest/diagnostics.json.js";

const RAW_DIAGNOSTICS: unknown = diagnosticsJson;

function loadDiagnosticsArray(): unknown[] {
    const normalized = normalizeKeys(RAW_DIAGNOSTICS);
    if (!Array.isArray(normalized)) throw new Error("expected array");
    return normalized;
}

describe("translateNodeJson", () => {
    it("translates router-with-children entry into populated DiagnosticResponse", () => {
        const list = loadDiagnosticsArray();
        const target = list.find(entry => {
            return entry !== null && typeof entry === "object" && "rloc16" in entry && entry.rloc16 === 5120;
        });
        expect(target).to.not.be.undefined;
        const decoded = translateNodeJson(target);

        expect(decoded.rloc16).to.equal(5120);
        expect(decoded.extMacAddress).to.not.be.undefined;
        expect(Bytes.toHex(decoded.extMacAddress!)).to.equal("0011223344556603");

        expect(decoded.mode).to.deep.equal({
            rxOnWhenIdle: true,
            fullThreadDevice: true,
            fullNetworkData: true,
        });

        expect(decoded.connectivity).to.not.be.undefined;
        expect(decoded.connectivity!.idSequence).to.equal(198);
        expect(decoded.connectivity!.activeRouters).to.equal(5);

        expect(decoded.route64).to.not.be.undefined;
        expect(decoded.route64!.idSequence).to.equal(198);
        expect(decoded.route64!.entries).to.have.length(5);
        expect(decoded.route64!.entries[0].routerId).to.equal(5);
        expect(decoded.route64!.entries[2]).to.deep.equal({
            routerId: 29,
            linkQualityOut: 3,
            linkQualityIn: 3,
            routeCost: 1,
        });

        expect(decoded.leaderData).to.deep.equal({
            partitionId: 305419896,
            weighting: 64,
            dataVersion: 147,
            stableDataVersion: 205,
            leaderRouterId: 61,
        });

        expect(decoded.networkData).to.not.be.undefined;
        expect(decoded.networkData!.raw).to.be.instanceOf(Uint8Array);
        expect(Bytes.of(decoded.networkData!.raw).length).to.be.greaterThan(0);
        expect(decoded.networkData!.prefixes.length).to.be.greaterThan(0);

        expect(decoded.ipv6Addresses).to.not.be.undefined;
        expect(decoded.ipv6Addresses!).to.have.length(4);
        expect(decoded.ipv6Addresses![0]).to.have.length(16);

        expect(decoded.macCounters).to.not.be.undefined;
        expect(decoded.macCounters!.ifInUcastPkts).to.equal(76259);
        expect(decoded.macCounters!.ifOutDiscards).to.equal(29);

        expect(decoded.childTable).to.not.be.undefined;
        expect(decoded.childTable!).to.have.length(1);
        expect(decoded.childTable![0].childId).to.equal(3);
        expect(decoded.childTable![0].timeoutExponent).to.equal(12);
        expect(decoded.childTable![0].mode.rxOnWhenIdle).to.equal(false);

        expect(decoded.channelPages).to.deep.equal([0]);
        expect(decoded.maxChildTimeout).to.equal(240);
    });

    it("handles entry without childTable / maxChildTimeout (rloc16 18432)", () => {
        const list = loadDiagnosticsArray();
        const target = list.find(entry => {
            return entry !== null && typeof entry === "object" && "rloc16" in entry && entry.rloc16 === 18432;
        });
        expect(target).to.not.be.undefined;
        const decoded = translateNodeJson(target);

        expect(decoded.rloc16).to.equal(18432);
        expect(decoded.childTable).to.deep.equal([]);
        expect(decoded.maxChildTimeout).to.be.undefined;
    });

    it("decodes hex-string rloc16 from post-2024 OTBR builds", () => {
        expect(translateNodeJson({ rloc16: "0x4800" }).rloc16).to.equal(18432);
    });

    it("reads the post-2024 `ipv6Addresses` field name (not just legacy `ip6AddressList`)", () => {
        const decoded = translateNodeJson({ rloc16: 5120, ipv6Addresses: ["fe80::1", "fd00::2"] });
        expect(decoded.ipv6Addresses).to.not.be.undefined;
        expect(decoded.ipv6Addresses!).to.have.length(2);
        expect(Bytes.toHex(decoded.ipv6Addresses![0])).to.equal("fe800000000000000000000000000001");
    });

    it("omits rloc16 when malformed rather than mis-decoding", () => {
        expect(translateNodeJson({ rloc16: "0x10000" }).rloc16).to.be.undefined;
        expect(translateNodeJson({ rloc16: "garbage" }).rloc16).to.be.undefined;
    });

    it("returns response with empty unknown[] (rest never produces unknown TLVs)", () => {
        const list = loadDiagnosticsArray();
        const decoded = translateNodeJson(list[0]);
        expect(decoded.unknown).to.deep.equal([]);
    });

    it("translates all 5 fixture entries without throwing", () => {
        const list = loadDiagnosticsArray();
        for (const entry of list) {
            const decoded = translateNodeJson(entry);
            expect(decoded.rloc16).to.be.a("number");
        }
    });

    it("parseIpv6 expands `fd00:0:0:1:0:ff:fe00:7400` to 16 bytes", () => {
        const bytes = __testables.parseIpv6("fd00:0:0:1:0:ff:fe00:7400");
        expect(Bytes.toHex(bytes)).to.equal("fd00000000000001000000fffe007400");
    });

    it("parseIpv6 expands `::1` (low compression)", () => {
        const bytes = __testables.parseIpv6("::1");
        expect(Bytes.toHex(bytes)).to.equal("00000000000000000000000000000001");
    });

    it("parseIpv6 expands `fe80::1`", () => {
        const bytes = __testables.parseIpv6("fe80::1");
        expect(Bytes.toHex(bytes)).to.equal("fe800000000000000000000000000001");
    });

    it("parseIpv6 expands `::` (all zero)", () => {
        const bytes = __testables.parseIpv6("::");
        expect(Bytes.toHex(bytes)).to.equal("00000000000000000000000000000000");
    });

    it("parseIpv6 throws on too many groups", () => {
        expect(() => __testables.parseIpv6("1:2:3:4:5:6:7:8:9")).to.throw();
    });

    it("parseIpv6 throws on multiple :: occurrences", () => {
        expect(() => __testables.parseIpv6("1::2::3")).to.throw();
    });

    // Real OTBR REST mleCounters wire names (verified live against a BR).
    function mle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            radioDisabledCount: 1,
            detachedRoleCount: 2,
            childRoleCount: 3,
            routerRoleCount: 4,
            leaderRoleCount: 5,
            attachAttemptsCount: 6,
            partIdChangesCount: 7,
            betterPartIdAttachAttemptsCount: 8,
            newParentCount: 9,
            totalTrackingTime: 100000,
            radioDisabledTime: 200000,
            detachedRoleTime: 300000,
            childRoleTime: 400000,
            routerRoleTime: 500000,
            leaderRoleTime: 600000,
            ...overrides,
        };
    }

    it("translates mleCounters from the real OTBR wire names", () => {
        const decoded = translateNodeJson({ mleCounters: mle() });
        expect(decoded.mleCounters).to.not.be.undefined;
        expect(decoded.mleCounters!.disabledRole).to.equal(1);
        expect(decoded.mleCounters!.parentChanges).to.equal(9);
        expect(decoded.mleCounters!.trackedTime).to.equal(100000n);
        expect(decoded.mleCounters!.leaderTime).to.equal(600000n);
    });

    it("omits mleCounters when field is absent", () => {
        const decoded = translateNodeJson({ rloc16: 0 });
        expect(decoded.mleCounters).to.be.undefined;
    });

    it("decodes string-encoded 64-bit MLE time counters without precision loss", () => {
        // 2^53 + 1 = 9007199254740993 — not representable as a JS number.
        const decoded = translateNodeJson({
            mleCounters: mle({ totalTrackingTime: "9007199254740993", radioDisabledTime: "200000" }),
        });
        expect(decoded.mleCounters!.trackedTime).to.equal(9007199254740993n);
        expect(decoded.mleCounters!.disabledTime).to.equal(200000n);
    });

    it("accepts the uint64 maximum string MLE counter", () => {
        const decoded = translateNodeJson({ mleCounters: mle({ totalTrackingTime: "18446744073709551615" }) });
        expect(decoded.mleCounters!.trackedTime).to.equal(18446744073709551615n);
    });

    it("skips mleCounters but keeps the node when a counter exceeds uint64", () => {
        // 2^64 = 18446744073709551616, one past uint64 max.
        const decoded = translateNodeJson({
            rloc16: 5120,
            mleCounters: mle({ totalTrackingTime: "18446744073709551616" }),
        });
        expect(decoded.rloc16).to.equal(5120);
        expect(decoded.mleCounters).to.be.undefined;
    });

    it("skips mleCounters when a numeric counter is negative", () => {
        const decoded = translateNodeJson({ rloc16: 5120, mleCounters: mle({ totalTrackingTime: -1 }) });
        expect(decoded.rloc16).to.equal(5120);
        expect(decoded.mleCounters).to.be.undefined;
    });

    it("skips mleCounters when a string counter is malformed", () => {
        const decoded = translateNodeJson({ rloc16: 5120, mleCounters: mle({ totalTrackingTime: "12.5" }) });
        expect(decoded.mleCounters).to.be.undefined;
    });

    it("translates mode with all-zero flags", () => {
        const decoded = translateNodeJson({
            extAddress: "0011223344556677",
            rloc16: 0,
            mode: { rxOnWhenIdle: 0, deviceType: 0, networkData: 0 },
        });
        expect(decoded.mode).to.deep.equal({
            rxOnWhenIdle: false,
            fullThreadDevice: false,
            fullNetworkData: false,
        });
    });

    it("treats parentPriority -1 as low, +1 as high, 0 as medium", () => {
        const baseInput = {
            linkQuality3: 0,
            linkQuality2: 0,
            linkQuality1: 0,
            leaderCost: 0,
            idSequence: 0,
            activeRouters: 0,
            sedBufferSize: 0,
            sedDatagramCount: 0,
        };
        expect(
            translateNodeJson({ connectivity: { ...baseInput, parentPriority: -1 } }).connectivity!.parentPriority,
        ).to.equal(-1);
        expect(
            translateNodeJson({ connectivity: { ...baseInput, parentPriority: 0 } }).connectivity!.parentPriority,
        ).to.equal(0);
        expect(
            translateNodeJson({ connectivity: { ...baseInput, parentPriority: 1 } }).connectivity!.parentPriority,
        ).to.equal(1);
    });
});
