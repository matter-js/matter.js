/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Model } from "#model";
import { Block } from "../../util/TsFile.js";
import { camelize, serialize } from "../../util/string.js";
import { addDetails, addProperties } from "./element-generation.js";

export function generateElement({
    target,
    importFrom,
    element,
    prefix = "",
    suffix = "",
    operational = true,
}: {
    target: Block;
    importFrom: string;
    element: Model;
    prefix?: string;
    suffix?: string;
    operational?: boolean;
}) {
    const factory = camelize(element.tag, true);
    target.file.addImport(importFrom, `${factory}Element as ${factory}`);
    const expr = target.expressions(`${prefix}${factory}(`, `)${suffix}`);
    const head = expr.expressions("{", "}");

    const fields = Object.fromEntries(
        Object.entries(element.toElement(operational))
            .filter(([k, v]) => {
                switch (k) {
                    // We handle these separately
                    case "id":
                    case "name":
                    case "type":
                    case "tag":
                    case "children":
                    case "details":
                        return false;

                    // We either unroll these into individual fields or serialize separately
                    case "resources":
                        return false;

                    // These are (currently) only used by codegen
                    case "matchTo":
                    case "asOf":
                    case "until":
                        return false;

                    default:
                        return v !== undefined && v !== "";
                }
            })
            .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" })),
    );

    // First, name/ID/type
    const start: Record<string, unknown> = { name: element.name };
    delete fields.name;
    if (element.id !== undefined) {
        const idStr = element.id < 0 ? element : serialize.asIs(`0x${element.id.toString(16)}`);
        start.id = idStr;
    }
    if (element.type) {
        start.type = (element as any).type;
    }

    addProperties(head, { ...start, ...fields });

    // Details and cross-references
    if (!operational) {
        addDetails(head, element);
    }

    // Children
    if (element.children?.length) {
        for (const child of element.children) {
            generateElement({ target: expr, importFrom, element: child, operational });
        }
    }
}
