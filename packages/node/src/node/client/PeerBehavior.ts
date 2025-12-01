/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ClusterBehaviorType } from "#behavior/cluster/ClusterBehaviorType.js";
import { camelize, capitalize, InternalError } from "#general";
import {
    AttributeModel,
    ClusterModel,
    CommandModel,
    Conformance,
    EncodedBitmap,
    EventModel,
    FeatureBitmap,
    Matter,
    type ValueModel,
} from "#model";
import {
    Attribute,
    AttributeId,
    ClusterComposer,
    ClusterId,
    ClusterRegistry,
    Command,
    CommandId,
    MutableCluster,
    TlvAny,
    TlvNoResponse,
} from "#types";
import { ClientCommandMethod } from "./ClientCommandMethod.js";

const BIT_BLOCK_SIZE = Math.log2(Number.MAX_SAFE_INTEGER);

const discoveredCache = {} as Record<string, ClusterBehavior.Type>;
const knownCache = new WeakMap<ClusterBehavior.Type, ClusterBehavior.Type>();

const isPeer = Symbol("is-peer");

/**
 * Obtain a {@link ClusterBehavior.Type} for a remote cluster.
 */
export function PeerBehavior(shape: PeerBehavior.ClusterShape): ClusterBehavior.Type {
    let type: ClusterBehavior.Type;

    switch (shape.kind) {
        case "known":
            if (Object.hasOwn(shape.behavior, isPeer)) {
                return shape.behavior;
            }
            type = instrumentKnownShape(shape);
            break;

        case "discovered":
            type = instrumentDiscoveredShape(shape);
            break;

        default:
            throw new InternalError(`Unknown cluster shape kind ${(shape as any).kind}`);
    }

    (type as any)[isPeer] = true;

    return type;
}

export namespace PeerBehavior {
    export type ClusterShape = DiscoveredClusterShape | KnownClusterShape;

    /**
     * A cluster shape that we assemble using a combination of Matter standards and metadata discovered by reading from
     * a peer.
     */
    export interface DiscoveredClusterShape {
        kind: "discovered";
        id: ClusterId;
        revision: number;
        features: FeatureBitmap | number;
        attributes: AttributeId[];
        commands: CommandId[];
        attributeNames: Record<AttributeId, string>;
        commandNames: Record<CommandId, string>;
    }

    /**
     * A known cluster shape that we instrument as is.
     */
    export interface KnownClusterShape {
        kind: "known";
        behavior: ClusterBehavior.Type;
    }
}

function instrumentDiscoveredShape(shape: PeerBehavior.DiscoveredClusterShape) {
    const analysis = DiscoveredShapeAnalysis(shape);

    const fingerprint = createFingerprint(analysis);
    let type = discoveredCache[fingerprint];
    if (type) {
        return type;
    }

    let baseType: Behavior.Type;
    const standardCluster = ClusterRegistry.get(shape.id);
    if (standardCluster) {
        baseType = ClusterBehavior.for(standardCluster);
    } else {
        baseType = ClusterBehavior;
    }

    type = discoveredCache[fingerprint] = generateDiscoveredType(analysis, baseType);

    return type;
}

function instrumentKnownShape(shape: PeerBehavior.KnownClusterShape) {
    let type = knownCache.get(shape.behavior);
    if (type) {
        return type;
    }

    const base = shape.behavior;

    type = ClusterBehaviorType({
        base,
        cluster: base.cluster,
        schema: base.schema,
        name: `${base.schema.name}Client`,
        forClient: true,
        commandFactory: ClientCommandMethod,
    });

    knownCache.set(shape.behavior, type);

    return type;
}

function generateDiscoveredType(analysis: DiscoveredShapeAnalysis, baseType: Behavior.Type): ClusterBehavior.Type {
    // Ensure the input type is a ClusterBehavior
    if (!ClusterBehavior.is(baseType)) {
        throw new InternalError(`Base for cluster ${analysis.schema.name} is not a ClusterBehavior`);
    }

    let { schema } = analysis;
    let isExtended = false;
    const { attrSupportOverrides, extraAttrs, commandSupportOverrides, extraCommands } = analysis;

    // Obtain a ClusterType.  This provides TLV for known elements
    let { cluster } = baseType;
    if (!cluster) {
        cluster = MutableCluster({ id: schema.id, name: schema.name, revision: schema.revision });
    }

    // Identify known features the device supports
    let supportedFeatures = analysis.shape.features;
    if (typeof supportedFeatures === "number") {
        if (supportedFeatures) {
            supportedFeatures = cluster.attributes.featureMap.schema.decode(supportedFeatures as any) as FeatureBitmap;
        } else {
            supportedFeatures = {};
        }
    }

    // If there are features supported, customize the ClusterModel and ClusterType accordingly
    const featureNames = Object.entries(supportedFeatures)
        .filter(([, v]) => v)
        .map(([k]) => k);
    if (featureNames.length) {
        // Update ClusterModel
        extendSchema();

        // Update the cluster.  Note that we do not validate feature combinations.  What the device sends we work with
        cluster = new ClusterComposer(cluster, true).compose(featureNames.map(capitalize));
    }

    // If the schema does not match what the device actually returned, further augment both the ClusterModel and
    // ClusterType with unknown attributes and/or commands
    if (
        schema.revision !== analysis.shape.revision ||
        extraAttrs.size ||
        extraCommands.size ||
        attrSupportOverrides.size ||
        commandSupportOverrides.size
    ) {
        extendSchema();

        cluster = {
            ...cluster,
            supportedFeatures,
            attributes: { ...cluster.attributes },
            commands: { ...cluster.commands },
        };

        if (attrSupportOverrides.size) {
            for (const [attr, isSupported] of attrSupportOverrides.entries()) {
                schema.children.push(attr.extend({ operationalIsSupported: isSupported }));
            }
        }

        for (const id of extraAttrs) {
            const name = createUnknownName("attr", id);
            cluster.attributes[camelize(name, false)] = Attribute(id, TlvAny);
            schema.children.push(new AttributeModel({ id, name, type: "any" }));
        }

        if (commandSupportOverrides.size) {
            for (const [command, isSupported] of commandSupportOverrides.entries()) {
                schema.children.push(command.extend({ operationalIsSupported: isSupported }));
            }
        }

        for (const id of extraCommands) {
            const name = createUnknownName("command", id);
            cluster.commands[camelize(name, false)] = Command(id, TlvAny, 0, TlvNoResponse);
            schema.children.push(new CommandModel({ id, name, type: "any" }));
        }
    }

    // Specialize for the specific cluster and schema
    return ClusterBehaviorType({
        base: baseType,
        cluster,
        schema,
        name: `${schema.name}Client`,
        forClient: true,
        commandFactory: ClientCommandMethod,
    });

    function extendSchema() {
        if (isExtended) {
            return;
        }
        schema = schema.extend();
        schema.supportedFeatures = featureNames;
        isExtended = true;
    }
}

/**
 * Create a compact string that uniquely identifies a shape for matching purposes.
 */
function createFingerprint(analysis: DiscoveredShapeAnalysis) {
    const fingerprint = [analysis.shape.id] as (number | string | bigint)[];

    if (analysis.featureBitmap) {
        fingerprint.push("f", analysis.featureBitmap);
    }

    if (analysis.attrSupportOverrides.size) {
        addSupportFingerprints("a", analysis.attrSupportOverrides);
    }

    if (analysis.extraAttrs.size) {
        fingerprint.push("a", createElementFingerprint(analysis.extraAttrs));
    }

    if (analysis.commandSupportOverrides.size) {
        addSupportFingerprints("c", analysis.commandSupportOverrides);
    }

    if (analysis.extraCommands.size) {
        fingerprint.push("c", createElementFingerprint(analysis.extraCommands));
    }

    return fingerprint.join(";");

    /**
     * Create a fingerprint for a specific type of ACE element.
     *
     * For elements we create a series of bitmaps, one for each range of BIT_BLOCK_SIZE unique integers with an ID
     * present.  Note that these bitmaps may not be consecutive due to gaps in IDs.  We then serialize all bitmaps
     * present as "<block index>:<bitmap value>" and concatenate to create a unique fingerprint.
     *
     * The goal is to efficiently create a compact unique identifier.
     */
    function createElementFingerprint(ids: Iterable<number>) {
        const blocks = {} as Record<number, number>;

        for (const id of ids) {
            const block = Math.floor(id / BIT_BLOCK_SIZE);
            blocks[block] = (blocks[block] ?? 0) | (1 << (id % BIT_BLOCK_SIZE));
        }

        return Object.entries(blocks)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([block, map]) => (block ? `${block}:${map}` : map))
            .join(",");
    }

    /**
     * Add fingerprints for overrides of element support.
     *
     * This adds an "x-" component for unsupported elements and "x+" for supported elements.
     */
    function addSupportFingerprints(prefix: string, elements: Map<ValueModel, boolean>) {
        let supported: Array<number> | undefined;
        let unsupported: Array<number> | undefined;

        for (const [{ id }, isSupported] of elements) {
            if (id === undefined) {
                continue;
            }

            if (isSupported) {
                if (supported) {
                    supported.push(id);
                } else {
                    supported = [id];
                }
            } else {
                if (unsupported) {
                    unsupported.push(id);
                } else {
                    unsupported = [id];
                }
            }
        }

        if (supported) {
            fingerprint.push(`${prefix}+`, createElementFingerprint(supported));
        }
        if (unsupported) {
            fingerprint.push(`${prefix}-`, createElementFingerprint(unsupported));
        }
    }
}

function createUnknownName(prefix: string, id: number) {
    return `${prefix}$${id.toString(16)}`;
}

interface DiscoveredShapeAnalysis {
    schema: ClusterModel & { id: ClusterId };
    featureBitmap: number | bigint;
    shape: PeerBehavior.DiscoveredClusterShape;
    attrSupportOverrides: Map<AttributeModel, boolean>;
    extraAttrs: Set<number>;
    commandSupportOverrides: Map<CommandModel, boolean>;
    extraCommands: Set<number>;
}

/**
 * Analyze a discovered cluster shape to determine how we should override the behavior and schema.
 */
function DiscoveredShapeAnalysis(shape: PeerBehavior.DiscoveredClusterShape): DiscoveredShapeAnalysis {
    const standardCluster = Matter.get(ClusterModel, shape.id);
    const schema =
        standardCluster ??
        new ClusterModel({ id: shape.id, name: createUnknownName("Cluster", shape.id), revision: shape.revision });

    let featureBitmap: bigint | number;
    if (typeof shape.features === "number") {
        featureBitmap = shape.features;
    } else {
        featureBitmap = EncodedBitmap(schema.featureMap, shape.features);
    }

    const attrSupportOverrides = new Map<AttributeModel, boolean>();
    const extraAttrs = new Set<number>(shape.attributes);
    for (const attr of schema.attributes) {
        maybeOverrideSupport(standardCluster, attr, extraAttrs, attrSupportOverrides);
        extraAttrs.delete(attr.id as AttributeId);
    }

    const commandSupportOverrides = new Map<CommandModel, boolean>();
    const extraCommands = new Set(shape.commands);
    for (const command of schema.commands) {
        maybeOverrideSupport(standardCluster, command, extraCommands, commandSupportOverrides);
        extraCommands.delete(command.id as CommandId);
    }

    return {
        schema: schema as ClusterModel & { id: ClusterId },
        featureBitmap,
        shape,
        attrSupportOverrides,
        extraAttrs,
        commandSupportOverrides,
        extraCommands,
    };
}

/**
 * Determine whether we need to override {@link ClusterModel#operationalIsSupported}.
 *
 * We do this if:
 *
 * * The element may be present according to the standard but is not implemented on the peer, or
 *
 * * the element is optional according to the standard and is implemented on the peer
 */
function maybeOverrideSupport<T extends AttributeModel | CommandModel | EventModel>(
    standardCluster: ClusterModel | undefined,
    element: T,
    supported: Set<number> | true,
    overrides: Map<T, boolean>,
) {
    if (!standardCluster) {
        return;
    }

    const isSupported = supported === true || supported.has(element.id);
    const applicability = element.effectiveConformance.applicabilityFor(standardCluster);
    if (!isSupported) {
        if (applicability === Conformance.Applicability.Mandatory) {
            // We don't really pay attention to "unsupported mandatory attributes" but mark them anyway
            overrides.set(element, false);
        }
    } else {
        if (applicability !== Conformance.Applicability.Mandatory) {
            // Indicate support for optional feature
            overrides.set(element, true);
        }
    }
}
