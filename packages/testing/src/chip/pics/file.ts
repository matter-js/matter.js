/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PicsValues } from "./values.js";

/**
 * In-memory Matter PICS file.
 *
 * Supports extended syntax for defining ranges of values of the form "NAMExx..yy=*" where xx and yy are hexadecimal
 * numbers specifying the start and end of a range (inclusive).  These are expanded in {@link patch} which modifies the
 * values in the target PICS file with values from another PICS file.
 *
 * Note that we sometimes use ".properties" extension for PICS files so we get syntax highlighting, but PICS only
 * supports a subset of the actual Java properties file format.
 */
export class PicsFile {
    #lines: string[];
    #values?: PicsValues;

    constructor(lines?: string | string[]) {
        if (typeof lines === "string") {
            this.#lines = lines.split("\n").map(l => l.trim());
        } else {
            this.#lines = lines ?? [];
        }
    }

    get lines() {
        return this.#lines;
    }

    get values() {
        if (!this.#values) {
            const values = {} as PicsValues;
            for (const line of this.lines) {
                parseLine(line, values);
            }
            this.#values = values;
        }
        return this.#values;
    }

    toString() {
        return this.#lines.join("\n") + "\n";
    }

    patch(other: PicsFile) {
        const newValues = { ...other.values };

        const newLines = new Array<string>();
        for (const line of this.lines) {
            const lineValues = {} as PicsValues;
            if (!parseLine(line, lineValues)) {
                newLines.push(line);
                continue;
            }

            for (const key in lineValues) {
                const newValue = newValues[key];
                if (newValue !== undefined) {
                    newLines.push(`${key}=${newValue}`);
                    delete newValues[key];
                } else {
                    newLines.push(`${key}=${lineValues[key]}`);
                }
            }
        }

        for (const key in newValues) {
            newLines.push(`${key}=${newValues[key]}`);
        }

        this.#values = undefined;
        this.#lines = newLines;
    }
}

export namespace PicsFile {
    export interface Values {
        [key: string]: 0 | 1;
    }
}

function parseLine(line: string, values: PicsValues): boolean {
    line = line.trim();
    if (line.startsWith("#")) {
        return false;
    }

    const valueMatch = line.match(/^([^=\s]+)=(.*)$/);
    if (!valueMatch) {
        return false;
    }

    const [, key, valueStr] = valueMatch;
    let value: 0 | 1;
    switch (valueStr) {
        case "0":
            value = 0;
            break;

        case "1":
            value = 1;
            break;

        default:
            return false;
    }

    const rangeMatch = key.match(/^(\S+)\.\.([\da-f]+)$/i);
    if (!rangeMatch) {
        values[key] = value;
        return true;
    }

    const [, base, rangeTo] = rangeMatch;
    const rangePrefix = base.slice(0, base.length - rangeTo.length);
    const rangeFrom = base.slice(rangePrefix.length);

    const rangeFromNum = Number.parseInt(rangeFrom, 16);
    if (!Number.isFinite(rangeFromNum)) {
        throw new Error(`Invalid PICS: Range start in ${key} is invalid`);
    }

    const rangeToNum = Number.parseInt(rangeTo, 16);
    if (!Number.isFinite(rangeToNum)) {
        throw new Error(`Invalid PICS: Range end in ${key} is invalid`);
    }

    if (rangeToNum < rangeFromNum) {
        throw new Error(`Invalid PICS: Range end ${rangeToNum} is greater than range start ${rangeFromNum}`);
    }

    for (let i = rangeFromNum; i <= rangeToNum; i++) {
        values[rangePrefix + i.toString().padStart(rangeTo.length, "0")] = value;
    }

    return true;
}
