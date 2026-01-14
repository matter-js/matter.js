/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SJCL: https://github.com/bitwiseshiftleft/sjcl/blob/master/core/aes.js
 *
 * OpenSSL: https://github.com/openssl/openssl/blob/master/crypto/aes/aes_core.c
 */

import { Bytes } from "#util/Bytes.js";
import { WordArray } from "./WordArray.js";

/**
 * AES core block cipher implementation.
 *
 * WARNING: Unaudited.  Consider platform replacement if available.
 */
export function Aes(key: Bytes) {
    const { encryptKey, decryptKey } = expandKey(key);

    return {
        encrypt(pt: WordArray, ct = pt) {
            return crypt(pt, ct, encryptKey, Tables.enc);
        },

        decrypt(ct: WordArray, pt = ct) {
            return crypt(ct, pt, decryptKey, Tables.dec);
        },
    };
}

/**
 * Precomputed tables for AES algorithm.
 */
interface Tables {
    mix1: WordArray;
    mix2: WordArray;
    mix3: WordArray;
    mix4: WordArray;
    sbox: WordArray;
}

let etabs: Tables | undefined, dtabs: Tables | undefined;

const Tables = {
    get enc() {
        if (!etabs) {
            generateTables();
        }
        return etabs!;
    },

    get dec() {
        if (!dtabs) {
            generateTables();
        }
        return dtabs!;
    },
};

const mixNames = ["mix1", "mix2", "mix3", "mix4"] as const;

/**
 * Generate tables used by {@link crypt}.
 *
 * These tables hold static data used during encryption and decryption.
 */
function generateTables() {
    etabs = Tables();
    dtabs = Tables();

    const d = Table(),
        th = Table();
    let i: number, x: number, xInv: number, x2: number, x4: number, x8: number, s: number, tEnc: number, tDec: number;

    for (i = 0; i < 256; i++) {
        th[(d[i] = (i << 1) ^ ((i >> 7) * 283)) ^ i] = i;
    }

    for (x = xInv = 0; !etabs.sbox[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
        s = xInv ^ (xInv << 1) ^ (xInv << 2) ^ (xInv << 3) ^ (xInv << 4);
        s = (s >> 8) ^ (s & 255) ^ 99;
        etabs.sbox[x] = s;
        dtabs.sbox[s] = x;

        x8 = d[(x4 = d[(x2 = d[x])])];
        tDec = (x8 * 0x1010101) ^ (x4 * 0x10001) ^ (x2 * 0x101) ^ (x * 0x1010100);
        tEnc = (d[s] * 0x101) ^ (s * 0x1010100);

        for (const name of mixNames) {
            etabs[name][x] = tEnc = (tEnc << 24) ^ (tEnc >>> 8);
            dtabs[name][s] = tDec = (tDec << 24) ^ (tDec >>> 8);
        }
    }

    function Tables() {
        return Object.fromEntries([...mixNames, "sbox"].map(k => [k, Table()])) as unknown as Tables;
    }

    function Table() {
        return WordArray(256);
    }
}

/**
 * AES computation.
 *
 * Performs encryption/decryption of one or more blocks in {@link data}.
 *
 * {@link input} and {@link output} may be the same buffer to operate in place.
 */
function crypt(input: WordArray, output: WordArray, roundKeys: WordArray, tabs: Tables) {
    const decrypt = tabs === dtabs,
        numRounds = roundKeys.length / 4 - 2;

    // These are the precomputed tables generated in generateTables
    const { mix1, mix2, mix3, mix4, sbox } = tabs;

    // Allocate working variables for each word in the block
    let a = input[0] ^ roundKeys[0],
        b = input[decrypt ? 3 : 1] ^ roundKeys[1],
        c = input[2] ^ roundKeys[2],
        d = input[decrypt ? 1 : 3] ^ roundKeys[3],
        roundKeyAt = 4;

    // Perform computation (sub bytes, shift rows, mix columns & add round key) for each round
    for (let i = 0; i < numRounds; i++) {
        // Note that we need to use unsigned bit shift (>>>) for the most significant byte because JS integers are
        // 32-bit unsigned and the sign will otherwise mess us up
        const atemp =
            mix1[a >>> 24] ^ mix2[(b >> 16) & 255] ^ mix3[(c >> 8) & 255] ^ mix4[d & 255] ^ roundKeys[roundKeyAt++];
        const btemp =
            mix1[b >>> 24] ^ mix2[(c >> 16) & 255] ^ mix3[(d >> 8) & 255] ^ mix4[a & 255] ^ roundKeys[roundKeyAt++];
        const ctemp =
            mix1[c >>> 24] ^ mix2[(d >> 16) & 255] ^ mix3[(a >> 8) & 255] ^ mix4[b & 255] ^ roundKeys[roundKeyAt++];
        d = mix1[d >>> 24] ^ mix2[(a >> 16) & 255] ^ mix3[(b >> 8) & 255] ^ mix4[c & 255] ^ roundKeys[roundKeyAt++];
        a = atemp;
        b = btemp;
        c = ctemp;
    }

    // Write working blocks into output buffer
    for (let i = 0; i < 4; i++) {
        output[decrypt ? 3 & -i : i] =
            (sbox[a >>> 24] << 24) ^
            (sbox[(b >> 16) & 255] << 16) ^
            (sbox[(c >> 8) & 255] << 8) ^
            sbox[d & 255] ^
            roundKeys[roundKeyAt++];
        const atemp = a;
        a = b;
        b = c;
        c = d;
        d = atemp;
    }

    return output;
}

/**
 * Schedule the key used for encryption.
 *
 * This generates keys for each round based off of the input key.
 */
function expandKey(keyData: Bytes) {
    const key = Bytes.of(keyData);
    const inputLength = key.length / 4,
        roundsNeeded = inputLength + 7,
        wordsNeeded = roundsNeeded * 4,
        encryptKey = WordArray.fromByteArray(key, wordsNeeded),
        sbox = Tables.enc.sbox;

    for (let i = inputLength, rcon = 1; i < wordsNeeded; i++) {
        let temp = encryptKey[i - 1];

        if (i % inputLength === 0 || (inputLength === 8 && i % inputLength === 4)) {
            temp =
                (sbox[temp >>> 24] << 24) ^
                (sbox[(temp >> 16) & 255] << 16) ^
                (sbox[(temp >> 8) & 255] << 8) ^
                sbox[temp & 255];

            if (i % inputLength === 0) {
                temp = (temp << 8) ^ (temp >>> 24) ^ (rcon << 24);
                rcon = (rcon << 1) ^ ((rcon >> 7) * 283);
            }
        }

        encryptKey[i] = encryptKey[i - inputLength] ^ temp;
    }

    const { mix1, mix2, mix3, mix4 } = Tables.dec,
        decryptKey = WordArray(encryptKey.length);

    for (let i = encryptKey.length, j = 0; i; j++, i--) {
        const tmp = encryptKey[j & 3 ? i : i - 4];
        if (i <= 4 || j < 4) {
            decryptKey[j] = tmp;
        } else {
            decryptKey[j] =
                mix1[sbox[tmp >>> 24]] ^
                mix2[sbox[(tmp >> 16) & 255]] ^
                mix3[sbox[(tmp >> 8) & 255]] ^
                mix4[sbox[tmp & 255]];
        }
    }

    return { encryptKey, decryptKey };
}
