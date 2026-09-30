/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormattedText } from "#general";
import { CrossReference } from "#model";
import { serialize } from "#util/string.js";
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
        const formatted = FormattedText(element.details, 100);
        const lines = formatted.map((formattedLine, i) => {
            let line = formattedLine;

            // FormattedText separates entries with an empty line, so a non-empty line after a non-empty line continues
            // a wrapped entry.  Its wrap indent would become extra whitespace when string-concatenated, so strip the
            // indent and add a trailing space to the preceding line for natural joining
            if (line && i > 0 && formatted[i - 1] !== "") {
                line = line.trimStart();
            }
            const isContinued = i < formatted.length - 1 && formatted[i + 1] !== "" && line !== "";
            const serialized = line === "" ? "\n" : isContinued && !line.endsWith(" ") ? `${line} ` : line;

            const prefix = i ? "    " : "details: ";
            const suffix = i < formatted.length - 1 ? " +" : "";
            return `${prefix}${serialize(serialized)}${suffix}`;
        });
        const text = lines.join("\n");
        if (text) {
            target.atom(text);
        }
    }
}
