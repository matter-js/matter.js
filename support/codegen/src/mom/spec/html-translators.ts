/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constraint } from "#model";
import { camelize } from "../../util/string.js";
import { repairConformanceRule } from "./repairs/aspect-repairs.js";

/** String, trimmed with whitespace collapsed */
export const Str = (el: HTMLElement) => {
    // Remove footnote references.  We can reliably detect these by looking for spans that contain only a single digit
    for (const child of el.querySelectorAll("span")) {
        if (child.textContent?.match(/^[*0-9]$/)) {
            child.remove();
        }
    }

    // Same for Asciidoctor footnote superscripts inside bold names (e.g. <strong>CurrentPositionLift<sup>1</sup></strong>).
    // Only remove when inside <strong> to avoid stripping real exponents like m<sup>3</sup>
    for (const child of el.querySelectorAll("strong > sup")) {
        const content = child.textContent?.trim();
        if (content?.match(/^[*0-9]$/)) {
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

/**
 * Convert numeric superscripts to ^N notation in an element (e.g. 10<sup>6</sup> → 10^6, m<sup>3</sup> → m^3).
 * Skips ordinals (st, nd, rd, th) and footnote markers.  Only use on prose/description elements, not on constraint
 * or type cells where ^ would break parsing.
 */
export function convertSuperscripts(el: HTMLElement) {
    for (const sup of el.querySelectorAll("sup")) {
        const content = sup.textContent?.trim();
        if (content?.match(/^-?\d+$/)) {
            sup.replaceWith(el.ownerDocument.createTextNode(`^${content}`));
        }
    }
}

/** String with superscript conversion — use for description/summary columns */
export const StrWithSuperscripts = (el: HTMLElement) => {
    convertSuperscripts(el);
    return Str(el);
};

/**
 * Constraint string with superscript conversion.  The constraint parser supports `^` as an exponentiation operator,
 * so 2^62 is passed through as a valid expression rather than being stripped.
 */
export const ConstraintStr = (el: HTMLElement) => {
    // Convert superscripts so 2<sup>62</sup> becomes "2^62" rather than "262"
    convertSuperscripts(el);
    const str = Code(el);

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

/** DSL or identifier */
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

    const str = Str(el);

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
