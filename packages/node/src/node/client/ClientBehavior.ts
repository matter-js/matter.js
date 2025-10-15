/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { camelize, capitalize, InternalError } from "#general";
import { AttributeModel, ClusterModel, CommandModel, FeatureBitmap, Matter } from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import { ClientInteraction, Invoke } from "#protocol";
import {
    Attribute,
    AttributeId,
    ClusterComposer,
    ClusterId,
    ClusterRegistry,
    Command,
    CommandId,
    MutableCluster,
    Status,
    StatusResponseError,
    TlvAny,
    TlvNoResponse,
} from "#types";

const BIT_BLOCK_SIZE = Math.log2(Number.MAX_SAFE_INTEGER);

const cache = {} as Record<string, ClusterBehavior.Type>;

/**
 * Obtain a {@link ClusterBehavior.Type} for a remote cluster.
 */
export function ClientBehavior(shape: ClientBehavior.ClusterShape): ClusterBehavior.Type {
    const analysis = ShapeAnalysis(shape);

    const fingerprint = createFingerprint(analysis);
    let type = cache[fingerprint];
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

    type = cache[fingerprint] = generateType(analysis, baseType);

    return type;
}

export namespace ClientBehavior {
    export interface ClusterShape {
        id: ClusterId;
        revision: number;
        features: FeatureBitmap | number;
        attributes: AttributeId[];
        commands: CommandId[];
        attributeNames: Record<AttributeId, string>;
        commandNames: Record<CommandId, string>;
    }
}

function generateType(analysis: ShapeAnalysis, baseType: Behavior.Type): ClusterBehavior.Type {
    // Ensure the input type is a ClusterBehavior
    if (!ClusterBehavior.is(baseType)) {
        throw new InternalError(`Base Behavior for cluster ${analysis.schema.name} is not a ClusterBehavior`);
    }

    let { schema } = analysis;
    let isCloned = false;
    const { extraAttrs, extraCommands } = analysis;

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
        cloneSchema();

        // Update the cluster.  Note that we do not validate feature combinations.  What the device sends we work with
        cluster = new ClusterComposer(cluster, true).compose(featureNames.map(capitalize));
    }

    // If the schema does not match what the device actually returned, further augment both the ClusterModel and
    // ClusterType with unknown attributes and/or commands
    if (schema.revision !== analysis.shape.revision || extraAttrs.size || extraCommands.size) {
        cloneSchema();

        cluster = {
            ...cluster,
            supportedFeatures,
            attributes: { ...cluster.attributes },
            commands: { ...cluster.commands },
        };

        for (const id of extraAttrs) {
            const name = createUnknownName("attr", id);
            cluster.attributes[camelize(name, false)] = Attribute(id, TlvAny);
            schema.children.push(new AttributeModel({ id, name, type: "any" }));
        }

        for (const id of extraCommands) {
            const name = createUnknownName("command", id);
            cluster.commands[camelize(name, false)] = Command(id, TlvAny, 0, TlvNoResponse);
            schema.children.push(new CommandModel({ id, name, type: "any" }));
        }
    }

    // Specialize for the specific cluster and schema
    const type = baseType.for(cluster, schema, `${schema.name}Client`);

    // Add command implementations
    for (const id of analysis.shape.commands) {
        const name = schema.get(CommandModel, id)?.name ?? createUnknownName("command", id);
        type.prototype[camelize(name, false)] = implementCommand(camelize(name));
    }

    return type;

    function cloneSchema() {
        if (isCloned) {
            return;
        }
        schema = schema.clone();
        schema.supportedFeatures = featureNames;
        isCloned = true;
    }

    function implementCommand(command: string) {
        return async function (this: ClusterBehavior, fields?: {}) {
            const node = this.env.get(Node) as ClientNode;

            const chunks = (node.interaction as ClientInteraction).invoke(
                Invoke({
                    commands: [
                        Invoke.ConcreteCommandRequest<any>({
                            endpoint: this.endpoint,
                            cluster,
                            command,
                            fields,
                        }),
                    ],
                }),
            );

            for await (const chunk of chunks) {
                for (const entry of chunk) {
                    // We send only one command, so we only get one response back
                    switch (entry.kind) {
                        case "cmd-status":
                            if (entry.status !== Status.Success) {
                                throw StatusResponseError.create(entry.status, undefined, entry.clusterStatus);
                            }
                            return;

                        case "cmd-response":
                            return entry.data;
                    }
                }
            }
        };
    }
}

/**
 * Create a compact string that uniquely identifies a shape for matching purposes.
 */
function createFingerprint(analysis: ShapeAnalysis) {
    const fingerprint = [analysis.shape.id] as (number | string)[];

    if (analysis.extraAttrs.size) {
        fingerprint.push("a", createElementFingerprint(analysis.extraAttrs));
    }

    if (analysis.extraCommands.size) {
        fingerprint.push("c", createElementFingerprint(analysis.extraCommands));
    }

    return fingerprint.join(";");

    /**
     * Create a fingerprint for a specific type of ACE element.
     *
     * For elements we divide create series of bitmaps, one for each range of BIT_BLOCK_SIZE unique integers with an
     * ID present.  Note that these bitmaps may not be consecutive due to gaps in IDs.  We then serialize all bitmaps
     * present as "<block index>:<bitmap value>" and concatenate to create a unique fingerprint.
     *
     * The goal is to efficiently create a compact unique identifier.
     */
    function createElementFingerprint(ids: Iterable<number>) {
        const blocks = {} as Record<number, number>;

        for (const id of ids) {
            const block = Math.floor(id / BIT_BLOCK_SIZE);
            blocks[block] = (blocks[block] ?? 0) | (1 << id % BIT_BLOCK_SIZE);
        }

        return Object.entries(blocks)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([block, map]) => (block ? `${block}:${map}` : map))
            .join(",");
    }
}

function createUnknownName(prefix: string, id: number) {
    return `${prefix}$${id.toString(16)}`;
}

interface ShapeAnalysis {
    schema: ClusterModel & { id: ClusterId };
    shape: ClientBehavior.ClusterShape;
    extraAttrs: Set<number>;
    extraCommands: Set<number>;
}

function ShapeAnalysis(shape: ClientBehavior.ClusterShape): ShapeAnalysis {
    const schema =
        Matter.get(ClusterModel, shape.id) ??
        new ClusterModel({ id: shape.id, name: createUnknownName("Cluster", shape.id), revision: shape.revision });

    const extraAttrs = new Set(shape.attributes);
    for (const attr of schema.attributes) {
        extraAttrs.delete(attr.id as AttributeId);
    }

    const extraCommands = new Set(shape.commands);
    for (const command of schema.commands) {
        extraCommands.delete(command.id as CommandId);
    }

    return {
        schema: schema as ClusterModel & { id: ClusterId },
        shape,
        extraAttrs,
        extraCommands,
    };
}
