/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { ECJPAKE_ID_CLIENT, EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";
import { data as mbedtlsVectors } from "./fixtures/ecjpake/mbedtls-self-test-vectors.json.js";

const crypto = new StandardCrypto();

interface MbedTlsVectors {
    x1: string;
    x2: string;
    cli_one: string;
    srv_one: string;
}

function bigintFromHex(hex: string): bigint {
    return BigInt("0x" + hex);
}

describe("EcJpakeRound parse -> serialize round-trip", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("is byte-identical across synthetic round-1 messages with varying r-lengths", async () => {
        // Mix of ephemeral seeds to hit both 32-byte and shorter r encodings via
        // the deterministic build/parse loop.
        const x1 = bigintFromHex(vectors.x1);
        const x2 = bigintFromHex(vectors.x2);
        for (let seed = 7n; seed < 20n; seed++) {
            const built = await EcJpakeRound.buildRound1(crypto, {
                x1,
                x2,
                v1: seed,
                v2: seed + 1n,
                id: ECJPAKE_ID_CLIENT,
            });
            const wire = EcJpakeRound.serializeRound1(built.kp1, built.kp2);
            const round = EcJpakeRound.parseRound1(wire);
            const reEncoded = EcJpakeRound.serializeRound1(round.kp1, round.kp2);
            expect(Bytes.areEqual(wire, reEncoded), `seed=${seed}`).to.equal(true);
        }
    });

    it("preserves both kp1 and kp2 ZKP fields independently across parse -> serialize", async () => {
        const built = await EcJpakeRound.buildRound1(crypto, {
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
