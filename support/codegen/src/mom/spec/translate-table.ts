/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, camelize, isObject } from "#general";
import { AnyElement, Specification } from "#model";
import { addDocumentation } from "./add-documentation.js";
import { Str } from "./html-translators.js";
import { HtmlReference, Table } from "./spec-types.js";

const logger = Logger.get("translate-table");

/** Generic type of table cell "translators" such as those in html-translators */
type Translator<T> = (el: HTMLElement) => T;

/** Modifier that allows a value to be undefined */
type Optional<T> = { option: "optional"; wrapped: Alias<T> | Translator<T> };
export const Optional = <T>(wrapped: Alias<T> | Translator<T>): Optional<T> => ({ option: "optional", wrapped });

/** Modifier that maps one or more columns to a canonical name */
type Alias<T> = { option: "alias"; sources: string[]; wrapped: Translator<T> };
export const Alias = <T>(wrapped: Translator<T>, ...sources: string[]): Alias<T> => ({
    option: "alias",
    sources,
    wrapped,
});

/** Injects a column with a fixed value */
type Constant<T> = { option: "constant"; value: T };
export const Constant = <T>(value: T): Constant<T> => ({ option: "constant", value });

/** Process detail section associated with table record */
type DetailTranslator = (tag: string, parentRecord: Record<string, unknown>, definition: HtmlReference) => unknown;
type Details<T extends DetailTranslator> = { option: "details"; translator: T };
export const Details = <const T extends DetailTranslator>(translator: T): Details<T> => ({
    option: "details",
    translator,
});

/**
 * A simple schema format.
 *
 * This is a little fancy for an ugly scraping tool but accuracy and repeatability is the goal.
 */
type TableSchema = Record<string, unknown>;

type FieldType<F> =
    F extends Optional<infer W>
        ? W | undefined
        : F extends Alias<infer W> | Translator<infer W> | Constant<infer W>
          ? W
          : F extends Details<infer T>
            ? ReturnType<T>
            : never;

// Create TS object type from schema definition
export type TableRecord<T extends TableSchema> = {
    [name in keyof T]: FieldType<T[name]>;
} & { xref?: Specification.CrossReference; name?: string; details?: string };

const has = (object: object, name: string) => !!Object.getOwnPropertyDescriptor(object, name);

/**
 * Translates records from an HtmlRef table to typed TS objects.
 */
export function translateTable<T extends TableSchema>(
    tag: string,
    definition: HtmlReference | undefined,
    schema: T,
    table?: Table,
): Array<TableRecord<T>> {
    if (!definition) {
        return [];
    }

    if (!table) {
        table = definition.tables?.[0];
    }
    if (!table) {
        logger.warn(`no ${tag} table § ${definition.xref.section}`);
        return [];
    }

    const missing = new Set<string>();
    const result = Array<TableRecord<T>>();

    const aliases = Array<[string, string]>();
    const optional = new Set<string>();
    const translators = Array<[string, Translator<any> | string | number]>();
    let detailTranslators: Record<string, DetailTranslator> | undefined;

    nextField: for (const kv of Object.entries(schema)) {
        const [k] = kv;

        let [, v] = kv;
        while (isObject(v)) {
            switch (v.option) {
                case "optional":
                    optional.add(k);
                    v = v.wrapped;
                    break;

                case "alias":
                    for (const source of v.sources as string[]) {
                        aliases.push([source, k]);
                    }
                    v = v.wrapped;
                    break;

                case "constant":
                    v = v.value;
                    break;

                case "details":
                    if (detailTranslators === undefined) {
                        detailTranslators = {};
                    }
                    detailTranslators[k] = v.translator as DetailTranslator;
                    continue nextField;
            }
        }

        switch (typeof v) {
            case "string":
            case "number":
            case "function":
                break;

            default:
                throw new Error(`Invalid value type ${typeof v} for ${v}`);
        }

        translators.push([k, v as string | number | Translator<any>]);
    }

    // Translate each table row
    nextRow: for (let source of table.rows) {
        source = { ...source };

        // Map aliased columns to their normalized name
        for (const [alias, name] of aliases) {
            if (!has(source, name) && has(source, alias)) {
                source[name] = source[alias];
                delete source[alias];
            }
        }

        // Hard cast as we are taking care of enforcing typing ourselves
        const record = { xref: definition.xref } as TableRecord<T>;

        // Translate each field
        for (const [name, translator] of translators) {
            const el = source[name];
            let value;
            if (typeof translator === "function") {
                value = el === undefined || el === null ? undefined : translator(el);
            } else {
                value = translator;
            }

            // Ignore the row if required values are missing
            const empty = value === undefined || value === null || value === "" || Number.isNaN(value);
            if (empty && !optional.has(name)) {
                missing.add(name);
                continue nextRow;
            }

            // Set the column
            if (!empty) {
                (record as any)[name] = value;
            }
        }
        result.push(record);
    }

    if (missing.size) {
        logger.error(
            `§ ${definition.xref.section} ignored one or more ${tag} rows due to missing fields: ${Array(
                ...missing,
            ).join(", ")}`,
        );
        logger.error(`keys present are: ${Object.keys(table.rows[0]).join(", ")}`);
    }

    if (definition.details) {
        installPreciseDetails(tag, definition.details, result, detailTranslators);
    }

    return result;
}

// Convert from raw records into a matter element.  Note that we have to
// cast the element to any for automatic properties because TS isn't sure that
// the extension hasn't changed the values
export function translateRecordsToMatter<R, E extends { id?: number; name: string }>(
    desc: string,
    records: R[],
    mapper: (record: R) => E | undefined,
): Array<E> | undefined {
    const result = Array<E>();
    for (const record of records) {
        const mapped = mapper(record);
        if (!mapped) {
            continue;
        }
        logger.debug(`${desc} ${mapped.name} = ${mapped.id ?? "(anon)"}`);
        result.push(mapped);
    }
    if (!result.length) {
        return undefined;
    }
    return result;
}

/** Attempt to install more specific xref and details */
function installPreciseDetails(
    tag: string,
    definitions: HtmlReference[],
    records: Array<{
        name?: string;
        xref?: Specification.CrossReference;
        details?: string;
        children?: AnyElement[];
        element?: string;
    }>,
    detailTranslators?: Record<string, DetailTranslator>,
) {
    const lookup = Object.fromEntries(
        definitions.map(detail => [detail.name.toLowerCase().replace(/\s*\([^)]+\)\s*/g, " "), detail]),
    );

    for (const record of records) {
        if (!record.name) {
            return;
        }

        let titleSuffix;
        if (record.element?.endsWith("field")) {
            titleSuffix = "field";
        } else if (record.element) {
            titleSuffix = record.element;
        } else {
            titleSuffix = tag;
        }

        // We identify the detail section associated with a row using both "name" and "title", optionally followed
        // by a suffix specific to the type of thing
        let detail: HtmlReference | undefined;
        let identifiedAs = "";
        for (let identifier of [(record as { title?: string }).title, record.name]) {
            if (identifier === undefined) {
                continue;
            }

            identifiedAs = identifier;

            identifier = identifier.toLowerCase();

            detail = lookup[`${identifier} ${titleSuffix}`] || lookup[`${identifier}`];
            if (detail) {
                break;
            }

            // Handle inconsistencies in global datatype titles
            if (titleSuffix === "datatype") {
                // 1.4 added " Type" suffix to global types
                detail = lookup[`${identifier} type`];
                if (detail) {
                    break;
                }

                // 1.4.2 decided to specify "currency" and "price" as "CurrencyStruct" and "PriceStruct"
                detail = lookup[`${identifier}struct type`];
                if (detail) {
                    break;
                }
            }

            // Grr WC (at least) doing their own thing per usual and uses "bits" suffix instead of "bit"
            if (titleSuffix === "bit") {
                detail = lookup[`${identifier} bits`];
                if (detail) {
                    break;
                }
            }
        }

        // If we didn't identify a detail section we must skip
        if (!detail) {
            continue;
        }

        // Heuristically identifying proper case from table cells in the newer specs is pretty much impossible.  They
        // usually appear in a badly garbled narrow, wrapped name column where it's difficult to tell where actual word
        // boundaries are, especially in acronyms
        //
        // Fortunately the name is usually repeated in the detail section header and there it is not wrapped.  So we use
        // that to determine proper case
        if (identifiedAs === record.name) {
            let detailName = detail.name.substring(0, identifiedAs.length);

            // Global types usually are all lowercase.  Leave their case alone.  Otherwise the names should start with a
            // capital letter and we want them properly camelized
            if (detailName.match(/[A-Z]/)) {
                detailName = camelize(detailName, true);
            }

            if (
                detailName !== record.name &&
                // Don't do this for features where "description" is the long name and may match the "name" except with
                // incorrect case (which should be uppercase)
                identifiedAs.toLowerCase() !== (record as { description?: string }).description?.toLowerCase()
            ) {
                record.name = detailName;
            }
        }

        // Update metadata
        record.xref = detail.xref;
        addDocumentation(record, detail);

        // One-off repair, should move somewhere where such hacks are appropriate
        if (record.details && record.details.indexOf("SHALL indicate the of the") !== -1) {
            // Goofballs copy & pasted this typo a couple times
            record.details = record.details.replace("the of the", "the status of the");
        }

        // And another one-off repair, this happens in several places in core spec
        record.name = record.name.replace(/EndPoint/g, "Endpoint");

        // Translate children (such as datatype or ACE fields)
        if (detailTranslators) {
            for (const key in detailTranslators) {
                (record as Record<string, unknown>)[key] = detailTranslators[key](tag, record, detail);
            }
        }
    }
}

/** The type of data we think is present in a field */
enum InferredFieldType {
    Unknown,
    UniqueNumbers,
    UniqueStrings,
}

/** Examine a field in every row to infer the type of a field */
function inferFieldType(definition: HtmlReference, name: string): InferredFieldType {
    if (!definition.tables) {
        return InferredFieldType.Unknown;
    }

    const values = new Set<string>();
    let inferredType = InferredFieldType.Unknown;

    // Examine each row
    for (const row of definition.tables[0].rows) {
        // Extract the value and rows without the named field
        const value = row[name];
        if (!value) {
            return InferredFieldType.Unknown;
        }
        const str = Str(value);
        if (str === "") {
            return InferredFieldType.Unknown;
        }

        // We're only interested in fields with unique values
        if (values.has(str)) {
            return InferredFieldType.Unknown;
        }
        values.add(str);

        // Update state based on the shape of the field
        if (str.match(/^\d+/)) {
            // Could be the ID.  Note we allow garbage after the ID
            if (inferredType === InferredFieldType.UniqueStrings) {
                return InferredFieldType.Unknown;
            }
            inferredType = InferredFieldType.UniqueNumbers;
        } else {
            // Could be the name
            if (inferredType === InferredFieldType.UniqueNumbers) {
                return InferredFieldType.Unknown;
            }
            inferredType = InferredFieldType.UniqueStrings;
        }
    }

    return inferredType;
}

/** Infer the columns to use for ID and name */
export function chooseIdentityAliases(definition: HtmlReference, preferredIds: string[], preferredNames: string[]) {
    const fields = definition.tables?.[0]?.fields;

    let ids: string[] | undefined;
    let names: string[] | undefined;
    let idIndex = -1,
        nameIndex = -1;

    if (fields && fields.length > 1) {
        // Use the first preferred ID that is present
        for (const id of preferredIds) {
            idIndex = fields.indexOf(id);
            if (idIndex !== -1) {
                break;
            }
        }

        // Use the first preferred name that is present
        for (const name of preferredNames) {
            nameIndex = fields.indexOf(name);
            if (nameIndex !== -1) {
                break;
            }
        }

        // If we didn't find a preferred ID, use the first IDish column
        if (idIndex === -1) {
            for (let i = 0; i < fields.length; i++) {
                if (inferFieldType(definition, fields[i]) === InferredFieldType.UniqueNumbers) {
                    idIndex = i;
                    break;
                }
            }
        }

        // If we found the ID, set the alias
        if (idIndex !== -1) {
            ids = [fields[idIndex]];
        }

        // If we didn't find a preferred name, use the first namish column
        // following the ID
        if (nameIndex === -1) {
            for (let i = idIndex === -1 ? 0 : idIndex; i < fields.length; i++) {
                if (inferFieldType(definition, fields[i]) === InferredFieldType.UniqueStrings) {
                    nameIndex = i;
                    break;
                }
            }
        }

        // If we found the name, set the alias
        if (nameIndex !== -1) {
            names = [fields[nameIndex]];
        }
    }

    // If ids or names is undefined, the table is probably invalid but return
    // the preferred sets anyway
    if (!ids) {
        ids = preferredIds;
    }
    if (!names) {
        names = preferredNames;
    }

    return { ids, names };
}
