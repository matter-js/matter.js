/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormattedText, serialize } from "#general";
import { CrossReference } from "#model";
import { Block } from "#util/TsFile.js";

export function addProperties(target: Block, ...sets: Record<string, unknown>[]) {
    const serializedSets = sets.map(set =>
        Object.entries(set).map(
            ([k, v]) => `${k}: ${v instanceof CrossReference ? serialize(v.toString()) : serialize(v)}`,
        ),
    );

    for (const set of serializedSets) {
        // Segment properties into rows
        let row = Array<string>();
        let length = 0;
        for (const property of set) {
            length += property.length + (length ? 2 : 0);
            if (row.length && length >= 100) {
                target.atom(row.join(", "));
                row = [property];
                length = property.length;
            } else {
                row.push(property);
            }
        }
        if (row.length) {
            target.atom(row.join(", "));
        }
    }
}

export function addDetails(target: Block, element: { details?: string }) {
    if (element.details) {
        const lines = FormattedText(element.details, 100);
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Word-wrap continuation lines (non-empty lines after a non-empty line that don't start a new
            // list item or block) have a wrap indent that becomes extra whitespace when string-concatenated.
            // Strip the indent and add a trailing space to the preceding line for natural joining
            const listMarkerPattern = /^(?:[-•◦▪>]|\d+\.\s|[a-zA-Z]+\.\s)/;
            const isWrapContinuation =
                line && i > 0 && lines[i - 1] !== "" && !line.trimStart().match(listMarkerPattern);
            if (isWrapContinuation) {
                line = line.trimStart();
            }
            const isContinued =
                i < lines.length - 1 &&
                lines[i + 1] !== "" &&
                line !== "" &&
                !lines[i + 1].trimStart().match(listMarkerPattern);
            const serialized = line === "" ? "\n" : isContinued && !line.endsWith(" ") ? `${line} ` : line;

            const prefix = i ? "    " : "details: ";
            const suffix = i < lines.length - 1 ? " +" : "";
            lines[i] = `${prefix}${serialize(serialized)}${suffix}`;
        }
        const text = lines.join("\n");
        if (text) {
            target.atom(text);
        }
    }
}
