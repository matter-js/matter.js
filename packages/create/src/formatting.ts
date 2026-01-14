/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { stdout } from "node:process";

function formatter(on: number, off: number): (text: string) => string {
    if (!stdout.isTTY) {
        return text => text;
    }
    return text => `\u001b[${on}m${text}\u001b[${off}m`;
}

export const bold = formatter(1, 22);
export const dim = formatter(2, 22);
export const red = formatter(31, 39);
export const green = formatter(32, 39);
export const blue = formatter(34, 39);
export const yellow = formatter(33, 39);

export function visibleWidthOf(str: string) {
    let i = 0,
        length = 0;

    while (i < str.length) {
        if (str[i] === "\u001b") {
            i++;
            while (i < str.length && str[i] !== "m") {
                i++;
            }
            if (i === str.length) {
                break;
            }
        }

        if (isHighSurrogate(str, i)) {
            i++;
        }

        length++;
        i++;
    }

    return length;
}

export function fittedTextOf(text: string, width = stdout.columns) {
    if (typeof width !== "number" || width <= 20) {
        return text;
    }

    const lines = text.split("\n");
    const paragraphs = Array<string>();
    for (let line of lines) {
        const paddedLineMatch = line.match(/^(\s*)(.*)/);
        let padding;
        if (paddedLineMatch) {
            padding = paddedLineMatch[1];
            line = paddedLineMatch[2];
        } else {
            padding = "";
        }

        paragraphs.push(padding + wrap(line, width));
    }

    return paragraphs.join("\n");
}

function wrap(text: string, width: number) {
    const words = text.trim().split(/\s+/);
    let lineWidth = 0;
    let line = "";
    const lines = Array<string>();
    for (const word of words) {
        const wordWidth = visibleWidthOf(word);
        if (lineWidth && lineWidth + 1 + wordWidth >= width) {
            lines.push(line);
            line = word;
            lineWidth = wordWidth;
            continue;
        }

        if (lineWidth) {
            line += " ";
            lineWidth++;
        }

        line += word;
        lineWidth += wordWidth;
    }

    if (line !== "") {
        lines.push(line);
    }

    return lines.join("\n");
}

function isHighSurrogate(str: string, position: number) {
    const cp = str.charCodeAt(position);
    return cp >= 0xd800 && cp <= 0xdbff;
}
