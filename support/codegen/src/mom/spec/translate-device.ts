/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "#general";
import {
    ConditionElement,
    Conformance,
    DeviceClassification,
    DeviceTypeElement,
    ElementTag,
    RequirementElement,
} from "#model";
import { camelize } from "../../util/string.js";
import { addDeviceDocumentation } from "./add-documentation.js";
import { repairConstraint } from "./repairs/aspect-repairs.js";
import { DeviceReference, SpecReference } from "./spec-types.js";
import { Alias, Constant, Optional, translateRecordsToMatter, translateTable } from "./translate-table.js";
import {
    ConformanceCode,
    ConstraintStr,
    Identifier,
    Integer,
    LowerIdentifier,
    Str,
    StrWithSuperscripts,
} from "./translators.js";

const logger = Logger.get("translate-devices");

const ActualClusterNames = {
    Level: "LevelControl",
    NodeOperationalCredentials: "OperationalCredentials",
};

// The specification references to clusters are not entirely formal.  This translator converts colloquial names to the
// actual cluster name
const ClusterName = (text: string) => {
    const name = Identifier(text);
    return (ActualClusterNames as any)[name] ?? name;
};

export function* translateDevice(deviceRef: DeviceReference) {
    const device = createDevice(deviceRef);
    if (!device) {
        return;
    }

    addDeviceDocumentation(device, deviceRef);
    addConditions(device, deviceRef);
    addConditionRequirements(device, deviceRef);
    addClusters(device, deviceRef);
    addComposing(device, deviceRef);
    canonicalizeConditionReferences(device);

    yield device;
}

function revisionOf(deviceRef: DeviceReference) {
    const revisions = translateTable("deviceType", deviceRef.revisions, {
        revision: Alias(Integer, "rev"),
    });
    return revisions[revisions.length - 1]?.revision;
}

function createDevice(deviceRef: DeviceReference) {
    if (deviceRef.name === "Base") {
        // Base has no device type id, so no Descriptor DeviceTypeList entry carries its revision
        return DeviceTypeElement({
            name: "Base",
            classification: DeviceClassification.Base,
            revision: revisionOf(deviceRef),
            xref: deviceRef.xref,
        });
    }

    const metadata = translateTable("deviceType", deviceRef.classification, {
        id: Alias(Integer, "devicetypeid"),
        name: Alias(Identifier, "devicename", "devicetypename"),
        superset: Optional(Alias(Identifier, "supersetof")),
        class: LowerIdentifier,
        scope: LowerIdentifier,
    })[0];

    if (!metadata) {
        logger.error(`No metadata for device ${deviceRef.name}`);
        return;
    }

    let classification;
    if (metadata.class === "simple") {
        classification = DeviceClassification.Simple;
    } else if (metadata.class === "dynamicutility") {
        classification = DeviceClassification.Dynamic;
    } else if (metadata.class === "node") {
        classification = DeviceClassification.Node;
    } else if (metadata.class === "utility") {
        classification = DeviceClassification.Utility;
    }

    if (!classification) {
        logger.error(`No classification for device ${deviceRef.name}`);
        return;
    }

    let revision = revisionOf(deviceRef);
    if (revision === undefined) {
        logger.error(`No revision for device ${deviceRef.name}, assuming 1`);
        revision = 1;
    }

    const definition = {
        id: metadata.id,
        name: metadata.name,
        category: deviceRef.category,
        classification,
        xref: deviceRef.xref,
    };
    const device = DeviceTypeElement(definition);

    if (metadata.superset) {
        device.type = metadata.superset;
    }

    device.children = [
        RequirementElement({
            id: 0x1d,
            name: "Descriptor",
            element: RequirementElement.ElementType.ServerCluster,
            children: [
                RequirementElement({
                    name: "DeviceTypeList",
                    element: RequirementElement.ElementType.Attribute,
                    default: [{ deviceType: definition.id, revision }],
                }),
            ],
        }),
    ];

    logger.debug("metadata", Diagnostic.dict({ ...definition, revision, type: metadata.superset }));

    return device;
}

function addConditions(device: DeviceTypeElement, deviceRef: DeviceReference) {
    if (!deviceRef.conditionSets) {
        return;
    }

    const records = Array<{ name: string; description?: string; details?: string; xref?: any }>();
    deviceRef.conditionSets.forEach(conditionRef => {
        const definitions = translateTable("condition", conditionRef, {
            name: Alias(
                Identifier,

                // Spec writers have outdone themselves w/ lack of consistency here
                "condition",
                "feature",
                "tag",
                "certificationprogram",
                "protocoltag",
                "interfacetag",
                "capabilitytag",
                "classtag",
            ),
            description: Optional(Alias(StrWithSuperscripts, "summary")),
        });

        if (definitions) {
            records.push(...definitions);
        }
    });

    if (records.length) {
        if (!device.children) {
            device.children = [];
        }
        for (const r of records) {
            device.children.push(
                ConditionElement({
                    name: r.name,
                    description: r.description,
                    details: r.details,
                    xref: r.xref,
                }),
            );
        }
    }
}

function addConditionRequirements(device: DeviceTypeElement, deviceRef: DeviceReference) {
    if (!deviceRef.conditionRequirements) {
        return;
    }

    // Use "condition" as the tag so installPreciseDetails matches detail sections titled
    // "FooCondition Condition" via the standard "${name} ${tag}" pattern
    const records = translateTable("condition", deviceRef.conditionRequirements, {
        location: Optional(Str),
        id: Optional(Alias(Integer, "devicetypeid")),
        deviceTypeName: Optional(Alias(Identifier, "devicetypename")),
        name: Alias(Identifier, "condition"),
        conformance: Optional(ConformanceCode),
        constraint: Optional(ConstraintStr),
    });

    if (!records.length) {
        return;
    }

    if (!device.children) {
        device.children = [];
    }

    for (const r of records) {
        const qualifiedType = r.deviceTypeName ? `${camelize(r.deviceTypeName, true)}.${r.name}` : undefined;
        const element = RequirementElement({
            name: r.name,
            type: qualifiedType,
            element: RequirementElement.ElementType.Condition,
            conformance: r.conformance,
            constraint: r.constraint,
            location: locationOf(r.location, r.name),
            xref: r.xref,
            details: r.details,
        });

        device.children.push(element);
    }
}

// The specification names the location in three vocabularies that disagree; "Child" and "Descendant"
// both denote an endpoint below the asserting one
function locationOf(location: string | undefined, name: string) {
    switch (location?.toLowerCase()) {
        case undefined:
            return undefined;
        case "root":
        case "root node":
            return RequirementElement.Location.Root;
        case "self":
            return RequirementElement.Location.Self;
        case "child":
        case "descendant":
            return RequirementElement.Location.Descendant;
        default:
            logger.warn(`Condition requirement ${name} states unknown location "${location}"`);
            return undefined;
    }
}

function addClusters(device: DeviceTypeElement, deviceRef: DeviceReference) {
    const clusterRecords = translateTable("clusters", deviceRef.clusters, {
        id: Optional(Alias(Integer, "identifier", "clusterid")),
        name: Alias(ClusterName, "clustername", "cluster"),
        element: Alias((text: string) => {
            const cs = LowerIdentifier(text);
            switch (cs) {
                case "client":
                    return RequirementElement.ElementType.ClientCluster;

                case "server":
                    return RequirementElement.ElementType.ServerCluster;

                default:
                    logger.error(`Invalid client/server value ${cs} (assuming server)`);
                    return RequirementElement.ElementType.ServerCluster;
            }
        }, "clientserver"),
        quality: Optional(Str),
        conformance: Optional(ConformanceCode),
    });

    const clusters = translateRecordsToMatter("clusters", clusterRecords, RequirementElement);
    if (!clusters?.length) {
        return;
    }

    if (!device.children) {
        device.children = [];
    }
    device.children.push(...clusters);

    // Index all cluster requirements (both parsed from the table and implicitly created like Descriptor)
    const clusterIndex = new Map<string, RequirementElement[]>();
    for (const child of device.children) {
        const req = child as RequirementElement;
        if (
            req.element === RequirementElement.ElementType.ServerCluster ||
            req.element === RequirementElement.ElementType.ClientCluster
        ) {
            const key = req.name.toLowerCase();
            if (clusterIndex.has(key)) {
                clusterIndex.get(key)?.push(req);
            } else {
                clusterIndex.set(key, [req]);
            }
        }
    }

    const elementRecords = translateTable("elements", deviceRef.elements, {
        id: Optional(Integer),
        cluster: Alias(ClusterName, "clustername"),
        element: Identifier,
        name: Identifier,
        constraint: Optional(ConstraintStr),
        access: Optional(Str),
        conformance: Optional(Str),
    });

    for (const record of elementRecords) {
        repairConstraint(record);

        const clusters = clusterIndex.get(record.cluster.toLowerCase());
        if (!clusters) {
            logger.error(`No cluster ${record.cluster} for ${record.element} requirement ${record.name}`);
            continue;
        }

        for (const cluster of clusters) {
            if (!cluster.children) {
                cluster.children = [];
            }
            const element = camelize(record.element) as RequirementElement.ElementType;
            if (element === RequirementElement.ElementType.Feature) {
                record.name = record.name.toUpperCase();
            }
            cluster.children.push(
                RequirementElement({
                    element,
                    name: record.name,
                    constraint: record.constraint,
                    access: record.access,
                    conformance: record.conformance,
                    xref: record.xref,
                }),
            );
        }
    }
}

function addComposing(device: DeviceTypeElement, deviceRef: DeviceReference) {
    const composingTypeRecords = translateTable("composingTypes", deviceRef.composingTypes, {
        id: Alias(Integer, "deviceid", "devicetypeid"),
        name: Alias(Identifier, "devicename", "devicetypename", "devicetype"),
        element: Constant("deviceType"),
        quality: Optional(Str),
        constraint: Optional(ConstraintStr),
        conformance: Optional(ConformanceCode),
    });

    const composingTypesMaybe = translateRecordsToMatter("clusters", composingTypeRecords, RequirementElement);
    if (!composingTypesMaybe?.length) {
        return;
    }
    const composingTypes: RequirementElement[] = composingTypesMaybe;

    if (!device.children) {
        device.children = [];
    }

    /**
     * Extract the ordinal instance number from a group header like "Power Source (1st)" → 1.
     * Returns undefined if no ordinal is present (single-instance group).
     */
    function extractInstance(noteText: string): number | undefined {
        const match = noteText.match(/\((\d+)(?:st|nd|rd|th)\)/i);
        return match ? parseInt(match[1]) : undefined;
    }

    /**
     * Given a row index and the notes array (with position info), find the instance number for that row
     * from the nearest preceding group header note.  Returns undefined when no ordinal is present.
     */
    type NotesArray = NonNullable<NonNullable<SpecReference["tables"]>[number]["notes"]>;
    function rowInstance(rowIndex: number, notes: NotesArray): number | undefined {
        let latest: NotesArray[number] | undefined;
        for (const n of notes) {
            if (n.beforeRowIndex <= rowIndex && (!latest || n.beforeRowIndex >= latest.beforeRowIndex)) {
                latest = n;
            }
        }
        return latest ? extractInstance(latest.note) : undefined;
    }

    // Map from "deviceTypeId:instance" (or just "deviceTypeId") to RequirementElement
    const instanceMap = new Map<string, RequirementElement>();
    // Track device type IDs that have instance-specific entries (so the un-instanced base is suppressed)
    const instancedDeviceIds = new Set<number>();

    function instanceKey(deviceid: number, instance: number | undefined): string {
        return instance === undefined ? `${deviceid}` : `${deviceid}:${instance}`;
    }

    /**
     * Find or create a RequirementElement for a specific (deviceTypeId, instance) pair.
     * Instance-specific entries are created as copies of the base composingType and added to device.children.
     */
    function getOrCreateComposingType(deviceid: number, instance: number | undefined): RequirementElement | undefined {
        const key = instanceKey(deviceid, instance);
        if (instanceMap.has(key)) {
            return instanceMap.get(key)!;
        }

        const base = composingTypes.find(ct => ct.id === deviceid);
        if (!base) {
            logger.error(`No composing device type ${deviceid}`);
            return undefined;
        }

        if (instance === undefined) {
            instanceMap.set(key, base);
            return base;
        }

        // Every property the base states, or the instance silently loses what the specification said about it
        const instanceType = RequirementElement({
            id: base.id,
            name: base.name,
            element: RequirementElement.ElementType.DeviceType,
            conformance: base.conformance,
            constraint: base.constraint,
            quality: base.quality,
            access: base.access,
            instance,
        });
        instanceMap.set(key, instanceType);
        instancedDeviceIds.add(deviceid);
        device.children!.push(instanceType);
        return instanceType;
    }

    // Find or create a cluster child on a composing device type requirement
    function getOrCreateCluster(
        composingType: RequirementElement,
        clusterid: number,
        clustername: string,
        elementType: string,
    ) {
        let cluster = composingType.children?.find(c => (c as RequirementElement).id === clusterid) as
            | RequirementElement
            | undefined;
        if (!cluster) {
            cluster = RequirementElement({
                id: clusterid,
                name: clustername,
                element: elementType as RequirementElement.ElementType,
            });
            if (composingType.children) {
                composingType.children.push(cluster);
            } else {
                composingType.children = [cluster];
            }
        }
        return cluster;
    }

    // Process cluster requirements on component device types (spec section X.Y.Z.1)
    const composingClusters = deviceRef.composingClusters;
    const composingClusterRecords = translateTable("composingClusters", composingClusters, {
        deviceid: Alias(Integer, "devicetypeid"),
        device: Alias(Identifier, "devicetypename", "devicename"),
        clusterid: Integer,
        cluster: Alias(ClusterName, "clustername"),
        element: Alias((text: string) => {
            const cs = LowerIdentifier(text);
            return cs === "client"
                ? RequirementElement.ElementType.ClientCluster
                : RequirementElement.ElementType.ServerCluster;
        }, "clientserver"),
        conformance: Optional(ConformanceCode),
    });

    const clusterNotes = composingClusters?.tables?.[0]?.notes ?? [];
    for (let i = 0; i < composingClusterRecords.length; i++) {
        const record = composingClusterRecords[i];
        const instance = rowInstance(i, clusterNotes);
        const composingType = getOrCreateComposingType(record.deviceid, instance);
        if (!composingType) continue;
        const cluster = getOrCreateCluster(composingType, record.clusterid, record.cluster, record.element);
        if (record.conformance !== undefined) {
            cluster.conformance = record.conformance;
        }
    }

    // Process element requirements on component device types (spec section X.Y.Z.2)
    const composingElements = deviceRef.composingElements;
    const composingElementRecords = translateTable("composingElements", composingElements, {
        deviceid: Alias(Integer, "devicetypeid"),
        device: Alias(Identifier, "devicetypename", "devicename"),
        clusterid: Integer,
        cluster: Alias(ClusterName, "clustername"),
        element: LowerIdentifier,
        name: Identifier,
        constraint: Optional(ConstraintStr),
        access: Optional(Str),
        conformance: Optional(Str),
    });

    const elementNotes = composingElements?.tables?.[0]?.notes ?? [];
    for (let i = 0; i < composingElementRecords.length; i++) {
        const record = composingElementRecords[i];
        repairConstraint(record);

        const instance = rowInstance(i, elementNotes);
        const composingType = getOrCreateComposingType(record.deviceid, instance);
        if (!composingType) {
            logger.error(
                `No device ${record.deviceid} for ${record.cluster} ${record.element} requirement ${record.name}`,
            );
            continue;
        }

        const cluster = getOrCreateCluster(composingType, record.clusterid, record.cluster, "serverCluster");

        if (!cluster.children) {
            cluster.children = [];
        }
        const elementType = camelize(record.element) as RequirementElement.ElementType;
        const name = elementType === RequirementElement.ElementType.Feature ? record.name.toUpperCase() : record.name;

        cluster.children.push(
            RequirementElement({
                element: elementType,
                name,
                constraint: record.constraint,
                access: record.access,
                conformance: record.conformance,
                xref: record.xref,
            }),
        );
    }

    // Add un-instanced composingTypes that weren't replaced by instance-specific entries
    for (const ct of composingTypes) {
        if (!instancedDeviceIds.has(ct.id!) && !device.children!.includes(ct)) {
            device.children!.push(ct);
        }
    }
}

const NoFeatures: ReadonlySet<string> = new Set<string>();

/**
 * Align the condition names a requirement's conformance references with the spelling the device type declares.
 *
 * The specification spells a condition's declaration and its references in different cases ("SIT" against "Sit") and
 * we normalize the declaration, so a reference keeping the specification's spelling would resolve to nothing.
 *
 * A name that states a feature of the cluster in context is left alone: "NODE" under a Power Topology requirement is
 * the cluster's feature, not the "Node" condition.  The model's RequirementResolver applies the same precedence
 * at runtime.
 */
function canonicalizeConditionReferences(device: DeviceTypeElement) {
    const declared = new Map<string, string>();
    for (const child of device.children ?? []) {
        if (child.tag === ElementTag.Condition) {
            declared.set(child.name.toLowerCase(), child.name);
        }
    }

    if (!declared.size) {
        return;
    }

    for (const child of device.children ?? []) {
        if (child.tag === ElementTag.Requirement) {
            canonicalizeRequirement(child, declared, NoFeatures);
        }
    }
}

function canonicalizeRequirement(
    requirement: RequirementElement,
    declared: Map<string, string>,
    features: ReadonlySet<string>,
) {
    if (
        requirement.element === RequirementElement.ElementType.ServerCluster ||
        requirement.element === RequirementElement.ElementType.ClientCluster
    ) {
        features = featureNamesOf(requirement);
    }

    if (requirement.conformance !== undefined) {
        requirement.conformance = canonicalizedConformance(requirement.conformance, declared, features);
    }

    for (const child of requirement.children ?? []) {
        if (child.tag === ElementTag.Requirement) {
            canonicalizeRequirement(child, declared, features);
        }
    }
}

/**
 * The features of a cluster requirement, as far as the specification's element requirements state them.  A feature the
 * device type does not qualify is unknown here, so a conformance naming it reads as a condition reference.
 */
function featureNamesOf(cluster: RequirementElement) {
    const features = new Set<string>();

    for (const child of cluster.children ?? []) {
        if (child.tag === ElementTag.Requirement && child.element === RequirementElement.ElementType.Feature) {
            features.add(child.name);
        }
    }

    return features;
}

function canonicalizedConformance(
    conformance: Conformance.Definition,
    declared: Map<string, string>,
    features: ReadonlySet<string>,
) {
    let parsed;
    try {
        parsed = Conformance.create(conformance);
    } catch (e) {
        logger.warn(`Cannot read conformance "${conformance}", leaving its condition references as written`, e);
        return conformance;
    }

    // A conformance the parser rejects keeps the specification's text; its partial parse serializes to less than the
    // specification states
    if (!parsed.valid) {
        return conformance;
    }

    const canonicalized = canonicalizedAst(parsed.ast, name =>
        features.has(name) ? undefined : declared.get(name.toLowerCase()),
    );

    // An unchanged conformance keeps the specification's exact text; a parse and serialize round trip normalizes
    // spacing and parentheses
    if (canonicalized === undefined) {
        return conformance;
    }

    return Conformance.serialize(canonicalized);
}

/**
 * A copy of {@link ast} with every name reference the caller renames replaced, or undefined if it renames none.
 */
function canonicalizedAst(
    ast: Conformance.Ast,
    rename: (name: string) => string | undefined,
): Conformance.Ast | undefined {
    switch (ast.type) {
        case Conformance.Special.Name: {
            const name = rename(ast.param);
            return name === undefined || name === ast.param ? undefined : { type: ast.type, param: name };
        }

        case Conformance.Operator.AND:
        case Conformance.Operator.OR:
        case Conformance.Operator.XOR:
        case Conformance.Operator.EQ:
        case Conformance.Operator.NE:
        case Conformance.Operator.GT:
        case Conformance.Operator.LT:
        case Conformance.Operator.GTE:
        case Conformance.Operator.LTE: {
            const lhs = canonicalizedAst(ast.param.lhs, rename);
            const rhs = canonicalizedAst(ast.param.rhs, rename);
            if (lhs === undefined && rhs === undefined) {
                return undefined;
            }
            return { type: ast.type, param: { lhs: lhs ?? ast.param.lhs, rhs: rhs ?? ast.param.rhs } };
        }

        case Conformance.Operator.NOT: {
            const param = canonicalizedAst(ast.param, rename);
            return param === undefined ? undefined : { type: ast.type, param };
        }

        case Conformance.Special.OptionalIf: {
            const param = canonicalizedAst(ast.param, rename);
            return param === undefined ? undefined : { type: ast.type, param };
        }

        case Conformance.Special.Choice: {
            const expr = canonicalizedAst(ast.param.expr, rename);
            return expr === undefined ? undefined : { type: ast.type, param: { ...ast.param, expr } };
        }

        case Conformance.Special.Otherwise: {
            let changed = false;
            const param = ast.param.map(entry => {
                const canonicalized = canonicalizedAst(entry, rename);
                if (canonicalized === undefined) {
                    return entry;
                }
                changed = true;
                return canonicalized;
            });
            return changed ? { type: ast.type, param } : undefined;
        }

        // A qualified name states another device type's condition, which this device type's declarations do not spell
        case Conformance.Operator.DOT:
            return undefined;

        default:
            return undefined;
    }
}
