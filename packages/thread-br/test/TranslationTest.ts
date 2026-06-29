/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeKeys } from "../src/otbr-rest/caseNormalizer.js";
import { __testables, translateNodeJson } from "../src/otbr-rest/translation.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures/otbr-rest");

const RAW_DIAGNOSTICS: unknown = JSON.parse(readFileSync(resolve(FIXTURE_DIR, "diagnostics.json"), "utf8"));

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
        expect(decoded.networkData!.raw.length).to.be.greaterThan(0);
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

    it("translates mleCounters object from normalized OTBR JSON", () => {
        const decoded = translateNodeJson({
            mleCounters: {
                disabledRole: 1,
                detachedRole: 2,
                childRole: 3,
                routerRole: 4,
                leaderRole: 5,
                attachAttempts: 6,
                partitionIdChanges: 7,
                betterPartitionAttachAttempts: 8,
                parentChanges: 9,
                trackedTime: 100000,
                disabledTime: 200000,
                detachedTime: 300000,
                childTime: 400000,
                routerTime: 500000,
                leaderTime: 600000,
            },
        });
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
