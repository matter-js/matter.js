/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SemanticNamespaceElement, SemanticTagElement } from "#model";
import { addDocumentation } from "./add-documentation.js";
import { Identifier, Integer, Str, StrWithSuperscripts } from "./html-translators.js";
import { HtmlReference } from "./spec-types.js";
import { Alias, Optional, translateTable } from "./translate-table.js";

export function* translateNamespace(nsRef: HtmlReference) {
    const ids = translateTable("semanticNamespace", nsRef, {
        id: Integer,
        name: Alias(Identifier, "namespace"),
    });

    if (!ids.length) {
        throw new Error("No namespace ID detected");
    }

    if (ids.length > 1) {
        throw new Error("Multiple namespace IDs detected");
    }

    const props = ids[0];
    props.name = props.name.replace(/^Common/, "");

    const ns = SemanticNamespaceElement(ids[0]);

    addDocumentation(ns, nsRef);

    const tagsTable = nsRef.tables?.[1];
    if (tagsTable === undefined) {
        throw new Error("No tag table present");
    }
    if (tagsTable.fields[0] !== "id" || tagsTable.fields[1] !== "name") {
        throw new Error("Second table does not appear to contain tags");
    }

    ns.children = translateTable(
        "tag",
        nsRef,
        {
            id: Integer,
            name: Str,
            description: Optional(Alias(StrWithSuperscripts, "summary")),
        },
        tagsTable,
    ).map(SemanticTagElement);

    yield ns;
}
