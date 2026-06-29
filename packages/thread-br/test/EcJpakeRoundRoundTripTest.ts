/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ECJPAKE_ID_CLIENT, EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = resolve(PACKAGE_ROOT, "test/fixtures/ecjpake/mbedtls-self-test-vectors.json");

interface MbedTlsVectors {
    x1: string;
    x2: string;
    cli_one: string;
    srv_one: string;
}

function loadVectors(): MbedTlsVectors {
    return JSON.parse(readFileSync(FIXTURE, "utf8")) as MbedTlsVectors;
}

function bigintFromHex(hex: string): bigint {
    return BigInt("0x" + hex);
}

describe("EcJpakeRound parse -> serialize round-trip", () => {
    const vectors = loadVectors();

    it("is byte-identical across synthetic round-1 messages with varying r-lengths", () => {
        // Mix of ephemeral seeds to hit both 32-byte and shorter r encodings via
        // the deterministic build/parse loop.
        const x1 = bigintFromHex(vectors.x1);
        const x2 = bigintFromHex(vectors.x2);
        for (let seed = 7n; seed < 20n; seed++) {
            const built = EcJpakeRound.buildRound1({ x1, x2, v1: seed, v2: seed + 1n, id: ECJPAKE_ID_CLIENT });
            const wire = EcJpakeRound.serializeRound1(built.kp1, built.kp2);
            const round = EcJpakeRound.parseRound1(wire);
            const reEncoded = EcJpakeRound.serializeRound1(round.kp1, round.kp2);
            expect(Bytes.areEqual(wire, reEncoded), `seed=${seed}`).to.equal(true);
        }
    });

    it("preserves both kp1 and kp2 ZKP fields independently across parse -> serialize", () => {
        const built = EcJpakeRound.buildRound1({
            x1: bigintFromHex(vectors.x1),
            x2: bigintFromHex(vectors.x2),
            v1: 0xdeadbeefn,
            v2: 0xfeedfacen,
            id: ECJPAKE_ID_CLIENT,
        });
        const wire = EcJpakeRound.serializeRound1(built.kp1, built.kp2);
        const round = EcJpakeRound.parseRound1(wire);
        expect(Bytes.areEqual(round.kp1.X, built.kp1.X)).to.equal(true);
        expect(Bytes.areEqual(round.kp1.zkp.V, built.kp1.zkp.V)).to.equal(true);
        expect(Bytes.areEqual(round.kp1.zkp.r, built.kp1.zkp.r)).to.equal(true);
        expect(Bytes.areEqual(round.kp2.X, built.kp2.X)).to.equal(true);
        expect(Bytes.areEqual(round.kp2.zkp.V, built.kp2.zkp.V)).to.equal(true);
        expect(Bytes.areEqual(round.kp2.zkp.r, built.kp2.zkp.r)).to.equal(true);
    });
});
