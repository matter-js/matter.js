/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#model";
import { camelize } from "../../util/string.js";
import { Words } from "../../util/words.js";
import { repairConformanceRule } from "./repairs/aspect-repairs.js";

/** String, trimmed with whitespace collapsed */
export const Str = (el: HTMLElement) => {
    // Remove footnote references.  We can reliably detect these by looking for spans that contain only a single digit
    for (const child of el.querySelectorAll("span")) {
        if (child.textContent?.match(/^[*0-9]$/)) {
            child.remove();
        }
    }

    // Except in some places in 1.2 and 1.3 where the malformatted columns confuse Adobe and it sticks footnotes in the
    // middle of a symbol.  This we have to go through some contortions to detect correctly
    for (const child of el.querySelectorAll("p")) {
        if (
            // P starts with text
            child.firstChild?.nodeType === 3 /** TEXT_CONTENT */ &&
            // Containing a single digit
            child.firstChild.textContent?.match(/^\d$/) &&
            // Followed by a span
            (child.firstChild.nextSibling as Element)?.tagName === "SPAN" &&
            // That doesn't indicate numeric arity
            !["st", "nd", "rd", "th"].includes(child.firstChild.nextSibling?.textContent as string)
        ) {
            child.firstChild?.remove();
        }
    }

    const text = el.textContent;
    if (!text) {
        return "";
    }

    return (
        text
            // Remove leading and trailing whitespace
            .trim()

            // Remove soft hyphen and any surrounding whitespace
            .replace(/\s*\u00ad\s*/g, "")

            // Remove zero-width non-joiner
            .replace(/\u200c/g, "")

            // Collapse whitespace
            .replace(/\s/g, " ")

            // Convert "foo- bar" to "foo-bar"
            .replace(/([a-z]-) ([a-z])/g, "$1$2")
    );
};

/**
 * String with special logic to handle common constraint bound 2**62 which is written with superscript.  When we have
 * constraint expression support we can change to 2**62 or something of the like but for now we just remove as this
 * effectively means "unbounded".
 *
 * Can also look for number<span>number</span> to generalize but unnecessary as of 1.3.
 */
export const ConstraintStr = (el: HTMLElement) => {
    const str = Code(el);

    switch (str) {
        case "-262 to 262":
            return "";

        case "0 to 262":
            return "min 0";

        case "max 262 - 1":
            return "";

        case "max (262 - 1)":
            return "";
    }

    if (str.indexOf("262") !== -1) {
        throw new Error(`Unrecognized constraint definition "${str}" apparently referencing 2**62`);
    }

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

/** String with no space at all */
export const NoSpace = (el: HTMLElement) => Str(el).replace(/\s/g, "");

/** Number parsed as integer */
export const Integer = (el: HTMLElement) => {
    const text = Str(el);

    // Ignore range descriptions
    if (text.match(/ (?:-|to) /)) {
        return NaN;
    }

    return Number.parseInt(NoSpace(el));
};

/** Size in bytes */
export const ByteSize = (el: HTMLElement): number | string | undefined => {
    const text = Str(el);

    let match = text.match(/^(\d+) bytes?$/);
    if (match) {
        return Number.parseInt(match[1]);
    }

    match = text.match(/^(\d+) or (\d+) bytes$/);
    if (match) {
        return `${match[1]}, ${match[2]}`;
    }

    match = text.match(/(\d+) to (\d+) bytes$/);
    if (match) {
        return `${match[1]} to ${match[2]}`;
    }
};

/** Number encoded as BIT(n) */
export const Bit = (el: HTMLElement) => {
    const text = Str(el).replace(/bit\((\d+)\)/i, "$1");
    return Number.parseInt(text);
};

/**
 * DSL or identifier.  Note we replace "Fo o" with "Foo" because space errors are very common in the PDFs, especially in
 * narrow columns and we don't want to end up with FoO
 */
export const Code = (el: HTMLElement) => {
    // Ensure textContent will produce space for P
    let shouldBeSpaced = false;
    for (let child = el.firstChild; child; child = child.nextSibling) {
        if (shouldBeSpaced) {
            el.insertBefore(el.ownerDocument.createTextNode(" "), child);
            shouldBeSpaced = false;
        }
        switch ((child as Element).tagName) {
            case "P":
                shouldBeSpaced = true;
                break;

            default:
                shouldBeSpaced = false;
        }
    }

    let str = Str(el);

    // Use the english dictionary to heuristically repair whitespace errors
    const parts = str.split(/\s+/);
    for (let i = 0; i < parts.length - 1; i++) {
        // If the current word is all uppercase, assume it's a standalone identifier
        if (parts[i].match(/^[A-Z_]+$/)) {
            continue;
        }

        // For all subsequent words that start with lowercase, see if they form an actual word when concatenated with
        // the previous word
        let beginning = parts[i].replace(/^.*([A-Z])/, "$1");
        for (let j = i + 1; j < parts.length; j++) {
            // Abort if next part does not appear to be a word segment
            if (!parts[j].match(/^[a-z]/)) {
                break;
            }

            // Get ending of word from next part
            const ending = parts[j].replace(/^([a-z]+).*/, "$1");

            // If the concatenation is a word, assume it should be joined
            if (Words.has(`${beginning}${ending}`.toLowerCase())) {
                // Join
                parts[i] += parts.splice(i + 1, j - i).join("");

                // Redo check from current point
                i--;
                break;
            }

            // Extend beginning for next iteration
            beginning += parts[j];
        }
    }
    str = parts.join(" ");

    return str;
};

/** Camelized identifier */
export const Identifier = (el: HTMLElement) => {
    // Remove any garbage following a blank line (following <br> tag)
    let child = el.firstElementChild;
    while (child && child?.firstElementChild?.tagName !== "BR") {
        child = child.nextElementSibling;
    }
    while (child) {
        const toRemove = child;

        child = child.nextElementSibling;
        toRemove.remove();
    }

    let str = Code(el);

    // Strip everything following a subset of characters known to be inside what is properly a "key"
    str = str.replace(/^([\w :.,/\-$]+).*/, "$1");

    return camelize(str, true);
};

/** Conformance definition */
export const ConformanceCode = (el: HTMLElement) => repairConformanceRule(Code(el));

/** Identifier, all lowercase.  Used for matching so "_" removed */
export const LowerIdentifier = (el: HTMLElement) => Identifier(el).toLowerCase();

/** Identifier, all uppercase.  Used for naming so "_" left in */
export const UpperIdentifier = (el: HTMLElement) => Code(el).toUpperCase();

/** Bits of the form "1", "1 - 2" or "1..2" into constraint definition */
export const Bits = (el: HTMLElement) => {
    const bits = Str(el)
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
