/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "#general";
import { ConditionElement, DeviceClassification, DeviceTypeElement, RequirementElement } from "#model";
import { camelize } from "../../util/string.js";
import { addDocumentation } from "./add-documentation.js";
import {
    ConformanceCode,
    ConstraintStr,
    Identifier,
    Integer,
    LowerIdentifier,
    Str,
    StrWithSuperscripts,
} from "./html-translators.js";
import { DeviceReference, HtmlReference } from "./spec-types.js";
import { Alias, Constant, Optional, translateRecordsToMatter, translateTable } from "./translate-table.js";

const logger = Logger.get("translate-devices");

const ActualClusterNames = {
    Level: "LevelControl",
    NodeOperationalCredentials: "OperationalCredentials",
};

// The specification references to clusters are not entirely formal.  This translator converts colloquial names to the
// actual cluster name
const ClusterName = (el: HTMLElement) => {
    const name = Identifier(el);
    return (ActualClusterNames as any)[name] ?? name;
};

export function* translateDevice(deviceRef: DeviceReference) {
    const device = createDevice(deviceRef);
    if (!device) {
        return;
    }

    addDocumentation(device, deviceRef);
    addConditions(device, deviceRef);
    addConditionRequirements(device, deviceRef);
    addClusters(device, deviceRef);
    addComposing(device, deviceRef);

    yield device;
}

function createDevice(deviceRef: DeviceReference) {
    if (deviceRef.name === "Base") {
        return DeviceTypeElement({
            name: "Base",
            classification: DeviceClassification.Base,
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

    const revisions = translateTable("deviceType", deviceRef.revisions, {
        revision: Alias(Integer, "rev"),
    });
    let revision = revisions[revisions.length - 1]?.revision;
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

    const records = Array<{ name: string; description?: string; xref?: any }>();
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
            description: Optional(StrWithSuperscripts),
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

    const records = translateTable("conditionRequirements", deviceRef.conditionRequirements, {
        location: Optional(Str),
        id: Optional(Alias(Integer, "devicetypeid")),
        name: Optional(Alias(Identifier, "devicetypename")),
        condition: Identifier,
        conformance: Optional(ConformanceCode),
    });

    if (!records.length) {
        return;
    }

    // Build a lookup from condition name to detail section for documentation extraction
    const detailLookup = new Map<string, HtmlReference>();
    if (deviceRef.conditionRequirements.details) {
        for (const detail of deviceRef.conditionRequirements.details) {
            // Detail sections are named like "ManagedAclAllowed Condition"
            const condName = detail.name.replace(/\s+condition$/i, "");
            detailLookup.set(camelize(condName, true), detail);
        }
    }

    if (!device.children) {
        device.children = [];
    }

    for (const r of records) {
        const deviceTypeName = r.name ? camelize(r.name, true) : undefined;
        const element = RequirementElement({
            name: r.condition,
            type: deviceTypeName ? `${deviceTypeName}.${r.condition}` : undefined,
            element: RequirementElement.ElementType.Condition,
            conformance: r.conformance,
        });

        // Add documentation from the detail section if available
        const detail = detailLookup.get(r.condition);
        if (detail) {
            addDocumentation(element, detail);
        }

        device.children.push(element);
    }
}

function addClusters(device: DeviceTypeElement, deviceRef: DeviceReference) {
    const clusterRecords = translateTable("clusters", deviceRef.clusters, {
        id: Optional(Alias(Integer, "identifier", "clusterid")),
        name: Alias(ClusterName, "clustername", "cluster"),
        element: Alias((el: HTMLElement) => {
            const cs = LowerIdentifier(el);
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

    const clusterIndex = new Map<string, RequirementElement[]>();
    for (const cluster of clusters) {
        const key = cluster.name.toLowerCase();
        if (clusterIndex.has(key)) {
            clusterIndex.get(key)?.push(cluster);
        } else {
            clusterIndex.set(key, [cluster]);
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
    type NotesArray = NonNullable<NonNullable<HtmlReference["tables"]>[number]["notes"]>;
    function rowInstance(rowIndex: number, notes: NotesArray): number | undefined {
        let latest: NotesArray[number] | undefined;
        for (const n of notes) {
            if (n.beforeRowIndex <= rowIndex && (!latest || n.beforeRowIndex >= latest.beforeRowIndex)) {
                latest = n;
            }
        }
        return latest ? extractInstance(latest.note.textContent ?? "") : undefined;
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

        // Create an instance-specific RequirementElement copied from the base
        const instanceType = RequirementElement({
            id: base.id,
            name: base.name,
            element: RequirementElement.ElementType.DeviceType,
            conformance: base.conformance,
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
        device: Alias(Identifier, "devicetypename"),
        clusterid: Integer,
        cluster: Alias(ClusterName, "clustername"),
        element: Alias((el: HTMLElement) => {
            const cs = LowerIdentifier(el);
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
        device: Alias(Identifier, "devicetypename"),
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
