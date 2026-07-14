/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { BasicTlv, OperationalDataset } from "@matter/protocol";
import { data as agnersVector1Expected } from "./fixtures/datasets/agners-vector-1.expected.txt.js";
import { data as agnersVector1Hex } from "./fixtures/datasets/agners-vector-1.hex.js";

interface ParsedLine {
    type: number;
    length: number;
    value: Uint8Array;
}

/**
 * Parse Agners' Python output lines (`t:  N (NAME), l: L, v: 0xHEX`).
 *
 * Hex values are emitted as `0x...`; the NETWORK_NAME row uses Python's
 * bytes-literal `b'...'` form, which we decode to UTF-8 bytes so every line
 * exposes a comparable {@link ParsedLine.value}.
 */
function parseAgnersLine(line: string): ParsedLine | undefined {
    const match = line.match(/^t:\s*(\d+)\s+\([^)]+\),\s*l:\s*(\d+),\s*v:\s*(.+)$/);
    if (match === null) return undefined;
    const type = parseInt(match[1], 10);
    const length = parseInt(match[2], 10);
    const v = match[3];
    if (v.startsWith("0x")) {
        return { type, length, value: Bytes.of(Bytes.fromHex(v.slice(2))) };
    }
    const textMatch = v.match(/^b'(.*)'$/);
    if (textMatch !== null) {
        return { type, length, value: new TextEncoder().encode(textMatch[1]) };
    }
    return undefined;
}

describe("OperationalDataset cross-validation against Agners' Python parser", () => {
    it("matches per-TLV (type, length, value) for agners-vector-1 in order", () => {
        const hex = agnersVector1Hex.trim();
        const blob = Bytes.of(Bytes.fromHex(hex));
        const expected = agnersVector1Expected
            .split("\n")
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(parseAgnersLine)
            .filter((p): p is ParsedLine => p !== undefined);

        // Agners' parser skips TLVs whose type isn't in its enum; filter walked entries
        // down to the same set so the ordered comparison stays apples-to-apples.
        const expectedTypes = new Set(expected.map(e => e.type));
        const walked = BasicTlv.walk(blob).filter(e => expectedTypes.has(e.type));
        expect(walked.length, "tlv count").to.equal(expected.length);
        for (let i = 0; i < expected.length; i++) {
            const exp = expected[i];
            const got = walked[i];
            expect(got.type, `type mismatch at index ${i}`).to.equal(exp.type);
            expect(Bytes.of(got.value).length, `length mismatch at index ${i} (type ${exp.type})`).to.equal(exp.length);
            expect(
                Bytes.areEqual(got.value, exp.value),
                `value mismatch at index ${i} (type ${exp.type}): got ${Bytes.toHex(got.value)}, expected ${Bytes.toHex(exp.value)}`,
            ).to.equal(true);
        }
    });

    it("decodes the same fixture into named OperationalDataset accessors", () => {
        const hex = agnersVector1Hex.trim();
        const blob = Bytes.of(Bytes.fromHex(hex));
        const ds = OperationalDataset.decode(blob);

        expect(ds.channel).to.equal(0x19);
        expect(ds.panId).to.equal(0x1234);
        expect(ds.networkName).to.equal("TestNet");
        expect(ds.securityPolicy).to.deep.equal({ rotationTime: 0x02a0, flags: 0xfff8 });
        expect(ds.unknownTlvs).to.have.lengthOf(1);
        expect(ds.unknownTlvs[0].type).to.equal(0xee);
    });

    it("round-trips agners-vector-1 byte-identically", () => {
        const hex = agnersVector1Hex.trim();
        const blob = Bytes.of(Bytes.fromHex(hex));
        const ds = OperationalDataset.decode(blob);
        expect(OperationalDataset.encode(ds)).to.deep.equal(blob);
    });
});
