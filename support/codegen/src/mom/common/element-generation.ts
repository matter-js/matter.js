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
            const prefix = i ? "    " : "details: ";
            const suffix = i < lines.length - 1 ? " +" : "";
            lines[i] = `${prefix}${serialize(lines[i] === "" ? "\n" : lines[i])}${suffix}`;
        }
        const text = lines.join("\n");
        if (text) {
            target.atom(text);
        }
    }
}
