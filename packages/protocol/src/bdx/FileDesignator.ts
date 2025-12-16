/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Diagnostic, ImplementationError } from "#general";
import { NodeId } from "#types";

/**
 * Class to represent a File designator from Matter.
 * Specification wise this is a bytes object, but to store in a storage we need a string name.
 * This class provides a way to convert between the two.
 */
export class FileDesignator {
    #fd: Bytes;

    /**
     * Initialize a FileDesignator from a BDX URI string. Also returns the source node ID of the owner of the file.
     */
    static fromBdxUri(uri: string) {
        const bdxParts = uri.match(/^bdx:\/\/([0-9A-F]{16})\/(\S+)$/);
        if (!bdxParts) {
            throw new ImplementationError(`Invalid OTA URI "${uri}"`);
        }
        return {
            fileDesignator: new FileDesignator(bdxParts[2]),
            sourceNodeId: NodeId(BigInt(`0x${bdxParts[1]}`)),
        };
    }

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
                byte === 0x2d || // "-"
                byte === 0x5f || // "_"
                byte === 0x2f, // "/"
        );
        if (isValidName) {
            return fileDesignatorData.reduce((name, byte) => name + String.fromCharCode(byte), "");
        } else {
            return `0x${Bytes.toHex(fileDesignatorData)}`;
        }
    }

    /**
     * Return the FileDesignator as a BDX URI string. The source node ID of the owner of the file is required to
     * generate a valid URI.
     */
    asBdxUri(sourceNode: NodeId) {
        return `bdx://${NodeId.toHexString(sourceNode)}/${this.text}`;
    }

    get [Diagnostic.value](): string {
        return this.text;
    }
}
