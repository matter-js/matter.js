/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, InternalError } from "#general";
import { AttributeElement, DatatypeElement, FieldElement, Metatype, ValueElement } from "#model";
import { ByteSize, Integer, Str } from "./html-translators.js";
import { repairTypeIdentifier } from "./repairs/type-repairs.js";
import { GlobalReference } from "./spec-types.js";
import {
    FieldRecord,
    selectMetatype,
    translateDatatype,
    translateFields,
    translateValueChildren,
} from "./translate-datatype.js";
import { Alias, Details, Optional, translateRecordsToMatter, translateTable } from "./translate-table.js";

let statusType: DatatypeElement | undefined;

/**
 * Converts global elements appearing in cluster specifications but not associated with a specific cluster.
 *
 * Most of these live in independent sections describing a single datatype except for the "global elements" list in the
 * core specification.
 */
export function* translateGlobal(ref: GlobalReference) {
    switch (ref.format) {
        case "datatypes":
            // Base and derived sections of the core "Data Types" chapter have a specialized table format
            yield* translateDatatypes(ref);
            break;

        case "elements":
            // Global attributes and fields are defined in a specialized table that is almost a normal field list
            yield* translateElements(ref);
            break;

        case "standalone":
            // Other global datatypes are just in a section of their own that matches the format of datatypes within
            // clusters
            const datatype = translateDatatype(ref);
            if (datatype?.type !== undefined) {
                yield datatype;
            }
            break;

        case "statusCodes":
            // Status codes exist in a dedicated table
            installstatusCodes(ref);
            break;

        default:
            throw new InternalError(`Unsupported datatype format ${ref.format}`);
    }
}

/**
 * This is the schema we use to parse "base data types" and "derived data types" in the core spec.
 */
const DatatypeSchema = {
    // We use the "long" name as description
    description: Alias(Str, "datatype"),

    // Name is an identifier but we want to capture the case so we do not use Identifier
    name: Alias(Str, "short"),

    // This is only present for the "derived type" table
    type: Optional(Alias(Str, "basetype")),

    // The ID seems to have no purpose.  We ignore it

    // Size may map to byteSize or conformance depending on format
    size: Optional(ByteSize),

    // A few of the structs define fields in the detail section
    children: Details(translateValueChildren),
};

/**
 * Extract basic datatypes from core spec.  We are not functional without these so this code is less lenient.
 */
function* translateDatatypes(ref: GlobalReference): Generator<DatatypeElement> {
    // Rename detail sections that do not match the name or description of the corresponding table entry
    if (ref.details) {
        for (const detail of ref.details) {
            switch (detail.name) {
                case "SemanticTagStruct Type":
                    detail.name = "semtag";
                    break;

                case "LocationDescriptorStruct":
                    detail.name = "locationdesc";
            }
        }
    }

    const records = translateTable("datatype", ref, DatatypeSchema);

    if (!records) {
        throw new InternalError(`No records from datatype section ${ref.name}`);
    }

    const datatypes = translateRecordsToMatter(
        "datatype",
        records,
        ({ name, description, type, size, children, details, xref }) => {
            if (type?.startsWith("same as ")) {
                return;
            }

            name = repairTypeIdentifier(name);
            type = repairTypeIdentifier(type);

            const element = DatatypeElement({
                name,
                description,
                type,
                details,
                xref,
                children,
                metatype: selectMetatype(name),
                isSeed: true,
            });

            switch (element.metatype) {
                case Metatype.integer:
                case Metatype.float:
                case Metatype.bitmap:
                    if (typeof size === "number") {
                        element.byteSize = size as ValueElement.ByteSize;
                    } else if (typeof size === "object") {
                        element.conformance = size;
                    }
                    break;
            }

            return element;
        },
    );

    if (!datatypes) {
        throw new InternalError(`No types from datatype section ${ref.name}`);
    }

    for (const datatype of datatypes) {
        // Actual status codes are defined far from the status enum.  Stash it so we can populate when we encounter the
        // codes
        if (datatype.name === "status") {
            statusType = datatype;
        }

        yield datatype;
    }
}

function* translateElements(ref: GlobalReference): Generator<AttributeElement | FieldElement> {
    // This is a standin for the actual element factory method that delegates to the appropriate element factory
    // based on the "element" field
    function globalTranslator(record: FieldRecord) {
        const { element } = record;
        delete record.element;

        if (element === "attribute") {
            return AttributeElement(record);
        } else if (element?.endsWith("field")) {
            return FieldElement(record);
        } else {
            throw new InternalError(`Global element type "${element}" requires additional mapping`);
        }
    }
    globalTranslator.Tag = "global";

    // This is a bit contorted in that we aren't actually translating fields but a list of field types...  But it
    // looks just like a list of fields with the exception of the additional "element" column that we processed
    // above.  So we can handle as we would fields of an actual struct-like element
    const elements = translateFields(globalTranslator, ref);

    if (elements === undefined) {
        throw new InternalError(`No global elements found in ${ref.name}`);
    }

    for (const element of elements) {
        element.isSeed = true;
        yield element;
    }
}

const StatusCodeSchema = {
    id: Alias(Integer, "statuscode"),

    // Name appears as "FOO_BAR" and any whitespace is a line wrap; should *not* be considered separate word
    name: Alias(el => camelize(Str(el).replace(/\s+/g, ""), true), "value"),

    description: Alias(Str, "summary"),
};

function installstatusCodes(ref: GlobalReference) {
    if (statusType === undefined) {
        throw new InternalError("Status codes encountered but status type was not");
    }

    // Remove obselete names from the "value" column
    const table = ref.tables?.[0];
    if (table) {
        for (const record of table.rows) {
            const name = record.value;
            if (name) {
                const paragraph = name.querySelector("p");
                while (paragraph?.nextSibling) {
                    paragraph.nextSibling.remove();
                }
            }
        }
    }

    const records = translateTable("status codes", ref, StatusCodeSchema).filter(r => r.name !== "Reserved");
    if (!records.length) {
        throw new InternalError("Status code translation failed");
    }

    // Remove obsolete names from the "summary" column
    for (const record of records) {
        record.description = record.description.replace(/\s*[A-Z_]+ is an ?obsolete.*$/, "");
    }

    statusType.children = translateRecordsToMatter("status codes", records, FieldElement);
}
