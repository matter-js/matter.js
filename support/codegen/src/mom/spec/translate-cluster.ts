/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "#general";
import {
    AttributeElement,
    ClusterElement,
    ClusterRevision,
    CommandElement,
    DatatypeElement,
    EventElement,
    FeatureMap,
    FieldElement,
} from "#model";
import { camelize } from "../../util/string.js";
import { addDocumentation } from "./add-documentation.js";
import {
    ConformanceCode,
    Identifier,
    Integer,
    LowerIdentifier,
    NoSpace,
    Str,
    UpperIdentifier,
} from "./html-translators.js";
import { repairConformance } from "./repairs/aspect-repairs.js";
import { ClusterReference, HtmlReference, Table } from "./spec-types.js";
import { accessModifierOf, translateDatatype, translateFields, translateValueChildren } from "./translate-datatype.js";
import { Alias, Details, Optional, translateRecordsToMatter, translateTable } from "./translate-table.js";

const logger = Logger.get("translate-cluster");

function logCluster(cluster: ClusterElement, revision?: number) {
    const idStr = cluster.id === undefined ? "(no ID)" : `0x${cluster.id.toString(16)}`;
    logger.debug(`${idStr} ${cluster.name}`, Diagnostic.dict({ rev: revision, cls: cluster.classification }));
}

// Translate from DOM -> MOM
export function* translateCluster(definition: ClusterReference) {
    const children = Array<ClusterElement.Child>();

    const metadata = translateMetadata(definition, children);
    if (!metadata) {
        return;
    }

    translateInvokable(definition, children);
    translateDatatypes(definition, children);
    translateNamespace(definition, children);

    const cluster = ClusterElement({
        id: metadata.id,
        name: metadata.name,
        pics: metadata.pics,
        quality: metadata.quality,
        classification: metadata.classification,
        children: children,
        type: metadata.derivesFrom,
        xref: definition.xref,
    });

    logCluster(cluster, metadata.revision);

    addDocumentation(cluster, definition);

    yield cluster;

    if (metadata.aliases) {
        for (const { id, name, pics } of metadata.aliases) {
            const cluster = ClusterElement({
                id,
                name,
                pics,
                type: metadata.name,
            });

            logCluster(cluster);

            yield cluster;
        }
    }
}

// Load misc. values related to cluster definition
function translateMetadata(definition: ClusterReference, children: Array<ClusterElement.Child>) {
    const { classification, derivesFrom, pics, quality } = translateClassification();

    const ids = translateIds();
    if (!ids) {
        logger.warn(`no IDs for ${definition.name}, skipping`);
        return;
    }

    const revision = translateRevision();
    let zigbeeFeatures: undefined | Set<string>;
    translateFeatures();

    let id: number | undefined;
    let name: string;
    let aliases: { id?: number; name: string; pics?: string }[] | undefined;

    if (definition.ids?.name === "Cluster IDs") {
        // Section is a list of aliases
        name = camelize(definition.name, true);
        aliases = ids;
    } else {
        // Section is a base cluster plus aliases
        ({ id, name } = ids[0]);
        aliases = [];
        for (let i = 1; i < ids.length; i++) {
            const { id, name, pics } = ids[i];
            aliases.push({ id, name: name.replace(/ Clusters?$/i, ""), pics });
        }
    }

    name = name.replace(/Clusters?$/i, "");

    return {
        id,
        name,
        pics,
        quality,
        aliases,
        classification,
        revision,
        derivesFrom,
        zigbee: zigbeeFeatures,
    };

    function translateIds() {
        const ids = translateTable("id", definition.ids, {
            // Core spec uses "identifier", cluster spec uses "id". Because why would you to conform to a standard when
            // you're defining a standard?  Normalize to "id"
            //
            // Note that ID is optional because base clusters may have no ID
            id: Alias(Str, "identifier"),
            name: Identifier,
            pics: Optional(Alias(UpperIdentifier, "picscode")),
        });

        // Some tables list the primary ID twice in 1.1 spec; only accept the secondary instance in core spec; only
        // accept the primary in cluster spec
        const uniqueIds = new Map<number | undefined, { name: string; pics?: string }>();
        for (const record of ids) {
            const idStr = record.id.trim().toLowerCase();
            let id;
            if (idStr === "n/a") {
                // Base cluster
                id = undefined;
            } else {
                id = Number.parseInt(idStr);
                if (Number.isNaN(id)) {
                    logger.error(`Skipping cluster with non-numeric ID ${idStr}`);
                    continue;
                }
            }

            let name;

            if (id === 0x8) {
                // Level control table is just kind of fubar
                name = "LevelControl";
            } else {
                name = camelize(record.name || definition.name, true);
            }

            uniqueIds.set(id, { name, pics: record.pics ?? pics });
        }

        if (!uniqueIds.size) {
            return false;
        }

        return [...uniqueIds.entries()].map(([id, { name, pics }]) => ({ id, name, pics }));
    }

    function translateClassification() {
        const classifications = translateTable("classification", definition.classifications, {
            hierarchy: Optional(Str),
            role: Optional(LowerIdentifier),
            scope: Optional(Alias(LowerIdentifier, "context")),
            pics: Optional(Alias(UpperIdentifier, "picscode")),
            quality: Optional(Str),
        });

        let classification: ClusterElement.Classification;
        if (classifications[0]?.role === "utility") {
            if (classifications[0]?.scope === "node") {
                classification = ClusterElement.Classification.NodeUtility;
            } else {
                classification = ClusterElement.Classification.EndpointUtility;
            }
        } else {
            classification = ClusterElement.Classification.Application;
        }

        let derivesFrom = classifications[0]?.hierarchy;
        if (derivesFrom) {
            derivesFrom = derivesFrom.replace(/^derive[sd] from /i, "");
            derivesFrom = camelize(derivesFrom, true);
            if (derivesFrom === "Base") {
                derivesFrom = undefined;
            }
        }

        return { classification, derivesFrom, pics: classifications[0]?.pics, quality: classifications[0]?.quality };
    }

    function translateRevision() {
        const revisions = translateTable("revision", definition.revisions, {
            revision: Alias(Integer, "rev"),
        });

        let revision = revisions[revisions.length - 1]?.revision;
        if (revision === undefined) {
            logger.warn(`no revisions for ${definition.name}, assuming "1"`);
            revision = 1;
        }

        children.push({
            tag: ClusterRevision.tag,
            id: ClusterRevision.id,
            name: ClusterRevision.name,
            type: "ClusterRevision",
            default: revision,
        });

        return revision;
    }

    function translateFeatures() {
        const records = translateTable("feature", definition.features, {
            constraint: Alias(Integer, "bit", "id"),
            conformance: Optional(ConformanceCode),
            details: Optional(Alias(Str, "description", "summary")),
            title: Optional(Alias(Identifier, "feature", "name")),

            // Must define after title which uses the name column
            name: Alias(UpperIdentifier, "code"),

            // We let Model handle translation to the proper type
            default: Optional(Alias(NoSpace, "def", "fallback")),
        });

        for (const record of records) {
            repairConformance(record);
        }

        const values = translateRecordsToMatter("feature", records, FieldElement);
        if (values) {
            children.push({
                tag: FeatureMap.tag,
                id: FeatureMap.id,
                name: FeatureMap.name,
                type: "FeatureMap",
                children: values,
                xref: definition.features?.xref,
            });
        }
    }
}

// Load attributes, events, commands and status codes
function translateInvokable(definition: ClusterReference, children: Array<ClusterElement.Child>) {
    translateAttributes();
    translateEvents();
    translateCommands();
    translatePre13StatusCodes();

    function translateAttributes() {
        const attributeSets = [definition.attributes];
        if (definition.attributeSets) {
            attributeSets.push(...definition.attributeSets);
        }
        for (const attributeSet of attributeSets) {
            const attributes = translateFields(AttributeElement, attributeSet, false);

            if (attributes) {
                children.push(...attributes);
            }
        }
    }

    function translateCommands() {
        const records = translateTable("command", definition.commands, {
            id: Integer,
            name: Identifier,
            direction: Optional(Str),
            response: Optional(Identifier),
            access: Optional(Str),
            conformance: Optional(ConformanceCode),
            children: Details(translateValueChildren),
        });

        const commands = translateRecordsToMatter("command", records, r => {
            let direction: CommandElement.Direction | undefined;

            if (r.direction?.match(/client[^⇐]*⇐[^⇐]*server/i)) {
                direction = CommandElement.Direction.Response;
            } else if (r.direction?.match(/client.*server/i)) {
                direction = CommandElement.Direction.Request;
            } else if (r.direction?.match(/server.*client/i)) {
                direction = CommandElement.Direction.Response;
            }

            let response: string | undefined;
            switch (r.response) {
                case "Y":
                    response = "status";
                    break;

                case "N":
                case "":
                case undefined:
                    break;

                default:
                    response = r.response;
                    break;
            }

            return CommandElement({ ...r, response, direction });
        });
        if (commands) {
            children.push(...commands);
        }
    }

    function translateEvents() {
        const records = translateTable("event", definition.events, {
            id: Integer,
            name: Identifier,
            priority: Optional(LowerIdentifier),
            access: Optional(Str),
            conformance: Optional(ConformanceCode),
            children: Details(translateValueChildren),
            accessModifier: Details(extractAccessModifier),
        });

        const events = translateRecordsToMatter("event", records, r => {
            let priority: EventElement.Priority;
            switch (r.priority?.toLowerCase()) {
                case "debug":
                    priority = EventElement.Priority.Debug;
                    break;

                case "info":
                    priority = EventElement.Priority.Info;
                    break;

                case "critical":
                    priority = EventElement.Priority.Critical;
                    break;

                case undefined:
                    logger.warn("no priority defined, assuming CRITICAL");
                    priority = EventElement.Priority.Critical;
                    break;

                default:
                    logger.warn(`unrecognized priority "${r.priority}", assuming CRITICAL`);
                    priority = EventElement.Priority.Critical;
            }

            // The "access modifier" on the event field table apparently
            if (r.accessModifier) {
                if (!r.access) {
                    r.access = r.accessModifier;
                } else if (!r.access.includes(r.accessModifier)) {
                    r.access = `${r.access} ${r.accessModifier}`;
                }

                delete r.accessModifier;
            }

            return EventElement({ ...r, priority });
        });
        if (events) {
            children.push(...events);
        }
    }

    function translatePre13StatusCodes() {
        const records = translateTable("statusCodes", definition.statusCodes, {
            id: Alias(Integer, "statuscode"),
            name: Alias(Identifier, "value"),
            details: Alias(Str, "summary"),
        });
        const statusCodes = translateRecordsToMatter("statusCodes", records, FieldElement);
        if (statusCodes) {
            children.push(DatatypeElement({ name: "StatusCodeEnum", children: statusCodes }));
        }
    }

    // The "access modifier" on events table is sometimes necessary to determine whether the event is fabric sensitive.
    //
    // We've only seen this in 1.4.2 and only for the "Message" cluster.  Everywhere else the event correctly has "S" in
    // the event list.
    //
    // So I think it's safe to say it's a spec bug and probably should have just handled with override, but keeping in
    // as a precaution since I put in the effort to implement
    function extractAccessModifier(_tag: string, _parentRecord: Record<string, unknown>, definition: HtmlReference) {
        return accessModifierOf(definition);
    }
}

// Load datatypes
function translateDatatypes(definition: ClusterReference, children: Array<ClusterElement.Child>) {
    if (!definition.datatypes) {
        return;
    }

    for (const datatype of definition.datatypes) {
        Logger.nest(() => {
            const child = translateDatatype(datatype);
            if (child) {
                children.push(child);
            }
        });
    }
}

/**
 * Load namespace extensions.
 *
 * The notion of a "namespace" is a bit nebulous, but current usage is the equivalent of defining two types of enums --
 * status codes and mode tags.
 *
 * There is good consistency for the derived clusters but Mode Base itself defines the values in fairly haphazard
 * sections.
 */
function translateNamespace(definition: ClusterReference, elements: Array<ClusterElement.Child>) {
    if (!definition.namespace) {
        return;
    }

    for (const section of definition.namespace) {
        let name;
        let type;
        let table: Table | undefined;

        switch (camelize(section.name).toLowerCase()) {
            case "modenamespace": // Mode Base cluster
            case "modetags": // Derivative clusters
                // The first table in the "mode namespace" section describes ranges.  Skip if we encounter this
                if (section.tables && section.tables?.length > 1 && section.tables[0].fields[0].match(/range/i)) {
                    table = section.tables[1];
                }

                name = "ModeTag";
                type = "enum16";
                break;

            case "modebasestatuscommoncodesrange": // Mode Base cluster
            case "changetomoderesponsecommandnamespacedefinitions": // Extension clusters
                name = "ModeChangeStatus";
                type = "enum8";
                break;

            default:
                continue;
        }

        logger.debug(`namespace values`);
        Logger.nest(() => {
            const records = translateTable(
                "tag",
                section,
                {
                    id: Alias(Integer, "modetagvalue", "statuscode", "statuscodevalue"),
                    name: Identifier,
                    description: Optional(Alias(Str, "summary")),
                },
                table,
            );

            const children = translateRecordsToMatter("tag", records, FieldElement);

            if (!children) {
                return;
            }

            elements.push(DatatypeElement({ name, type, children }));
        });
    }
}
