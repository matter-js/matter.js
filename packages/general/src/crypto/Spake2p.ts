/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "../MatterError.js";
import { Bytes, Endian } from "../util/Bytes.js";
import { DataWriter } from "../util/DataWriter.js";
import { Crypto, ec } from "./Crypto.js";
import { CRYPTO_GROUP_SIZE_BYTES } from "./CryptoConstants.js";

const {
    p256: { Point },
    mod,
} = ec;

// M and N constants from https://datatracker.ietf.org/doc/html/draft-bar-cfrg-spake2plus-01
const M = Point.fromHex("02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f");
const N = Point.fromHex("03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49");

// Pre-serialized constants for ecMultiply
const M_BYTES = M.toBytes(false);
const N_BYTES = N.toBytes(false);
const BASE_BYTES = Point.BASE.toBytes(false);

const CRYPTO_W_SIZE_BYTES = CRYPTO_GROUP_SIZE_BYTES + 8;

export interface PbkdfParameters {
    iterations: number;
    salt: Bytes;
}

export class Spake2p {
    readonly #crypto: Crypto;
    readonly #context: Bytes;
    readonly #random: bigint;
    readonly #w0: bigint;

    static async computeW0W1(crypto: Crypto, { iterations, salt }: PbkdfParameters, pin: number) {
        const pinWriter = new DataWriter(Endian.Little);
        pinWriter.writeUInt32(pin);
        const ws = Bytes.of(
            await crypto.createPbkdf2Key(pinWriter.toByteArray(), salt, iterations, CRYPTO_W_SIZE_BYTES * 2),
        );
        const curve = Point.CURVE();
        const w0 = mod(Bytes.asBigInt(ws.slice(0, 40)), curve.n);
        const w1 = mod(Bytes.asBigInt(ws.slice(40, 80)), curve.n);
        return { w0, w1 };
    }

    static async computeW0L(crypto: Crypto, pbkdfParameters: PbkdfParameters, pin: number) {
        const { w0, w1 } = await this.computeW0W1(crypto, pbkdfParameters, pin);
        const L = crypto.ecMultiply(BASE_BYTES, Bytes.fromBigInt(w1, 32));
        return { w0, L };
    }

    static create(crypto: Crypto, context: Bytes, w0: bigint) {
        const curve = Point.CURVE();
        const random = crypto.randomBigInt(32, curve.p);
        return new Spake2p(crypto, context, random, w0);
    }

    constructor(crypto: Crypto, context: Bytes, random: bigint, w0: bigint) {
        this.#crypto = crypto;
        this.#context = context;
        this.#random = random;
        this.#w0 = w0;
    }

    computeX(): Bytes {
        const randomBytes = Bytes.fromBigInt(this.#random, 32);
        const w0Bytes = Bytes.fromBigInt(this.#w0, 32);
        const baseR = this.#crypto.ecMultiply(BASE_BYTES, randomBytes);
        const mW0 = this.#crypto.ecMultiply(M_BYTES, w0Bytes);
        return this.#crypto.ecAdd(baseR, mW0);
    }

    computeY(): Bytes {
        const randomBytes = Bytes.fromBigInt(this.#random, 32);
        const w0Bytes = Bytes.fromBigInt(this.#w0, 32);
        const baseR = this.#crypto.ecMultiply(BASE_BYTES, randomBytes);
        const nW0 = this.#crypto.ecMultiply(N_BYTES, w0Bytes);
        return this.#crypto.ecAdd(baseR, nW0);
    }

    async computeSecretAndVerifiersFromY(w1: bigint, X: Bytes, Y: Bytes) {
        try {
            Point.fromBytes(Bytes.of(Y)).assertValidity();
        } catch (error) {
            throw new InternalError(`Y is not on the curve: ${(error as any).message}`);
        }
        const nW0 = this.#crypto.ecNegate(this.#crypto.ecMultiply(N_BYTES, Bytes.fromBigInt(this.#w0, 32)));
        const yNwo = this.#crypto.ecAdd(Y, nW0);
        const Z = this.#crypto.ecMultiply(yNwo, Bytes.fromBigInt(this.#random, 32));
        const V = this.#crypto.ecMultiply(yNwo, Bytes.fromBigInt(w1, 32));
        return this.computeSecretAndVerifiers(X, Y, Z, V);
    }

    async computeSecretAndVerifiersFromX(L: Bytes, X: Bytes, Y: Bytes) {
        try {
            Point.fromBytes(Bytes.of(X)).assertValidity();
        } catch (error) {
            throw new InternalError(`X is not on the curve: ${(error as any).message}`);
        }
        const mW0 = this.#crypto.ecNegate(this.#crypto.ecMultiply(M_BYTES, Bytes.fromBigInt(this.#w0, 32)));
        const xSubM = this.#crypto.ecAdd(X, mW0);
        const Z = this.#crypto.ecMultiply(xSubM, Bytes.fromBigInt(this.#random, 32));
        const V = this.#crypto.ecMultiply(L, Bytes.fromBigInt(this.#random, 32));
        return this.computeSecretAndVerifiers(X, Y, Z, V);
    }

    private async computeSecretAndVerifiers(X: Bytes, Y: Bytes, Z: Bytes, V: Bytes) {
        const TT_HASH = Bytes.of(await this.computeTranscriptHash(X, Y, Z, V));
        const Ka = TT_HASH.slice(0, 16);
        const Ke = TT_HASH.slice(16, 32);

        const KcAB = Bytes.of(
            await this.#crypto.createHkdfKey(Ka, new Uint8Array(0), Bytes.fromString("ConfirmationKeys"), 32),
        );
        const KcA = KcAB.slice(0, 16);
        const KcB = KcAB.slice(16, 32);

        const hAY = await this.#crypto.signHmac(KcA, Y);
        const hBX = await this.#crypto.signHmac(KcB, X);

        return { Ke, hAY, hBX };
    }

    private computeTranscriptHash(X: Bytes, Y: Bytes, Z: Bytes, V: Bytes) {
        const TTwriter = new DataWriter(Endian.Little);
        this.addToContext(TTwriter, this.#context);
        this.addToContext(TTwriter, Bytes.fromString(""));
        this.addToContext(TTwriter, Bytes.fromString(""));
        this.addToContext(TTwriter, M_BYTES);
        this.addToContext(TTwriter, N_BYTES);
        this.addToContext(TTwriter, X);
        this.addToContext(TTwriter, Y);
        this.addToContext(TTwriter, Z);
        this.addToContext(TTwriter, V);
        this.addToContext(TTwriter, Bytes.fromBigInt(this.#w0, 32));
        return this.#crypto.computeHash(TTwriter.toByteArray());
    }

    private addToContext(TTwriter: DataWriter<Endian.Little>, data: Bytes) {
        TTwriter.writeUInt64(data.byteLength);
        TTwriter.writeByteArray(data);
    }
}
