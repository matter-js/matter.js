/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
    Bullet1 = "•",
    Bullet2 = "◦",
    Bullet3 = "▪",
    Bullet4 = "○",
    Bullet5 = "●",
    Bullet6 = "‣",
    Bullet7 = "⁃",
    Bullet8 = "◘",
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
    indentWidth: number;
    entries: (string | Block)[];
};

const Empty: Block = {
    kind: BlockKind.Simple,
    indentWidth: 0,
    entries: [],
};

/**
 * Detect block prefixes.  This is designed to handle scavenged, poorly formatted text so does not use indentation.  It
 * just focus on the prefix characters of the paragraph/line (which are the same thing as paragraphs do not include
 * newlines).
 */
function detectBlock(text: string, breadcrumb: Block[]) {
    const match = text.match(/^\s*(\S+)/);
    if (!match) {
        return;
    }

    const [, marker] = match;

    if (Bullets.includes(marker as BlockKind) || marker === BlockKind.Quote) {
        enterBlock(marker as BlockKind);
        return;
    }

    if (detectEnumeration(/^\d+\.$/, "1", BlockKind.Number)) return;
    if (detectEnumeration(/^[ivx]+\.$/, "i", BlockKind.LowerRoman)) return;
    if (detectEnumeration(/^[IVX]+\.$/, "I", BlockKind.UpperRoman)) return;
    if (detectEnumeration(/^[a-z]+\.$/, "a", BlockKind.LowerAlpha)) return;
    if (detectEnumeration(/^[A-Z]+\.$/, "A", BlockKind.UpperAlpha)) return;

    // Not in a block
    breadcrumb.length = 1;

    function enterBlock(kind: BlockKind) {
        // If we are already in block of this kind, ensure it is the deepest level
        const level = breadcrumb.findIndex(entry => entry.kind === kind);
        if (level !== -1) {
            breadcrumb.length = level + 1;
            return;
        }

        // Need to start a new block
        const block = {
            kind,
            indentWidth: (breadcrumb[breadcrumb.length - 1]?.indentWidth ?? 0) + kind === BlockKind.Quote ? 0 : 2,
            entries: [],
        };

        breadcrumb[breadcrumb.length - 1].entries.push(block);
        breadcrumb.push(block);
    }

    function detectEnumeration(test: RegExp, startsWith: string, kind: BlockKind) {
        if (!marker.match(test)) {
            return false;
        }

        // Only consider enumeration if a.) we are already in same type of enumeration, or b.) the marker is the first
        // element of the enumeration (e.g. "1." or "i.")
        if (!breadcrumb.find(block => block.kind === kind)) {
            if (marker !== `${startsWith}.`) {
                return false;
            }
        }

        enterBlock(kind);
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
    for (let i = 0; i < text.length; ) {
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
