/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";
import { ClientKeyExchangeMessage } from "../src/dtls/handshake/ClientKeyExchangeMessage.js";
import { ServerHelloDoneMessage } from "../src/dtls/handshake/ServerHelloDoneMessage.js";

const PACKAGE_ROOT = process.cwd();
const FIXTURE = resolve(PACKAGE_ROOT, "test/fixtures/ecjpake/mbedtls-self-test-vectors.json");

interface MbedTlsVectors {
    cli_two: string;
    srv_two: string;
}

function loadVectors(): MbedTlsVectors {
    return JSON.parse(readFileSync(FIXTURE, "utf8")) as MbedTlsVectors;
}

describe("ServerHelloDoneMessage.parse", () => {
    it("accepts an empty body", () => {
        ServerHelloDoneMessage.parse(new Uint8Array(0));
    });

    it("rejects any non-empty body", () => {
        expect(() => ServerHelloDoneMessage.parse(Bytes.of(Bytes.fromHex("00")))).to.throw();
        expect(() => ServerHelloDoneMessage.parse(Bytes.of(Bytes.fromHex("aabb")))).to.throw();
    });
});

describe("ClientKeyExchangeMessage.build", () => {
    const vectors = loadVectors();

    it("emits the round-2 ECJPAKEKeyKP without any ECParameters prefix", () => {
        const cliKp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        const wire = Bytes.of(ClientKeyExchangeMessage.build(cliKp));
        expect(Bytes.toHex(wire)).to.equal(vectors.cli_two);
        // First byte is the X-length (0x41 = 65) — not the 0x03 ECParameters tag.
        expect(wire[0]).to.equal(0x41);
    });

    it("differs from the ServerKeyExchange encoding by the 3-byte ECParameters prefix", () => {
        const srvKp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        });
        const cke = Bytes.of(ClientKeyExchangeMessage.build(srvKp));
        const ske = Bytes.of(EcJpakeRound.serializeRound2(srvKp, { prependEcParameters: true }));
        expect(ske.length - cke.length).to.equal(3);
        expect(Bytes.areEqual(cke, ske.subarray(3))).to.equal(true);
    });
});
