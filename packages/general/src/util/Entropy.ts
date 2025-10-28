/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";

/**
 * A source of entropy.
 */
export abstract class Entropy {
    /**
     * Create a random buffer from the most cryptographically-appropriate source available.
     */
    abstract randomBytes(length: number): Bytes;

    get randomUint8() {
        return Bytes.of(this.randomBytes(1))[0];
    }

    get randomUint16() {
        return Bytes.dataViewOf(this.randomBytes(2)).getUint16(0);
    }

    get randomUint32() {
        return Bytes.dataViewOf(this.randomBytes(4)).getUint32(0);
    }

    get randomBigUint64() {
        return Bytes.dataViewOf(this.randomBytes(8)).getBigUint64(0);
    }

    randomBigInt(size: number, maxValue?: bigint) {
        if (maxValue === undefined) {
            return Bytes.asBigInt(this.randomBytes(size));
        }

        while (true) {
            const random = Bytes.asBigInt(this.randomBytes(size));
            if (random < maxValue) return random;
        }
    }
}
