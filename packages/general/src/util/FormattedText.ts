/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const INDENT = "  ";

export { describeList } from "./String.js";

/**
 * Performs word wrap.  Input is assumed to be a series of paragraphs separated by a newline.  Output is an array of
 * formatted lines.
 *
 * Contains specialized support for lists, ESDoc directives and ANSI escape codes.
 */
export function FormattedText(text: string, width = 120) {
    const structure = detectStructure(text);
    return formatBlock(structure, width);
}

/**
 * Types of things we consider "blocks".  Most blocks are lists but we also support markdown-style quotes prefixed with
 * ">".
 */
export enum BlockKind {
    Simple = "simple",
    Bullet1 = "-",
    Bullet2 = "•",
    Bullet3 = "◦",
    Bullet4 = "▪",
    Bullet5 = "○",
    Bullet6 = "●",
    Bullet7 = "‣",
    Bullet8 = "⁃",
    Quote = ">",
    Number = "number",
    LowerAlpha = "alpha",
    UpperAlpha = "ALPHA",
    LowerRoman = "roman",
    UpperRoman = "ROMAN",
}

export const Bullets = Object.entries(BlockKind)
    .filter(([key]) => key.startsWith("Bullet"))
    .map(([, value]) => value);

const enumTest = "(?:\\d+|[ivx]+|[a-z])\\.";
const listItemTest = new RegExp(`^(?:[${Bullets.join("")}]|${enumTest})\\s`, "i");

export function looksLikeListItem(text: string) {
    return !!listItemTest.exec(text);
}

type Block = {
    kind: BlockKind;
    sourceIndent?: number;
    entries: (string | Block)[];
};

const Empty: Block = {
    kind: BlockKind.Simple,
    entries: [],
};

/**
 * Detect block prefixes.
 *
 * A list item nests by its indent: it closes every open list deeper than itself, continues a list of its own kind at
 * its own indent, and otherwise opens a list inside the innermost one left open.  At equal indent, as in unindented
 * text, a different marker therefore nests and a repeated marker continues its list.  A quote spans only the lines
 * that carry its marker.
 */
function detectBlock(text: string, breadcrumb: Block[]) {
    const match = text.match(/^(\s*)(\S+)/);
    if (!match) {
        return;
    }

    const [, leadingSpace, marker] = match;
    const indent = leadingSpace.length;

    if (marker === BlockKind.Quote) {
        enterQuote();
        return;
    }

    if (Bullets.includes(marker as BlockKind)) {
        enterList(marker as BlockKind);
        return;
    }

    if (detectEnumeration(/^\d+\.$/, "1", BlockKind.Number)) return;
    if (detectEnumeration(/^[ivx]+\.$/, "i", BlockKind.LowerRoman)) return;
    if (detectEnumeration(/^[IVX]+\.$/, "I", BlockKind.UpperRoman)) return;
    if (detectEnumeration(/^[a-z]+\.$/, "a", BlockKind.LowerAlpha)) return;
    if (detectEnumeration(/^[A-Z]+\.$/, "A", BlockKind.UpperAlpha)) return;

    // Not in a block
    breadcrumb.length = 1;

    function enterQuote() {
        const level = breadcrumb.findIndex(entry => entry.kind === BlockKind.Quote);
        if (level !== -1) {
            breadcrumb.length = level + 1;
            return;
        }
        openBlock(BlockKind.Quote);
    }

    function enterList(kind: BlockKind) {
        const { enclosing, continued } = listLevel(kind);
        if (continued !== undefined) {
            breadcrumb.length = continued + 1;
            return;
        }

        breadcrumb.length = enclosing + 1;
        openBlock(kind);
    }

    /**
     * The innermost open block no deeper than the item, and the list of the item's kind at its indent, if one is open.
     */
    function listLevel(kind: BlockKind) {
        let enclosing = breadcrumb.length - 1;
        while (
            enclosing > 0 &&
            (breadcrumb[enclosing].kind === BlockKind.Quote || (breadcrumb[enclosing].sourceIndent ?? 0) > indent)
        ) {
            enclosing--;
        }

        for (let i = enclosing; i > 0 && (breadcrumb[i].sourceIndent ?? 0) === indent; i--) {
            if (breadcrumb[i].kind === kind) {
                return { enclosing, continued: i };
            }
        }

        return { enclosing, continued: undefined };
    }

    function openBlock(kind: BlockKind) {
        const block: Block = {
            kind,
            sourceIndent: indent,
            entries: [],
        };

        breadcrumb[breadcrumb.length - 1].entries.push(block);
        breadcrumb.push(block);
    }

    function detectEnumeration(test: RegExp, startsWith: string, kind: BlockKind) {
        if (!marker.match(test)) {
            return false;
        }

        // A marker is an enumeration if a list of its kind is open, whatever the indent, or if it is the list's first
        // value (e.g. "1." or "i.")
        if (!breadcrumb.some(block => block.kind === kind) && marker !== `${startsWith}.`) {
            return false;
        }

        enterList(kind);
        return true;
    }
}

/**
 * Builds a block structure by detecting lists and/or quoted sections.
 */
function detectStructure(text: string): Block {
    const lines = text.split(/\n+/).map(line => line.trimEnd());
    if (!lines.some(p => p)) {
        return Empty;
    }

    const breadcrumb: Block[] = [{ ...Empty, entries: [] }];

    for (const line of lines) {
        detectBlock(line, breadcrumb);
        breadcrumb[breadcrumb.length - 1].entries.push(line.trim().replace(/\s+/g, " "));
    }

    return breadcrumb[0];
}

function wrapParagraph(input: string, into: string[], wrapWidth: number, initialPrefix: string, wrapPrefix: string) {
    const prefixWidth = visibleWidthOf(initialPrefix);
    const segments = input.split(/\s+/);
    if (!segments) {
        return;
    }

    // Reassemble text surrounded by "{@" and "}" as this is likely an ESDoc directive and ESDoc doesn't like directives
    // wrapped
    for (let i = 0; i < segments?.length; i++) {
        if (!segments[i].includes("{@")) {
            continue;
        }
        for (let j = i; j < segments.length; j++) {
            if (segments[j].includes("}")) {
                segments.splice(i, j - i + 1, segments.slice(i, j + 1).join(" "));
                break;
            }
        }
    }

    // Wrapping setup.  Track the portions of the line and current length
    const line = [initialPrefix];
    let width = prefixWidth;

    // Perform actual wrapping
    let pushedOne = false;
    for (const s of segments) {
        const segmentWidth = visibleWidthOf(s);

        // If we'll extend too far, start on a new line
        if (width && width + segmentWidth > wrapWidth) {
            addLine();
            line.length = 0;
            width = prefixWidth;
        }

        // Add wrap prefix if this is a new line
        if (!line.length) {
            line.push(wrapPrefix);
            width = prefixWidth;
        }

        // Add to the line
        line.push(s);
        line.push(" ");
        width += segmentWidth + 1;
    }

    // If there is a remaining line, add it
    line.length = line.length - 1; // Remove ending space
    if (line.length) {
        addLine();
    }

    function addLine() {
        if (!pushedOne) {
            if (into.length) {
                into.push("");
            }
            pushedOne = true;
        }

        into.push(line.join(""));
    }
}

function separatePrefixFromContent(text: string) {
    const match = text.match(/^(\S+\s)\s*(\S.*$)/);
    if (match) {
        return { prefix: match[1], text: match[2] };
    }
    return { prefix: "", text };
}

function formatBlock(block: Block, width: number) {
    const lines = Array<string>();

    function formatLevel(block: Block, parentPrefix: string) {
        for (const entry of block.entries) {
            if (typeof entry === "string") {
                let prefix, text;
                if (block.kind === BlockKind.Simple) {
                    prefix = "";
                    text = entry;
                } else {
                    ({ prefix, text } = separatePrefixFromContent(entry));
                }

                wrapParagraph(
                    text,
                    lines,
                    width,
                    parentPrefix + prefix,
                    parentPrefix + " ".repeat(visibleWidthOf(prefix)),
                );
            } else {
                let childPrefix = parentPrefix;
                if (entry.kind !== BlockKind.Quote || parentPrefix !== "") {
                    childPrefix += INDENT;
                }
                formatLevel(entry, childPrefix);
            }
        }
    }

    formatLevel(block, "");

    return lines;
}

function visibleWidthOf(text: string) {
    let length = 0;
    for (let i = 0; i < text.length;) {
        switch (text[i]) {
            case `\u001b`:
                // Escape
                i++;
                const code = text[i];

                if ((code >= "@" && code <= "Z") || code === "-" || code === "_") {
                    // Fe except CSI (control sequence introducer)
                    i++;
                    break;
                }

                if (code === "[") {
                    // CSI
                    i++;
                    while (text[i] >= "0" && text[i] <= "?") {
                        // Parameter
                        i++;
                    }
                    while (text[i] >= " " && text[i] <= "/") {
                        // Intermediate
                        i++;
                    }
                    if (text[i] >= "@" && text[i] <= "~") {
                        // Final
                        i++;
                        break;
                    }
                }

                break;

            case `\u200b`:
                // Zero-width space
                i++;
                break;

            default:
                i++;
                length++;
                break;
        }
    }
    return length;
}
