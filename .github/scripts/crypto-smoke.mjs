/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Asserts that a runtime consuming the published @matter/general package obtains working crypto. Deno cannot run
// matter.js from a workspace checkout — it resolves "#" imports against the entry point's package scope rather than
// the referring module's — so this exercises an installed package, which is also how a Deno application consumes it.

import { Crypto, Environment, nodeCryptoDefect, NodeJsStyleCrypto } from "@matter/general";

/** SHA-256 of "abc", per FIPS 180-4. */
const SHA256_OF_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function assert(condition, description) {
    if (!condition) {
        console.error(`FAIL ${description}`);
        process.exitCode = 1;
        return;
    }
    console.log(`ok   ${description}`);
}

function hex(bytes) {
    return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const nodeCrypto = NodeJsStyleCrypto.detectedCrypto;
console.log(`Node.js-style crypto detected: ${nodeCrypto === undefined ? "none" : "present"}`);
if (nodeCrypto !== undefined) {
    console.log(`Defect reported: ${nodeCryptoDefect(nodeCrypto) ?? "none"}`);
}

assert(Environment.default.has(Crypto), "a Crypto implementation is installed");

const crypto = Environment.default.get(Crypto);
console.log(`Implementation selected: ${crypto.constructor.name} (${crypto.implementationName})`);

assert(hex(await crypto.computeHash(new TextEncoder().encode("abc"))) === SHA256_OF_ABC, "SHA-256 matches FIPS 180-4");

const key = new Uint8Array(16);
const nonce = new Uint8Array(13);
const aad = new TextEncoder().encode("aad");
const plaintext = new TextEncoder().encode("matter");
const decrypted = await crypto.decrypt(key, await crypto.encrypt(key, plaintext, nonce, aad), nonce, aad);
assert(hex(decrypted) === hex(plaintext), "aes-128-ccm round trip returns the plaintext");

assert((await crypto.createKeyPair()) !== undefined, "a key pair can be generated");
