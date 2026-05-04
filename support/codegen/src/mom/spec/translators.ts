/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#model";
import { camelize } from "../../util/string.js";
import { repairConformanceRule } from "./repairs/aspect-repairs.js";

/** String, trimmed with whitespace collapsed */
export const Str = (text: string) => {
    return (
        text
            // Remove leading and trailing whitespace
            .trim()

            // Remove soft hyphen and any surrounding whitespace
            .replace(/\s*\u00ad\s*/g, "")

            // Remove zero-width characters (non-joiner, zero-width space)
            .replace(/[\u200b\u200c]/g, "")

            // Strip Asciidoctor inline stem/math delimiters (\$...\$)
            .replace(/\\\$/g, "")

            // Collapse whitespace
            .replace(/\s+/g, " ")

            // Convert "foo- bar" to "foo-bar"
            .replace(/([a-z]-) ([a-z])/g, "$1$2")
    );
};

/** String with superscript conversion — for markdown, ^N is already in the text */
export const StrWithSuperscripts = Str;

/**
 * Constraint string.  The constraint parser supports `^` as an exponentiation operator,
 * so 2^62 is passed through as a valid expression rather than being stripped.
 */
export const ConstraintStr = (text: string) => {
    const str = Str(text);

    // As of 1.4.1 the constraint column is so badly butchered we must resolve to concatenating any two words that are
    // side-by-side in a fashion that is illegal syntactically
    const match = str.match(/\S+/g);
    if (!match) {
        return str;
    }

    const parts = [...match];
    for (let i = 0; i < parts.length; ) {
        // Skip parts that may legally stand alone or do not end with an identifier
        const part = parts[i];
        if (!part.match(/[a-z_]+$/i) || Constraint.keywords.has(part.replace(/^.*[^a-z_]/i, ""))) {
            i++;
            continue;
        }

        // If the next part cannot legally appear after an identifier, concatenate parts
        const nextPart = parts[i + 1];
        if (nextPart?.match(/^[a-z_]+/i) && nextPart !== "in" && nextPart !== "to") {
            parts[i] += nextPart;
            parts.splice(i + 1, 1);
            continue;
        }

        i++;
        continue;
    }

    return parts.join(" ");
};

/** Compact identifier: strip Asciidoctor cross-reference prefixes and collapse to no whitespace */
export const CompactStr = (text: string) => {
    let str = Str(text);
    str = str.replace(/Section\s+[\d.]+,\s*[\u201c"]([\w-]+)[\u201d"]/g, "$1");
    return str.replace(/\s/g, "");
};

/** DSL or identifier — for markdown, equivalent to Str */
export const Code = Str;

/** Number parsed as integer */
export const Integer = (text: string) => {
    const str = Str(text);

    // Ignore range descriptions
    if (str.match(/ (?:-|to) /)) {
        return NaN;
    }

    return Number.parseInt(CompactStr(text));
};

/** Size in bytes */
export const ByteSize = (text: string): number | string | undefined => {
    const str = Str(text);

    let match = str.match(/^(\d+) bytes?$/);
    if (match) {
        return Number.parseInt(match[1]);
    }

    match = str.match(/^(\d+) or (\d+) bytes$/);
    if (match) {
        return `${match[1]}, ${match[2]}`;
    }

    match = str.match(/(\d+) to (\d+) bytes$/);
    if (match) {
        return `${match[1]} to ${match[2]}`;
    }
};

/** Number encoded as BIT(n) */
export const Bit = (text: string) => {
    const str = Str(text).replace(/bit\((\d+)\)/i, "$1");
    return Number.parseInt(str);
};

/** Camelized identifier */
export const Identifier = (text: string) => {
    let str = Str(text);

    // Strip everything following a subset of characters known to be inside what is properly a "key"
    str = str.replace(/^([\w :.,/\-$]+).*/, "$1");

    return camelize(str, true);
};

/** Conformance definition */
export const ConformanceCode = (text: string) => repairConformanceRule(Str(text));

/** Identifier, all lowercase.  Used for matching so "_" removed */
export const LowerIdentifier = (text: string) => Identifier(text).toLowerCase();

/** Identifier, all uppercase.  Used for naming so "_" left in */
export const UpperIdentifier = (text: string) => Str(text).toUpperCase();

/** Bits of the form "1", "1 - 2" or "1..2" into constraint definition */
export const Bits = (text: string) => {
    const bits = Str(text)
        .split(/\s*(?:\.\.|-|–)\s*/)
        .map(b => Number.parseInt(b));
    if (bits.findIndex(Number.isNaN) !== -1) {
        return;
    }
    if (bits.length == 1) {
        return bits[0];
    }
    if (bits.length == 2) {
        let [min, max] = bits;
        if (min > max) {
            const tmp = max;
            max = min;
            min = tmp;
        }
        return { min, max };
    }
};
