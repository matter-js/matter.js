/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControl } from "#clusters/access-control";
import { Diagnostic, Duration } from "#general";
import { Specification } from "#model";
import { ArraySchema, AttributeData, AttributeId, ClusterId, ClusterType, WriteRequest } from "#types";
import { MalformedRequestError } from "./MalformedRequestError.js";
import { resolvePathForSpecifier, Specifier } from "./Specifier.js";

const AclClusterId = AccessControl.Complete.id;
const AclAttributeId = AccessControl.Complete.attributes.acl.id;
const AclExtensionAttributeId = AccessControl.Complete.attributes.extension.id;

function isAclOrExtensionPath(path: { clusterId: ClusterId; attributeId: AttributeId }) {
    const { clusterId, attributeId } = path;
    return clusterId === AclClusterId && (attributeId === AclAttributeId || attributeId === AclExtensionAttributeId);
}

export interface Write extends WriteRequest {
    /** Timeout only relevant for Client Interactions with a required TimedRequest flagging */
    timeout?: Duration;
}

/**
 * Formulate a write-request using Matter numeric IDs.
 */
export function Write(options: Write.Options): Write;

/**
 * Formulate a write-request with extended options and name-based IDs.
 */
export function Write(options: Write.Options, ...data: Write.Attribute[]): Write;

/**
 * Formulate a write-request with name-based IDs.
 */
export function Write(...data: Write.Attribute[]): Write;

export function Write(optionsOrData: Write.Options | Write.Attribute, ...data: Write.Attribute[]): Write {
    if (optionsOrData === undefined) {
        throw new MalformedRequestError(`Write action must have options or data`);
    }

    let options;
    if ("kind" in optionsOrData) {
        data = [optionsOrData, ...data];
        options = {};
    } else {
        options = optionsOrData;
    }
    const {
        writes: writeRequests = [],
        timed,
        timeout,
        chunkLists,
        suppressResponse,
        interactionModelRevision = Specification.INTERACTION_MODEL_REVISION,
    } = options;

    const result = {
        timedRequest: !!timed || !!timeout,
        timeout,
        writeRequests,
        moreChunkedMessages: false,
        suppressResponse,
        interactionModelRevision,

        [Diagnostic.value]: () =>
            Diagnostic.list(
                data.map(entry => {
                    const { version, value } = entry;
                    return `${resolvePathForSpecifier(entry)} = ${Diagnostic.json(
                        value,
                    )}${version !== undefined ? `(version=${version})` : ""}`;
                }),
            ),
    } as Write;

    for (const entry of data) {
        reifyData(entry);
    }

    if (!writeRequests.length) {
        throw new MalformedRequestError(`Write action contains no attributes to write`);
    }

    return result;

    function reifyData(data: Write.Attribute) {
        const cluster = Specifier.clusterOf(data);

        if (cluster === undefined) {
            throw new MalformedRequestError(`Write action must specify a cluster`);
        }

        let { attributes } = data;
        if (attributes === undefined) {
            throw new MalformedRequestError(`Write action must specify an attribute`);
        }
        if (!Array.isArray(attributes)) {
            attributes = [attributes];
        }

        const { endpoint, value, version: dataVersion } = data;

        // Configure base AttributePath
        const prototype: Omit<AttributeData, "data"> = {
            path: {
                endpointId: endpoint !== undefined ? Specifier.endpointIdOf(data) : undefined,
                clusterId: cluster.id,
                attributeId: undefined,
            },
            dataVersion,
        };

        for (const specifier of attributes) {
            const clusterId = cluster.id;
            const attribute = Specifier.attributeFor(cluster, specifier);
            const { schema, id: attributeId } = attribute;

            if (
                chunkLists &&
                Array.isArray(value) &&
                schema instanceof ArraySchema &&
                // As implemented for Matter 1.4.2 in https://github.com/project-chip/connectedhomeip/pull/38263
                // Acl writes will no longer be chunked by default, all others still
                // Will be streamlined later ... see https://github.com/project-chip/connectedhomeip/issues/38270
                !isAclOrExtensionPath({ clusterId, attributeId })
            ) {
                writeRequests.push(
                    ...schema
                        .encodeAsChunkedArray(value, { forWriteInteraction: true })
                        .map(({ element: data, listIndex }) => ({
                            path: {
                                ...prototype.path,
                                attributeId: attribute.id,
                                listIndex,
                            },
                            data,
                            dataVersion,
                        })),
                );
            } else {
                writeRequests.push({
                    ...prototype,
                    path: {
                        ...prototype.path,
                        attributeId: attribute.id,
                    },
                    data: attribute.schema.encodeTlv(value, { forWriteInteraction: true }),
                });
            }
            result.timedRequest ||= attribute.timed;
        }
    }
}

export namespace Write {
    export interface Options {
        writes?: AttributeData[];
        timed?: boolean;
        timeout?: Duration;
        interactionModelRevision?: number;
        chunkLists?: boolean;
        suppressResponse?: boolean;
    }

    /**
     * Selects attributes to Write.  Limits fields to legal permutations per the Matter specification.
     */
    export type Attribute<C extends Specifier.Cluster = Specifier.Cluster> = (
        | Attribute.Concrete<C>
        | Attribute.WildcardEndpoint<C>
    ) & {
        kind: "attribute";
        value: any;
        version?: number;
    };

    export function Attribute<const C extends ClusterType>(data: Omit<Attribute<C>, "kind">): Attribute<C> {
        return {
            kind: "attribute",
            ...data,
        };
    }

    export namespace Attribute {
        export interface Concrete<C extends Specifier.Cluster> {
            endpoint: Specifier.Endpoint;
            cluster: C;
            attributes: Specifier.Attribute<Specifier.ClusterFor<C>> | Specifier.Attribute<Specifier.ClusterFor<C>>[];
        }

        export interface WildcardEndpoint<C extends Specifier.Cluster> {
            endpoint?: undefined;
            cluster: C;
            attributes: Specifier.Attribute<Specifier.ClusterFor<C>> | Specifier.Attribute<Specifier.ClusterFor<C>>[];
        }
    }
}
