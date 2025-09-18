/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";

/**
 * Class to represent a File designator from Matter.
 * Specification wise this is a bytes object, but to store in a storage we need a string name.
 * This class provides a way to convert between the two.
 */
export class FileDesignator {
    #fd: Bytes;

    /** Create a FileDesignator from a string or bytes object. */
    constructor(fd: string | Bytes) {
        if (typeof fd === "string") {
            this.#fd = Bytes.fromString(fd);
        } else {
            this.#fd = fd;
        }
    }

    /** Return the bytes representation of the FileDesignator. */
    get bytes(): Bytes {
        return this.#fd;
    }

    /** Return the textual/string representation of the FileDesignator. */
    get text(): string {
        const fileDesignatorData = Bytes.of(this.#fd);
        // When all uint8 values are in char() range "a-z0-0-." then use this as the blob name, else hex encode it
        const isValidName = fileDesignatorData.every(
            byte =>
                (byte >= 0x41 && byte <= 0x5a) || // A-Z
                (byte >= 0x61 && byte <= 0x7a) || // a-z
                (byte >= 0x30 && byte <= 0x39) || // 0..9
                byte === 0x2e || // "."
                byte === 0x2d, // "-"
        );
        if (isValidName) {
            return fileDesignatorData.reduce((name, byte) => name + String.fromCharCode(byte), "");
        } else {
            return `__hex__${Bytes.toHex(fileDesignatorData)}`;
        }
    }
}
