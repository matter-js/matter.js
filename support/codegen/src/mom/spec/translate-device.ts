/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "#general";
import { DeviceClassification, DeviceTypeElement, FieldElement, RequirementElement } from "#model";
import { camelize } from "../../util/string.js";
import { addDocumentation } from "./add-documentation.js";
import { ConformanceCode, ConstraintStr, Identifier, Integer, LowerIdentifier, Str } from "./html-translators.js";
import { DeviceReference } from "./spec-types.js";
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
        id: Integer,
        name: Alias(Identifier, "devicename"),
        superset: Optional(Identifier),
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

    const conditions = Array<FieldElement>();
    deviceRef.conditionSets.forEach(conditionRef => {
        const definitions = translateTable("condition", conditionRef, {
            tag: Constant("field" as const),
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
            description: Optional(Str),
        });

        if (definitions) {
            conditions.push(...definitions);
        }
    });

    const translated = translateRecordsToMatter("conditions", conditions, FieldElement);

    if (translated?.length) {
        if (!device.children) {
            device.children = [];
        }
        device.children.push(
            FieldElement({
                name: "conditions",
                type: "enum8",
                children: conditions,
            }),
        );
    }
}

function addClusters(device: DeviceTypeElement, deviceRef: DeviceReference) {
    const clusterRecords = translateTable("clusters", deviceRef.clusters, {
        id: Optional(Alias(Integer, "identifier")),
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
        cluster: ClusterName,
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
        id: Integer,
        name: Identifier,
        element: Constant("deviceType"),
        quality: Optional(Str),
        conformance: Optional(ConformanceCode),
    });

    const composingTypes = translateRecordsToMatter("clusters", composingTypeRecords, RequirementElement);
    if (!composingTypes?.length) {
        return;
    }

    if (!device.children) {
        device.children = [];
    }
    device.children.push(...composingTypes);

    const composingElementRecords = translateTable("composingElements", deviceRef.composingElements, {
        deviceid: Integer,
        device: Identifier,
        clusterid: Integer,
        cluster: Identifier,
        element: LowerIdentifier,
        name: Identifier,
        constraint: Optional(ConstraintStr),
        access: Optional(Str),
        conformance: Optional(Str),
    });

    if (!composingElementRecords?.length) {
        return;
    }

    for (const record of composingElementRecords) {
        const composingType = composingTypes.find(ct => ct.id === record.deviceid);
        if (!composingType) {
            logger.error(
                `No device ${record.deviceid} for ${record.cluster} ${record.element} requirement ${record.name}`,
            );
            continue;
        }

        let cluster = composingType.children?.find(child => child.id === record.clusterid) as
            | RequirementElement
            | undefined;
        if (!cluster) {
            cluster = RequirementElement({ id: record.clusterid, name: record.cluster, element: "serverCluster" });
            if (composingType.children) {
                composingType.children.push(cluster);
            } else {
                composingType.children = [cluster];
            }
        }

        if (!cluster.children) {
            cluster.children = [];
        }
        cluster.children.push(
            RequirementElement({
                element: camelize(record.element) as RequirementElement.ElementType,
                name: record.name,
                constraint: record.constraint,
                access: record.access,
                conformance: record.conformance,
            }),
        );
    }
}
