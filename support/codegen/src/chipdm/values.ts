/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "#model";

/** Placeholders CHIP writes where the specification defines no concrete value */
const UNSPECIFIED = new Set(["ms", "desc", "empty"]);

/**
 * Translate the textual value of a CHIP data model attribute into a {@link FieldValue}.
 *
 * Anything that is not a literal becomes a reference; the comparator normalizes references case-insensitively because
 * CHIP and our specification scrape disagree on capitalization.
 */
export function translateValue(text: string): FieldValue {
    switch (text) {
        case "null":
            return null;
        case "true":
            return true;
        case "false":
            return false;
    }

    if (/^[+-]?(\d+(\.\d+)?|0x[\da-f]+|0b[01]+)$/i.test(text)) {
        return Number(text);
    }

    return FieldValue.Reference(text);
}

/**
 * Reduce a value to the form used for comparison.
 *
 * CHIP and our model differ in capitalization of references and in numeric radix, neither of which is a semantic
 * difference.  Values CHIP cannot express ("MS" for manufacturer specific, "desc" for prose) compare as absent.
 */
export function canonicalizeValue(value: FieldValue | undefined) {
    if (value === undefined) {
        return;
    }

    if (value === null) {
        return "null";
    }

    if (typeof value === "number" || typeof value === "bigint") {
        return value.toString();
    }

    const text = FieldValue.serialize(value).trim().toLowerCase();
    const canonical = text.replace(/[^a-z\d.+-]/g, "");

    if (canonical === "" || UNSPECIFIED.has(canonical)) {
        return;
    }

    return canonical;
}
