/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotImplementedError, ReedSolomon, UnexpectedDataError } from "#general";
import { Schema } from "./Schema.js";

const QR_MASK = [
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0],
    [0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
    [0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
];

enum Direction {
    UP,
    DOWN,
}

const BLOCKS = [
    { x: 19, y: 19, dir: Direction.UP },
    { x: 19, y: 17, dir: Direction.UP },
    { x: 19, y: 15, dir: Direction.UP },
    { x: 19, y: 13, dir: Direction.UP },
    { x: 19, y: 11, dir: Direction.UP },
    { x: 19, y: 9, dir: Direction.UP },
    { x: 17, y: 9, dir: Direction.DOWN },
    { x: 17, y: 11, dir: Direction.DOWN },
    { x: 17, y: 13, dir: Direction.DOWN },
    { x: 17, y: 15, dir: Direction.DOWN },
    { x: 17, y: 17, dir: Direction.DOWN },
    { x: 17, y: 19, dir: Direction.DOWN },
    { x: 15, y: 19, dir: Direction.UP },
    { x: 15, y: 17, dir: Direction.UP },
    { x: 15, y: 15, dir: Direction.UP },
    { x: 15, y: 13, dir: Direction.UP },
    { x: 15, y: 11, dir: Direction.UP },
    { x: 15, y: 9, dir: Direction.UP },
    { x: 13, y: 9, dir: Direction.DOWN },
    { x: 13, y: 11, dir: Direction.DOWN },
    { x: 13, y: 13, dir: Direction.DOWN },
    { x: 13, y: 15, dir: Direction.DOWN },
    { x: 13, y: 17, dir: Direction.DOWN },
    { x: 13, y: 19, dir: Direction.DOWN },
    { x: 11, y: 19, dir: Direction.UP },
    { x: 11, y: 17, dir: Direction.UP },
    { x: 11, y: 15, dir: Direction.UP },
    { x: 11, y: 13, dir: Direction.UP },
    { x: 11, y: 11, dir: Direction.UP },
    { x: 11, y: 9, dir: Direction.UP },
    { x: 11, y: 7, dir: Direction.UP },
    { x: 11, y: 4, dir: Direction.UP },
    { x: 11, y: 2, dir: Direction.UP },
    { x: 11, y: 0, dir: Direction.UP },
    { x: 9, y: 0, dir: Direction.DOWN },
    { x: 9, y: 2, dir: Direction.DOWN },
    { x: 9, y: 4, dir: Direction.DOWN },
    { x: 9, y: 7, dir: Direction.DOWN },
    { x: 9, y: 9, dir: Direction.DOWN },
    { x: 9, y: 11, dir: Direction.DOWN },
    { x: 9, y: 13, dir: Direction.DOWN },
    { x: 9, y: 15, dir: Direction.DOWN },
    { x: 9, y: 17, dir: Direction.DOWN },
    { x: 9, y: 19, dir: Direction.DOWN },
    { x: 7, y: 11, dir: Direction.UP },
    { x: 7, y: 9, dir: Direction.UP },
    { x: 4, y: 9, dir: Direction.DOWN },
    { x: 4, y: 11, dir: Direction.DOWN },
    { x: 2, y: 11, dir: Direction.UP },
    { x: 2, y: 9, dir: Direction.UP },
    { x: 0, y: 9, dir: Direction.DOWN },
    { x: 0, y: 11, dir: Direction.DOWN },
];

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export class QrCodeSchema extends Schema<string, string> {
    protected encodeInternal(data: string): string {
        const bitStringBuilder = new Array<string>();
        const { length } = data;
        let bitCount = 0;

        // Mode: Alphanumeric
        bitStringBuilder.push("0010");
        bitCount += 4;

        // Length
        bitStringBuilder.push(length.toString(2).padStart(9, "0"));
        bitCount += 9;

        let index = 0;
        while (index < length) {
            const value = 45 * this.getCode(data[index]) + (index < length - 2 ? this.getCode(data[index + 1]) : 0);
            bitStringBuilder.push(value.toString(2).padStart(11, "0"));
            index += 2;
            bitCount += 11;
        }

        // Terminator
        bitStringBuilder.push("0000");
        bitCount += 4;

        // Bit padding
        const remainingBits = 8 - (bitCount % 8);
        if (remainingBits !== 0) {
            bitStringBuilder.push("".padStart(remainingBits, "0"));
            bitCount += remainingBits;
        }

        // Byte padding
        const remainingBytes = 19 - bitCount / 8;
        for (let i = 0; i < remainingBytes; i++) {
            if (i % 2 === 0) {
                bitStringBuilder.push("11101100");
            } else {
                bitStringBuilder.push("00010001");
            }
        }

        // Convert to bytes
        const dataBytes = new Uint8Array(19);
        for (let i = 0; i < 19; i++) {
            dataBytes[i] = Number.parseInt(bitStringBuilder.join("").slice(i * 8, i * 8 + 8), 2);
        }

        // Compute EC
        const ecBytes = new ReedSolomon().computeErrorCorrection(dataBytes, 7);

        // Add EC bits
        for (let i = 0; i < 7; i++) {
            bitStringBuilder.push(ecBytes[i].toString(2).padStart(8, "0"));
        }

        // Copy base QR code
        const qrCode = <number[][]>[];
        QR_MASK.forEach((line, index) => (qrCode[index] = [...line]));

        //qrCode.forEach((line, x) => line.forEach((_v, y) => qrCode[x][y] = 1))

        // Generate the bit string
        const bitString = bitStringBuilder.join("");

        // Xor the bits
        let offset = 0;
        BLOCKS.forEach(({ x, y, dir }) => {
            const yStart = dir === Direction.UP ? y + 1 : y;
            const yEnd = dir === Direction.UP ? y : y + 1;
            if (bitString[offset] === "1") qrCode[yStart][x + 1] = 1 - qrCode[yStart][x + 1];
            if (bitString[offset + 1] === "1") qrCode[yStart][x] = 1 - qrCode[yStart][x];
            if (bitString[offset + 2] === "1") qrCode[yEnd][x + 1] = 1 - qrCode[yEnd][x + 1];
            if (bitString[offset + 3] === "1") qrCode[yEnd][x] = 1 - qrCode[yEnd][x];
            offset += 4;
        });

        // Draw QR Code
        const result = new Array<string>();
        result.push("▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄\n");
        for (let y = 0; y < 21; y += 2) {
            result.push("█");
            for (let x = 0; x < 21; x++) {
                if (qrCode[y][x] === 0) {
                    if (y === 20 || qrCode[y + 1][x] === 1) {
                        result.push("▄");
                    } else {
                        result.push(
                            // Use a braille blank rather than a space to ensure no wrapping/whitespace collapsing
                            "\u2800",
                        );
                    }
                } else {
                    if (y === 20 || qrCode[y + 1][x] === 1) {
                        result.push("█");
                    } else {
                        result.push("▀");
                    }
                }
            }
            result.push("█\n");
        }

        result.push("▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀\n");

        return result.join("");
    }

    private getCode(char: string) {
        const code = ALPHABET.indexOf(char);
        if (code === -1) throw new UnexpectedDataError(`Invalid character ${char}`);
        return code;
    }

    protected decodeInternal(_encoded: string): string {
        throw new NotImplementedError("Method not implemented.");
    }

    get(code: string): string {
        return this.encode(code);
    }
}

export const QrCode = new QrCodeSchema();
