/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { AnyElement, DatatypeElement, FabricIndex, FieldElement, Metatype } from "#model";
import { addDocumentation } from "./add-documentation.js";
import {
    Bits,
    ConformanceCode,
    ConstraintStr,
    Identifier,
    Integer,
    LowerIdentifier,
    NoSpace,
    Str,
} from "./html-translators.js";
import { repairConstraint } from "./repairs/aspect-repairs.js";
import { repairDefaultValue } from "./repairs/default-value-repairs.js";
import { repairType, repairTypeIdentifier } from "./repairs/type-repairs.js";
import { HtmlReference } from "./spec-types.js";
import {
    Alias,
    chooseIdentityAliases,
    Details,
    Optional,
    TableRecord,
    translateRecordsToMatter,
    translateTable,
} from "./translate-table.js";

const logger = Logger.get("translate-cluster");

/**
 * Translate the HTML description of a datatype into a DatatypeElement.
 */
export function translateDatatype(definition: HtmlReference): DatatypeElement | undefined {
    let name = repairTypeIdentifier(definition.name);

    const text = definition.prose?.[0] ? Str(definition.prose?.[0]) : undefined;

    // Up through 1.1 prose was informal but remarkably consistent; "derived from" always matches
    let match = text?.match(/derived from ([\w-]+)/i);

    // This now applies to cluster 1.2 § 1.14.15.1, because consistency is overrated
    if (!match) {
        match = text?.match(/data type shall be a ([\w-]+)/i);
    }

    // Applies to a handful of overrides of ModeOptionStruct in cluster 1.2
    if (!match) {
        match = text?.match(/lists the changes relative to the [\w\- ]+ cluster for the fields of the ([\w-]+) type/i);
    }

    // And 1.3 throws in this beaut
    let constraint: string | undefined;
    if (!match) {
        match = text?.match(/This data type is an? ([\w-]+) of fixed length (\d+)/i);
        constraint = match?.[2];
    }

    let type = match?.[1];

    let description: string | undefined;

    type = repairTypeIdentifier(type);

    if (name.match(/enum$/i) || type?.match(/^enum/i)) {
        if (name === "StatusCodeEnum") {
            type = "enum8";
        }

        if (!type) {
            logger.warn(`no base detected, guessing enum8`);
            type = "enum8";
        }
    } else if (name.match(/bits$/i) || name.match(/bitmap$/i) || type?.match(/^map/i)) {
        if (!type) {
            logger.warn(`no base detected, guessing map8`);
            type = "map8";
        } else if (type.match(/^bitmap/)) {
            type = type.slice(3);
        }
    } else if (name.match(/struct$/i) || type === "struct" || definition.tables?.[0].rows[0].type) {
        if (!type) {
            type = "struct";
        }
    } else if (name.match(/status$/i)) {
        if (!type) {
            type = "status";
        }
    } else {
        match = name.match(/(.+) \((\S+) type\)/i);
        if (match) {
            description = match[1];
            name = match[2];
        }
    }

    if (!type && name.match(/\s/)) {
        // This isn't actually a datatype
        if (!text) {
            logger.warn(`${definition.xref.document} § ${definition.xref.section} does not appear to be a datatype`);
        }
        return;
    }

    const datatype = DatatypeElement({
        type: type,
        name: name.replace(/\s+/g, ""),
        description,
        constraint,
        xref: definition.xref,
    });

    datatype.children = translateValueChildren("field", datatype, definition);
    addDocumentation(datatype, definition);

    return datatype;
}

function hasColumn(definition: HtmlReference, ...names: string[]) {
    for (const name of names) {
        if (definition.tables?.[0].rows[0]?.[name] !== undefined) {
            return true;
        }
    }
    return false;
}

const FieldSchema = {
    id: Integer,
    name: Alias(Identifier, "field"),

    // Not really optional but we want to process rows even if missing
    type: Optional(NoSpace),

    constraint: Optional(ConstraintStr),
    quality: Optional(Str),
    default: Optional(Alias(NoSpace, "fallback")),
    access: Optional(Str),
    conformance: Optional(ConformanceCode),
    children: Details(translateValueChildren),

    // This only applies to the "global elements" table in the core spec
    element: Optional(LowerIdentifier),
};
export type FieldRecord = TableRecord<typeof FieldSchema>;

/**
 * Translate fields of any struct-like element into instances of that element.
 */
export function translateFields<T extends AnyElement.Type<FieldRecord>>(
    type: T,
    fields?: HtmlReference,
    withAccessNotes = true,
): ReturnType<T>[] | undefined {
    let records = translateTable(type.Tag, fields, FieldSchema);

    records = records.filter(r => {
        repairType(r);
        repairConstraint(r);
        repairDefaultValue(r);

        return true;
    });

    if (withAccessNotes) {
        applyAccessModifier(fields, records);
    }

    return translateRecordsToMatter(type.Tag, records, type) as ReturnType<T>[] | undefined;
}

/**
 * Translate children of enums, bitmaps, structs, commands, attributes and events.  If "parent" is none of these,
 * returns undefined.
 */
export function translateValueChildren(
    tag: string,
    parent: undefined | { type?: string },
    definition: HtmlReference,
): FieldElement[] | undefined {
    let type = parent?.type;
    if (type === undefined) {
        switch (tag) {
            case "command":
            case "event":
                type = "struct";
                break;

            default:
                return;
        }
    }

    const metatype = selectMetatype(type);

    switch (metatype) {
        case Metatype.enum: {
            // Column names are all over the place so examine the table to find a "name" column.
            //
            // Originally mapped manually and had identified the following:
            //
            //     "type", "description", "statuscode", "presentation", "endproducttype", "effect"
            //
            // Turns out after this conversion we already had them all but leaving this logic in as it's more general
            // and will adapt better in the future
            const { ids, names } = chooseIdentityAliases(
                definition,
                ["id", "value", "enum"],
                ["name", "type", "statuscode", "priority", "description"],
            );

            let records = translateTable("value", definition, {
                id: Alias(Integer, ...ids),
                name: Alias(Identifier, ...names),
                conformance: Optional(ConformanceCode),
                description: Optional(Alias(Str, "summary", "notes")),
                meaning: Optional(Str),
            });

            records = records.filter(r => r.name !== "Reserved");

            return translateRecordsToMatter("value", records, FieldElement);
        }

        case Metatype.bitmap: {
            if (hasColumn(definition, "meaning")) {
                // Window covering cluster just plain made up their own format. We extract bits, description and
                // conformance but just leave a placeholder for the name
                const records = translateTable("bit", definition, {
                    bit: Bits,
                    description: Str,
                    conformance: Optional(Alias(Str, "M")),
                });

                return translateRecordsToMatter("wc bit", records, r => {
                    const constraint = r.bit;
                    let name;
                    if (typeof constraint === "number") {
                        name = `Bit${constraint}`;
                    } else if (typeof constraint === "object") {
                        name = `Bits${constraint.min}To${constraint.max - 1}`;
                    }
                    if (name) {
                        return FieldElement({
                            name,
                            constraint,
                            description: r.description,
                            conformance: r.conformance,
                        });
                    }
                });
            }

            // Standard(ish) bitmap table
            //
            // Previously had identified aliases as "mappedprotocol", "statebit", "function", "relatedattribute" but
            // this was only a partial list.  Auto-detection makes more sense
            const { ids, names } = chooseIdentityAliases(definition, ["bit", "id"], ["name", "eventdescription"]);
            const records = translateTable("bit", definition, {
                constraint: Alias(Bits, ...ids),
                name: Alias(Identifier, ...names),
                description: Optional(Alias(Str, "summary")),
            });

            return translateRecordsToMatter("bit", records, FieldElement);
        }

        case Metatype.object:
            return translateFields(FieldElement, definition, parent?.type !== "event");
    }
}

export function accessModifierOf(details?: HtmlReference) {
    if (!details?.tables?.[0].notes.length) {
        return;
    }

    // Determine what the access flag should be
    let flag: string | undefined;
    for (const n of details.tables[0].notes) {
        const match = n.textContent?.match(/access (?:quality|modifier): fabric[\s-](\w+)/i);
        if (match) {
            const quality = match[1].toLowerCase();

            switch (quality) {
                case "scoped":
                    flag = "F";
                    break;

                case "sensitive":
                    flag = "S";
                    break;

                default:
                    logger.warn(`ignoring unrecognized fabric access quality ${quality}`);
            }

            if (flag) {
                return flag;
            }
        }
    }
}

// For some reason, "default" fabric access appears in an informational row instead of the access column in many of the
// core definitions.  Fix this.
//
// We also use the presence of this record to add the implicit FabrixIndex field
function applyAccessModifier(
    fields?: HtmlReference,
    records?: { id: number; name?: string; type?: string; access?: string; conformance?: string }[],
) {
    if (!records) {
        return;
    }

    const flag = accessModifierOf(fields);
    if (!flag) {
        return;
    }

    // Update access for each record unless it already has a fabric flag
    let haveFabricIndex = false;
    for (const r of records) {
        if (r.id === FabricIndex.id) {
            haveFabricIndex = true;
        }
        const access = r.access;
        if (!access) {
            r.access = flag;
        } else if (!access.match(/[SF]/i)) {
            r.access += flag;
        }
    }

    // Add the FabricIndex field if not already present
    if (!haveFabricIndex) {
        records.push({
            id: FabricIndex.id as number,
            name: FabricIndex.name,
            type: "FabricIndex",
        });
    }
}

/**
 * Determine the metatype for a global datatype.
 */
export function selectMetatype(typeName: string) {
    switch (typeName) {
        case "bool":
            return Metatype.boolean;

        case "octstr":
            return Metatype.bytes;

        case "string":
            return Metatype.string;

        case "list":
            return Metatype.array;

        case "struct":
            return Metatype.object;

        case "single":
        case "double":
            return Metatype.float;

        case "date":
            return Metatype.date;

        case "duration":
            return Metatype.duration;

        case "status":
            return Metatype.enum;
    }

    if (typeName.startsWith("uint")) {
        return Metatype.integer;
    }

    if (typeName.startsWith("int")) {
        return Metatype.integer;
    }

    if (typeName.startsWith("map")) {
        return Metatype.bitmap;
    }

    if (typeName.startsWith("enum")) {
        return Metatype.enum;
    }
}
