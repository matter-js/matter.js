/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { Constraint, ElementTag, RequirementElement } from "#model";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ChipDataModel } from "./chip-data-model.js";
import { DataModel, DmCluster, DmDeviceType, DmElement, DmSemanticNamespace } from "./data-model.js";
import { DataModelSyntaxError } from "./errors.js";
import { translateAccess, translateQuality } from "./translate-aspects.js";
import { translateConformance } from "./translate-conformance.js";
import { translateConstraint } from "./translate-constraint.js";
import { translateValue } from "./values.js";
import { child, children, maybeNum, num, parseXml, str } from "./xml.js";

const logger = Logger.get("load-data-model");

/** Load the CHIP data model for one Matter version */
export async function loadDataModel(source: ChipDataModel, version: string): Promise<DataModel> {
    const path = await source.directory(version);

    logger.info(`Loading CHIP data model ${version} from ${source.description}`);

    const clusters = new Array<DmCluster>();
    const baseClusters = new Array<DmCluster>();

    for (const family of load(path, "clusters", loadCluster)) {
        for (const cluster of family) {
            if (cluster.id === undefined) {
                baseClusters.push(cluster);
            } else {
                clusters.push(cluster);
            }
        }
    }

    const globals = load(path, "globals", loadGlobals).flat();

    return {
        version,
        source: source.description,
        clusters,
        baseClusters,
        deviceTypes: load(path, "device_types", loadDeviceType),
        namespaces: load(path, "namespaces", loadNamespace),
        globals: globals.filter(element => element.tag !== ElementTag.Command),
        globalCommands: globals.filter(element => element.tag === ElementTag.Command),
    };
}

function load<T>(path: string, directory: string, loader: (root: Element, filename: string) => T) {
    const dir = resolve(path, directory);
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
        return new Array<T>();
    }

    return readdirSync(dir)
        .filter(filename => filename.endsWith(".xml"))
        .sort()
        .map(filename => {
            const file = resolve(dir, filename);
            return loader(parseXml(readFileSync(file, "utf-8"), file), filename);
        });
}

/**
 * Load one cluster file.
 *
 * A file defines a single cluster, a family of clusters that share one definition (the concentration measurement
 * clusters) or a base cluster with no ID of its own, so this always returns an array.
 */
function loadCluster(root: Element, filename: string) {
    if (root.tagName !== "cluster") {
        throw new DataModelSyntaxError(`${filename}: root element is <${root.tagName}>, expected <cluster>`);
    }

    const members = new Array<DmElement>();
    collect(root, "features", "feature", loadFeature, members);
    collect(root, "attributes", "attribute", loadValue(ElementTag.Attribute), members);
    collect(root, "commands", "command", loadCommand, members);
    collect(root, "events", "event", loadEvent, members);
    collect(root, "dataTypes", undefined, loadDatatype, members);

    const classification = child(root, "classification");

    const template = {
        tag: ElementTag.Cluster,
        revision: num(root, "revision") ?? 1,
        classification: clusterClassificationOf(classification),
        base: classification === undefined ? undefined : str(classification, "baseCluster"),
        conformance: translateConformance(root),
        quality: translateQuality(root),
        children: members,
    } as const;

    const ids = child(root, "clusterIds");
    const identities = ids === undefined ? [] : children(ids, "clusterId");

    // A cluster ID without a number identifies a base cluster, which exists only to be derived from
    const instances = identities.filter(identity => num(identity, "id") !== undefined);

    if (!instances.length) {
        // A base cluster is named by its (ID-less) cluster ID entry; the root element name carries a "Cluster" suffix
        const name = identities.length
            ? nameOf(identities[0], filename)
            : nameOf(root, filename).replace(/\s*Cluster$/, "");
        return [{ ...template, name } as DmCluster];
    }

    return instances.map(
        identity => ({ ...template, id: num(identity, "id"), name: nameOf(identity, filename) }) as DmCluster,
    );
}

function loadFeature(node: Element): DmElement {
    return {
        tag: ElementTag.Field,
        name: str(node, "code") ?? nameOf(node, "feature"),
        constraint: bitConstraint(num(node, "bit")),
        conformance: translateConformance(node),
        children: [],
    };
}

function loadValue(tag: ElementTag) {
    return function loadValueElement(node: Element): DmElement {
        const entry = child(node, "entry");
        const defaultValue = str(node, "default");

        return {
            tag,
            id: num(node, "id") ?? maybeNum(node, "code"),
            name: nameOf(node, node.tagName),
            type: str(node, "type"),
            entryType: entry === undefined ? undefined : str(entry, "type"),
            conformance: translateConformance(node),
            constraint: translateConstraint(node),
            access: translateAccess(node),
            quality: translateQuality(node),
            default: defaultValue === undefined ? undefined : translateValue(defaultValue),
            children: children(node, "field").map(loadValue(ElementTag.Field)),
        };
    };
}

function loadCommand(node: Element): DmElement {
    const response = str(node, "response");
    const direction = str(node, "direction");

    return {
        ...loadValue(ElementTag.Command)(node),

        // A derived cluster restates a command without its direction, so leave the direction open here
        direction: direction === undefined ? undefined : direction === "responseFromServer" ? "response" : "request",
        response: response === "Y" ? "status" : response,
    };
}

function loadEvent(node: Element): DmElement {
    return {
        ...loadValue(ElementTag.Event)(node),
        priority: str(node, "priority"),
    };
}

function loadDatatype(node: Element): DmElement {
    switch (node.tagName) {
        case "enum":
            return {
                ...loadValue(ElementTag.Datatype)(node),
                children: children(node, "item").map(item => ({
                    tag: ElementTag.Field,
                    id: num(item, "value"),
                    name: nameOf(item, "item"),
                    conformance: translateConformance(item),
                    children: [],
                })),
            };

        case "bitmap":
            return {
                ...loadValue(ElementTag.Datatype)(node),
                children: children(node, "bitfield").map(field => ({
                    tag: ElementTag.Field,
                    name: nameOf(field, "bitfield"),
                    constraint: bitConstraint(num(field, "bit")),
                    conformance: translateConformance(field),
                    children: [],
                })),
            };

        case "struct":
        case "number":
        case "typedef":
            return loadValue(ElementTag.Datatype)(node);

        default:
            throw new DataModelSyntaxError(`Unsupported data type element <${node.tagName}>`);
    }
}

function loadDeviceType(root: Element, filename: string): DmDeviceType {
    if (root.tagName !== "deviceType") {
        throw new DataModelSyntaxError(`${filename}: root element is <${root.tagName}>, expected <deviceType>`);
    }

    const requirements = new Array<DmElement>();
    collect(root, "clusters", "cluster", loadClusterRequirement, requirements);

    const classification = child(root, "classification");

    return {
        tag: ElementTag.DeviceType,
        id: num(root, "id"),
        name: nameOf(root, filename),
        revision: num(root, "revision") ?? 1,
        classification: classification === undefined ? undefined : str(classification, "class"),
        conformance: translateConformance(root),
        children: requirements,
    };
}

function loadClusterRequirement(node: Element): DmElement {
    const members = new Array<DmElement>();
    collect(node, "features", "feature", loadRequirement(RequirementElement.ElementType.Feature), members);
    collect(node, "attributes", "attribute", loadRequirement(RequirementElement.ElementType.Attribute), members);
    collect(node, "commands", "command", loadRequirement(RequirementElement.ElementType.Command), members);
    collect(node, "events", "event", loadRequirement(RequirementElement.ElementType.Event), members);

    const element =
        str(node, "side") === "client"
            ? RequirementElement.ElementType.ClientCluster
            : RequirementElement.ElementType.ServerCluster;

    return { ...loadRequirement(element)(node), children: members };
}

function loadRequirement(element: RequirementElement.ElementType) {
    return function loadRequirementElement(node: Element): DmElement {
        return {
            tag: ElementTag.Requirement,
            element,
            id: num(node, "id") ?? maybeNum(node, "code"),
            name: str(node, "name") ?? str(node, "code") ?? nameOf(node, node.tagName),
            conformance: translateConformance(node),
            constraint: translateConstraint(node),
            access: translateAccess(node),
            quality: translateQuality(node),
            children: [],
        };
    };
}

function loadNamespace(root: Element, filename: string): DmSemanticNamespace {
    if (root.tagName !== "namespace") {
        throw new DataModelSyntaxError(`${filename}: root element is <${root.tagName}>, expected <namespace>`);
    }

    const id = num(root, "id");
    if (id === undefined) {
        throw new DataModelSyntaxError(`${filename}: namespace without id`);
    }

    const tags = new Array<DmElement>();
    collect(root, "tags", "tag", loadTag, tags);

    return {
        tag: ElementTag.SemanticNamespace,
        id,
        name: nameOf(root, filename),
        children: tags,
    };
}

function loadTag(node: Element): DmElement {
    return {
        tag: ElementTag.SemanticTag,
        id: num(node, "id"),
        name: nameOf(node, "tag"),
        children: [],
    };
}

function loadGlobals(root: Element) {
    return children(root).map(node => (node.tagName === "command" ? loadCommand(node) : loadDatatype(node)));
}

/**
 * Collect the children of a wrapper element such as `<attributes>`, which CHIP omits when empty.
 */
function collect(
    parent: Element,
    wrapper: string,
    name: string | undefined,
    loader: (node: Element) => DmElement,
    into: DmElement[],
) {
    const container = child(parent, wrapper);
    if (container === undefined) {
        return;
    }

    for (const node of name === undefined ? children(container) : children(container, name)) {
        into.push(loader(node));
    }
}

function nameOf(node: Element, context: string) {
    const name = str(node, "name");
    if (name === undefined) {
        throw new DataModelSyntaxError(`${context}: <${node.tagName}> has no name`);
    }
    return name;
}

function clusterClassificationOf(classification: Element | undefined) {
    if (classification === undefined) {
        return;
    }

    if (str(classification, "role") === "utility") {
        return str(classification, "scope")?.toLowerCase() === "node" ? "node" : "endpoint";
    }

    return str(classification, "role");
}

function bitConstraint(bit: number | undefined) {
    return bit === undefined ? undefined : new Constraint({ value: bit });
}
