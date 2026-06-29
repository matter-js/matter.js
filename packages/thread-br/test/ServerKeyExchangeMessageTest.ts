/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";
import { ServerKeyExchangeMessage } from "../src/dtls/handshake/ServerKeyExchangeMessage.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = resolve(PACKAGE_ROOT, "test/fixtures/ecjpake/mbedtls-self-test-vectors.json");

interface MbedTlsVectors {
    srv_two: string;
    cli_two: string;
}

function loadVectors(): MbedTlsVectors {
    return JSON.parse(readFileSync(FIXTURE, "utf8")) as MbedTlsVectors;
}

describe("ServerKeyExchangeMessage.parse", () => {
    const vectors = loadVectors();

    it("parses srv_two (mbedTLS oracle) and exposes the embedded ECJPAKEKeyKP", () => {
        const body = Bytes.of(Bytes.fromHex(vectors.srv_two));
        const kp = ServerKeyExchangeMessage.parse(body);
        expect(kp.X.length).to.equal(65);
        expect(kp.X[0]).to.equal(0x04);
        expect(kp.zkp.V.length).to.equal(65);
        expect(kp.zkp.V[0]).to.equal(0x04);
        // Re-serialise via the EcJpakeRound codec to confirm round-trip identity.
        const reEncoded = EcJpakeRound.serializeRound2(kp, { prependEcParameters: true });
        expect(Bytes.toHex(reEncoded)).to.equal(vectors.srv_two);
    });

    it("rejects bytes that omit the ECParameters prefix (cli_two has no prefix)", () => {
        const body = Bytes.of(Bytes.fromHex(vectors.cli_two));
        expect(() => ServerKeyExchangeMessage.parse(body)).to.throw();
    });

    it("rejects bytes whose ECParameters header names a non-secp256r1 curve", () => {
        const body = Uint8Array.from(Bytes.of(Bytes.fromHex(vectors.srv_two)));
        // Flip the named-curve TLS ID from 0x0017 (secp256r1) to 0x0018 (secp384r1).
        body[2] = 0x18;
        expect(() => ServerKeyExchangeMessage.parse(body)).to.throw(/secp256r1|ECParameters/);
    });

    it("rejects truncated bodies", () => {
        const body = Bytes.of(Bytes.fromHex(vectors.srv_two));
        expect(() => ServerKeyExchangeMessage.parse(body.subarray(0, 5))).to.throw();
    });

    it("rejects bodies with trailing bytes after the round-2 message", () => {
        const body = Bytes.of(Bytes.fromHex(vectors.srv_two));
        const padded = new Uint8Array(body.length + 1);
        padded.set(body, 0);
        padded[body.length] = 0x42;
        expect(() => ServerKeyExchangeMessage.parse(padded)).to.throw(/trailing/);
    });
});
