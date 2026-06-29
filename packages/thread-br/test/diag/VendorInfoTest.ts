/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import {
    ThreadStackVersion,
    VendorAppUrl,
    VendorModel,
    VendorName,
    VendorSwVersion,
    Version,
} from "../../src/tlv/diag/VendorInfo.js";

describe("Version", () => {
    it("decodes Thread protocol version 4 (Thread 1.4)", () => {
        expect(Version.decode(Bytes.of(Bytes.fromHex("0004")))).to.equal(4);
    });

    it("round-trips arbitrary 16-bit version numbers", () => {
        for (const v of [0, 1, 4, 0x1234, 0xffff]) {
            expect(Version.decode(Version.encode(v))).to.equal(v);
        }
    });

    it("rejects bad sizes", () => {
        expect(() => Version.decode(new Uint8Array(1))).to.throw(/2 bytes/);
        expect(() => Version.decode(new Uint8Array(3))).to.throw(/2 bytes/);
    });
});

describe("VendorName", () => {
    it("decodes ASCII", () => {
        expect(VendorName.decode(Bytes.of(new TextEncoder().encode("Acme")))).to.equal("Acme");
    });

    it("decodes UTF-8 multibyte (emoji + accent)", () => {
        const v = "Möbiusü\u{1f4a1}";
        expect(VendorName.decode(VendorName.encode(v))).to.equal(v);
    });

    it("decodes empty string", () => {
        expect(VendorName.decode(new Uint8Array())).to.equal("");
    });

    it("round-trips a maximum-length ASCII string (32 bytes)", () => {
        const v = "0123456789abcdef0123456789abcdef";
        expect(VendorName.decode(VendorName.encode(v))).to.equal(v);
    });

    it("rejects encode strings exceeding 32 bytes", () => {
        expect(() => VendorName.encode("0123456789abcdef0123456789abcdefX")).to.throw(/VendorName/);
    });
});

describe("VendorModel", () => {
    it("round-trips a model identifier", () => {
        const m = "OTBR-RPi5-rev2";
        expect(VendorModel.decode(VendorModel.encode(m))).to.equal(m);
    });

    it("rejects strings exceeding 32 bytes", () => {
        expect(() => VendorModel.encode("a".repeat(33))).to.throw(/VendorModel/);
    });
});

describe("VendorSwVersion", () => {
    it("round-trips a version string", () => {
        const v = "1.2.3";
        expect(VendorSwVersion.decode(VendorSwVersion.encode(v))).to.equal(v);
    });

    it("rejects strings exceeding 16 bytes", () => {
        expect(() => VendorSwVersion.encode("a".repeat(17))).to.throw(/VendorSwVersion/);
    });
});

describe("ThreadStackVersion", () => {
    it("round-trips a long stack version string up to 64 bytes", () => {
        const v = "OPENTHREAD/thread-reference-20240711-19-g1234567; Linux 6.6";
        expect(ThreadStackVersion.decode(ThreadStackVersion.encode(v))).to.equal(v);
    });

    it("rejects strings exceeding 64 bytes", () => {
        expect(() => ThreadStackVersion.encode("a".repeat(65))).to.throw(/ThreadStackVersion/);
    });
});

describe("VendorAppUrl", () => {
    it("round-trips a URL up to 96 bytes", () => {
        const u = "https://example.com/some/path";
        expect(VendorAppUrl.decode(VendorAppUrl.encode(u))).to.equal(u);
    });

    it("rejects strings exceeding 96 bytes", () => {
        expect(() => VendorAppUrl.encode("a".repeat(97))).to.throw(/VendorAppUrl/);
    });
});
