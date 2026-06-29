/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OperationalDataset } from "../src/dataset/OperationalDataset.js";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

// Tests execute from `<pkg>/build/esm/test/`; the `../../..` hops up to the package root
// where the source-tree fixtures live.
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures/datasets");

function loadFixture(name: string): Uint8Array {
    const hex = readFileSync(resolve(FIXTURE_DIR, name), "utf8").trim();
    return Bytes.of(Bytes.fromHex(hex));
}

describe("OperationalDataset.decode", () => {
    it("decodes the synthetic-1 fixture into named fields", () => {
        const blob = loadFixture("synthetic-1.hex");
        const ds = OperationalDataset.decode(blob);

        expect(ds.channel).to.equal(0x0f);
        expect(ds.extPanId).to.deep.equal(new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]));
        expect(ds.networkName).to.equal("OpenThread");
        expect(ds.pskc).to.deep.equal(Uint8Array.from(Array.from({ length: 16 }, (_, i) => i)));
        expect(ds.activeTimestamp).to.deep.equal(new Uint8Array([0, 0, 0, 0, 0, 1, 0, 0]));
    });

    it("preserves the original blob in `raw`", () => {
        const blob = loadFixture("synthetic-1.hex");
        const ds = OperationalDataset.decode(blob);
        expect(ds.raw).to.deep.equal(blob);
    });

    it("captures unknown TLVs in `unknownTlvs`", () => {
        const blob = BasicTlv.encode([
            { type: 0x00, value: new Uint8Array([0x0f]) },
            { type: 0xaa, value: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
            { type: 0xab, value: new Uint8Array() },
        ]);
        const ds = OperationalDataset.decode(blob);
        expect(ds.unknownTlvs).to.deep.equal([
            { type: 0xaa, value: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
            { type: 0xab, value: new Uint8Array() },
        ]);
    });

    it("decodes the security policy as a 4-byte (rotation, flags) pair", () => {
        const blob = BasicTlv.encode([{ type: 0x0c, value: new Uint8Array([0x02, 0xa3, 0xff, 0xf8]) }]);
        const ds = OperationalDataset.decode(blob);
        expect(ds.securityPolicy).to.deep.equal({ rotationTime: 0x02a3, flags: 0xfff8 });
    });

    it("decodes the canonical 3-byte CHANNEL form", () => {
        const blob = BasicTlv.encode([{ type: 0x00, value: new Uint8Array([0x00, 0x00, 0x19]) }]);
        const ds = OperationalDataset.decode(blob);
        expect(ds.channel).to.equal(0x19);
    });

    it("rejects malformed fixed-width TLVs", () => {
        const blob = BasicTlv.encode([{ type: 0x05, value: new Uint8Array([0x01]) }]);
        expect(() => OperationalDataset.decode(blob)).to.throw(/NETWORK_KEY/);
    });
});

describe("OperationalDataset.encode", () => {
    it("round-trips the synthetic-1 fixture byte-identically", () => {
        const blob = loadFixture("synthetic-1.hex");
        const ds = OperationalDataset.decode(blob);
        expect(OperationalDataset.encode(ds)).to.deep.equal(blob);
    });

    it("preserves unknown TLVs through a decode/encode round-trip", () => {
        const blob = BasicTlv.encode([
            { type: 0x00, value: new Uint8Array([0x0f]) },
            { type: 0xaa, value: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) },
            { type: 0x03, value: new TextEncoder().encode("Foo") },
            { type: 0xbb, value: new Uint8Array([0x01]) },
        ]);
        const ds = OperationalDataset.decode(blob);
        expect(OperationalDataset.encode(ds)).to.deep.equal(blob);
    });

    it("replays a non-canonical 1-byte CHANNEL encoding when fields are unmodified", () => {
        const blob = BasicTlv.encode([
            { type: 0x00, value: new Uint8Array([0x0f]) },
            { type: 0x01, value: new Uint8Array([0x12, 0x34]) },
        ]);
        const ds = OperationalDataset.decode(blob);
        expect(ds.channel).to.equal(0x0f);
        expect(OperationalDataset.encode(ds)).to.deep.equal(blob);
    });

    it("re-encodes a mutated channel in canonical 3-byte form", () => {
        const blob = BasicTlv.encode([{ type: 0x00, value: new Uint8Array([0x0f]) }]);
        const ds = OperationalDataset.decode(blob);
        ds.channel = 0x19;
        const encoded = OperationalDataset.encode(ds);
        const walked = BasicTlv.walk(encoded);
        expect(walked).to.have.lengthOf(1);
        expect(walked[0].type).to.equal(0x00);
        expect(walked[0].value).to.deep.equal(new Uint8Array([0x00, 0x00, 0x19]));
    });

    it("emits canonical encoding for an in-memory dataset (no _originalTlvs)", () => {
        const ds: OperationalDataset = {
            channel: 0x19,
            panId: 0x1234,
            unknownTlvs: [{ type: 0xaa, value: new Uint8Array([0x42]) }],
            raw: new Uint8Array(),
        };
        const encoded = OperationalDataset.encode(ds);
        const walked = BasicTlv.walk(encoded);
        expect(walked).to.have.lengthOf(3);
        expect(walked[0].type).to.equal(0x00);
        expect(walked[0].value).to.deep.equal(new Uint8Array([0x00, 0x00, 0x19]));
        expect(walked[1].type).to.equal(0x01);
        expect(walked[1].value).to.deep.equal(new Uint8Array([0x12, 0x34]));
        expect(walked[2].type).to.equal(0xaa);
        expect(walked[2].value).to.deep.equal(new Uint8Array([0x42]));
    });
});

const SYNTHETIC_1_HEX =
    "00010f02081122334455667788030a4f70656e5468726561640410000102030405060708090a0b0c0d0e0f0e080000000000010000";

describe("OperationalDataset.decode hex input", () => {
    it("decodes a hex string identically to the byte form", () => {
        const fromHex = OperationalDataset.decode(SYNTHETIC_1_HEX);
        const fromBytes = OperationalDataset.decode(Bytes.of(Bytes.fromHex(SYNTHETIC_1_HEX)));
        expect(fromHex).to.deep.equal(fromBytes);
    });
    it("tolerates whitespace in the hex", () => {
        const ds = OperationalDataset.decode(
            "00 01 0f  02 08 1122334455667788  03 0a 4f70656e5468726561640410000102030405060708090a0b0c0d0e0f 0e08 0000000000010000",
        );
        expect(ds.extPanId).to.not.equal(undefined);
    });
    it("throws a typed error on malformed hex", () => {
        let err: unknown;
        try {
            OperationalDataset.decode("zzzz");
        } catch (e) {
            err = e;
        }
        expect(err).to.be.instanceOf(Error);
    });
});

describe("OperationalDataset.redact", () => {
    it("drops PSKC and NETWORK_KEY but preserves other fields", () => {
        const ds: OperationalDataset = {
            channel: 0x19,
            panId: 0x1234,
            networkName: "OpenThread",
            pskc: new Uint8Array([0x11, 0x22]),
            networkKey: new Uint8Array(16),
            unknownTlvs: [],
            raw: new Uint8Array(),
        };
        const redacted = OperationalDataset.redact(ds);
        expect(redacted.pskc).to.equal(undefined);
        expect(redacted.networkKey).to.equal(undefined);
        expect(redacted.channel).to.equal(0x19);
        expect(redacted.panId).to.equal(0x1234);
        expect(redacted.networkName).to.equal("OpenThread");
    });

    it("does not mutate the input dataset", () => {
        const pskc = new Uint8Array([0x11]);
        const networkKey = new Uint8Array(16);
        const ds: OperationalDataset = {
            pskc,
            networkKey,
            unknownTlvs: [],
            raw: new Uint8Array(),
        };
        OperationalDataset.redact(ds);
        expect(ds.pskc).to.equal(pskc);
        expect(ds.networkKey).to.equal(networkKey);
    });

    it("is a no-op when secrets are already absent", () => {
        const ds: OperationalDataset = {
            channel: 0x19,
            unknownTlvs: [],
            raw: new Uint8Array(),
        };
        const redacted = OperationalDataset.redact(ds);
        expect(redacted.pskc).to.equal(undefined);
        expect(redacted.networkKey).to.equal(undefined);
        expect(redacted.channel).to.equal(0x19);
    });
});
