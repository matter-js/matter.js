/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "../MatterError.js";

class GaloisField {
    private readonly exp = new Array<number>();
    private readonly log = new Array<number>();
    readonly size: number;

    constructor(
        private readonly prime = 0x11d,
        generator = 2,
        c_exp = 8,
    ) {
        this.size = Math.floor(Math.pow(2, c_exp) - 1);
        let x = 1;
        for (let i = 0; i < this.size; i++) {
            this.exp[i] = x;
            this.log[x] = i;
            x = this.multiplyNoLut(x, generator);
        }

        for (let i = this.size; i < this.size * 2; i++) {
            this.exp[i] = this.exp[i - this.size];
        }
    }

    public multiply(x: number, y: number) {
        if (x === 0 || y === 0) return 0;
        return this.exp[(this.log[x] + this.log[y]) % this.size];
    }

    public multiplyPolynom(p: number[], q: number[]) {
        const result = new Array<number>();
        const logP = new Array<number>();
        for (let i = 0; i < p.length; i++) {
            logP[i] = this.log[p[i]];
        }
        for (let j = 0; j < q.length; j++) {
            if (q[j] === 0) continue;
            const lq = this.log[q[j]];
            for (let i = 0; i < p.length; i++) {
                if (p[i] === 0) continue;
                result[i + j] ^= this.exp[logP[i] + lq];
            }
        }
        return result;
    }

    public power(x: number, power: number) {
        return this.exp[(this.log[x] * power) % this.size];
    }

    private multiplyNoLut(x: number, y: number) {
        let result = 0;
        while (y > 0) {
            if ((y & 1) !== 0) result = result ^ x;
            y = y >> 1;
            x = x << 1;
            if (x > this.size) {
                x = x ^ this.prime;
            }
        }
        return result;
    }
}

export class ReedSolomon {
    private readonly galoisField = new GaloisField();

    computeErrorCorrection(data: Uint8Array, ecLength: number) {
        const { length } = data;
        if (length + ecLength > this.galoisField.size) throw new UnexpectedDataError("Message is too long");

        const generator = this.generatePolynom(ecLength);
        const { length: generatorLength } = generator;
        const buffer = new Uint8Array(length + generatorLength - 1);
        buffer.set(data, 0);
        for (let i = 0; i < length; i++) {
            const coef = buffer[i];
            if (coef === 0) continue;
            for (let j = 0; j < generatorLength; j++) {
                buffer[i + j] ^= this.galoisField.multiply(generator[j], coef);
            }
        }
        return buffer.slice(length);
    }

    private generatePolynom(ecLength: number) {
        let result = [1];
        for (let i = 0; i < ecLength; i++) {
            result = this.galoisField.multiplyPolynom(result, [1, this.galoisField.power(2, i)]);
        }
        return result;
    }
}
