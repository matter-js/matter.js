/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger, UnexpectedDataError } from "#general";
import {
    ArraySchema,
    Attribute,
    AttributeError,
    AttributeId,
    AttributeJsType,
    ClusterId,
    EndpointNumber,
    getClusterAttributeById,
    getClusterById,
    NodeId,
    Status,
    TlvAny,
    TlvAttributeData,
    TlvAttributeReport,
    TlvAttributeStatus,
    TlvSchema,
    TlvType,
    TypeFromSchema,
} from "#types";

const logger = Logger.get("AttributeDataDecoder");

type DecodedAttributeReportEntry = {
    path: {
        nodeId?: NodeId;
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        attributeId: AttributeId;
        attributeName: string;
    };
};

/** Represents a fully qualified and decoded attribute value from a received DataReport */
export type DecodedAttributeReportValue<T> = DecodedAttributeReportEntry & {
    version: number;
    value: T;
};

/** Represents a fully qualified and decoded attribute status from a received DataReport */
export type DecodedAttributeReportStatus = DecodedAttributeReportEntry & {
    status?: Status;
    clusterStatus?: number;
};

/** Represents a decoded attribute value from a received DataReport where data version could be optional. */
export type DecodedAttributeValue<T> = Omit<DecodedAttributeReportValue<T>, "version"> & {
    version?: number;
};

/** Structured representation of read attribute data as endpointId/clusterId/attributeName objects */
export type StructuredReadAttributeData = { [key: number]: { [key: number]: { [key: string]: any } } };

/**
 * Parses, normalizes (e.g. un-chunk arrays and resolve Tag compression if used) and decodes the attribute data from
 * a received DataReport.
 * TODO: Convert into a Generator function once we migrate Reading Data for controller to also be streaming
 */
export function normalizeAndDecodeReadAttributeReport(
    data: TypeFromSchema<typeof TlvAttributeReport>[],
    leftoverAttributeReports?: TypeFromSchema<typeof TlvAttributeReport>[],
): {
    attributeData: DecodedAttributeReportValue<any>[];
    attributeStatus: DecodedAttributeReportStatus[];
} {
    // TODO Simplify this again into reach streaming once old Client API is gone
    if (leftoverAttributeReports !== undefined) {
        let chunkedArrayDataFound = false;
        let cutIndex = data.length;
        for (let i = data.length - 1; i >= 0; i--) {
            const attributeData = data[i].attributeData;
            if (attributeData === undefined) {
                // Last entries are attribute status, so stop processing
                break;
            }
            const { path, data: tlvData } = attributeData;
            if (path.listIndex !== undefined) {
                chunkedArrayDataFound = true;
                continue; // This is part of a chunked array, so keep it
            } else if (
                chunkedArrayDataFound || // We found chunked elements before so this must be array initial value now
                (Array.isArray(tlvData) && tlvData.length > 1 && tlvData[0].typeLength.type === TlvType.Array)
            ) {
                cutIndex = i; // Element is chunked array initial entry
            }
            break;
        }
        if (cutIndex < data.length) {
            const ignoreDataForNow = data.splice(cutIndex, data.length - cutIndex);
            ignoreDataForNow.forEach(entry => leftoverAttributeReports.push(entry));
        }
    }

    // TODO Decide how to handle the attribute report status field, right now we ignore it
    const dataValues = data.flatMap(({ attributeData }) => (attributeData !== undefined ? attributeData : []));
    const dataStatus = data.flatMap(({ attributeStatus }) => (attributeStatus !== undefined ? attributeStatus : []));

    return {
        attributeData: normalizeAndDecodeAttributeData(dataValues) as DecodedAttributeReportValue<any>[],
        attributeStatus: normalizeAttributeStatus(dataStatus),
    };
}

export function expandPathsInAttributeData(
    data: TypeFromSchema<typeof TlvAttributeData>[],
    acceptWildcardPaths = false,
): TypeFromSchema<typeof TlvAttributeData>[] {
    // Fill in missing path elements and restore dataVersion when tag compression is used
    let lastPath:
        | {
              nodeId?: NodeId;
              endpointId: EndpointNumber;
              clusterId: ClusterId;
              attributeId: AttributeId;
              dataVersion?: number;
          }
        | undefined;
    data.forEach(value => {
        if (value === undefined) return;
        const { path } = value;
        if (path.enableTagCompression) {
            if (lastPath === undefined) throw new UnexpectedDataError("Tag compression enabled, but no previous path");
            if (path.nodeId === undefined && lastPath.nodeId !== undefined) path.nodeId = lastPath.nodeId;
            if (path.endpointId === undefined) path.endpointId = lastPath.endpointId;
            if (path.clusterId === undefined) path.clusterId = lastPath.clusterId;
            if (path.attributeId === undefined) path.attributeId = lastPath.attributeId;
            if (value.dataVersion === undefined && lastPath.dataVersion !== undefined)
                value.dataVersion = lastPath.dataVersion;
        } else if (path.endpointId !== undefined && path.clusterId !== undefined && path.attributeId !== undefined) {
            lastPath = {
                nodeId: path.nodeId,
                endpointId: path.endpointId,
                clusterId: path.clusterId,
                attributeId: path.attributeId,
                dataVersion: value.dataVersion,
            };
        } else if (!acceptWildcardPaths) {
            throw new UnexpectedDataError("Tag compression disabled, but path is incomplete: " + Diagnostic.json(path));
        }
    });
    return data;
}

/**
 * Normalizes (e.g. prepare data for array un-chinking and resolve Tag compression if used) the attribute details from
 * a received DataReport.
 */
export function normalizeAttributeData(
    data: TypeFromSchema<typeof TlvAttributeData>[],
    acceptWildcardPaths = false,
): TypeFromSchema<typeof TlvAttributeData>[][] {
    const expandedData = expandPathsInAttributeData(data, acceptWildcardPaths);
    // Put all returned values into a map to group by path
    const responseList = new Map<string, TypeFromSchema<typeof TlvAttributeData>[]>();
    expandedData.forEach(value => {
        if (!value) return;
        const {
            path: { nodeId, endpointId, clusterId, attributeId },
        } = value;
        const mapId = `${nodeId}-${endpointId}-${clusterId}-${attributeId}`;
        const list = responseList.get(mapId) || [];
        list.push(value);
        responseList.set(mapId, list);
    });

    return Array.from(responseList.values());
}

/**
 * Normalizes (e.g. un-chunk arrays and resolve Tag compression if used) and decodes the attribute data from a received
 * DataReport.
 */
export function normalizeAttributeStatus(
    data: TypeFromSchema<typeof TlvAttributeStatus>[],
): DecodedAttributeReportStatus[] {
    const result = new Array<DecodedAttributeReportStatus>();
    data.forEach(entry => {
        const {
            path: { nodeId, endpointId, clusterId, attributeId },
            status,
        } = entry;

        if (endpointId === undefined || clusterId === undefined || attributeId === undefined) {
            throw new UnexpectedDataError(`Invalid attribute path ${endpointId}/${clusterId}/${attributeId}`);
        }
        const cluster = getClusterById(clusterId);
        const attributeDetail = getClusterAttributeById(cluster, attributeId);
        if (attributeDetail === undefined) {
            result.push({
                path: {
                    nodeId,
                    endpointId,
                    clusterId,
                    attributeId,
                    attributeName: `Unknown (${Diagnostic.hex(attributeId)})`,
                },
                status: status.status,
                clusterStatus: status.clusterStatus,
            });

            return;
        }
        result.push({
            path: { nodeId, endpointId, clusterId, attributeId, attributeName: attributeDetail.name },
            status: status.status,
            clusterStatus: status.clusterStatus,
        });
    });
    return result;
}

/**
 * Normalizes (e.g. un-chunk arrays and resolve Tag compression if used) and decodes the attribute data from a received
 * DataReport.
 */
export function normalizeAndDecodeAttributeData(
    data: TypeFromSchema<typeof TlvAttributeData>[],
): DecodedAttributeValue<any>[] {
    const responseList = normalizeAttributeData(data);
    const result = new Array<DecodedAttributeValue<any>>();
    responseList.forEach(values => {
        const {
            path: { nodeId, endpointId, clusterId, attributeId },
            dataVersion,
        } = values[0];

        if (endpointId === undefined || clusterId === undefined || attributeId === undefined) {
            throw new UnexpectedDataError(`Invalid attribute path ${endpointId}/${clusterId}/${attributeId}`);
        }
        try {
            const cluster = getClusterById(clusterId);
            const attributeDetail = getClusterAttributeById(cluster, attributeId);
            if (attributeDetail === undefined) {
                logger.debug(
                    `Decode unknown attribute ${Diagnostic.hex(clusterId)}/${Diagnostic.hex(attributeId)} via the AnySchema.`,
                );

                const attributeName = `Unknown (${Diagnostic.hex(attributeId)})`;
                const value = decodeUnknownAttributeValue(values);
                result.push({
                    path: { nodeId, endpointId, clusterId, attributeId, attributeName },
                    version: dataVersion,
                    value,
                });

                return;
            }
            const { attribute, name } = attributeDetail;
            const value = decodeValueForAttribute(attribute, values);
            result.push({
                path: { nodeId, endpointId, clusterId, attributeId, attributeName: name },
                version: dataVersion,
                value,
            });
        } catch (error: any) {
            logger.error(
                `Error decoding attribute ${endpointId}/${Diagnostic.hex(clusterId)}/${Diagnostic.hex(attributeId)}: ${
                    error.message
                }`,
            );
        }
    });
    return result;
}

/** Decodes the data for one known attribute identified by its Attribute definition including array un-chunking. */
function decodeValueForAttribute<A extends Attribute<any, any>>(
    attribute: A,
    values: TypeFromSchema<typeof TlvAttributeData>[],
): AttributeJsType<A> | undefined {
    const { schema, optional, default: conformanceValue } = attribute;

    // No values, so use default value if available
    if (!values.length) {
        if (optional) return undefined;
        if (conformanceValue === undefined) throw new AttributeError(`Attribute not found.`);
        return conformanceValue;
    }

    return decodeAttributeValueWithSchema(schema, values);
}

export function decodeListAttributeValueWithSchema<T>(
    schema: ArraySchema<T>,
    values: TypeFromSchema<typeof TlvAttributeData>[],
    currentValue?: T[],
): T[] | undefined {
    // Return contained multiple tlv values as an array
    if (!(schema instanceof ArraySchema)) {
        throw new UnexpectedDataError(`Attribute is not a list but multiple values were returned.`);
    }
    return schema.decodeFromChunkedArray(
        values.map(({ data, path: { listIndex } }) => ({ listIndex, element: data })),
        currentValue,
    );
}

/** Decodes the data for one attribute via a schema including array un-chunking. */
export function decodeAttributeValueWithSchema<T>(
    schema: TlvSchema<T>,
    values: TypeFromSchema<typeof TlvAttributeData>[],
    defaultValue?: T,
): T | undefined {
    // No values, so use default value if available
    if (!values.length) {
        return defaultValue;
    }

    // We got multiple values, so assume duplicates of the same attribute
    if (schema instanceof ArraySchema) {
        return decodeListAttributeValueWithSchema<T>(schema, values, defaultValue as T[]) as T;
    }

    // The value was returned as one Tlv value, so decode it normally
    if (values.length === 1 && values[0].path.listIndex === undefined) {
        return schema.decodeTlv(values[0].data);
    }

    // We got multiple entries but it is no array, so validate that no array action entries are there, this would be invalid
    if (values.some(({ path: { listIndex } }) => listIndex !== undefined)) {
        throw new UnexpectedDataError(`Attribute is not a list but we got actions with list entries`);
    }
    // Sort values by highest dataVersion first
    const bestDataVersionValue = values.sort(({ dataVersion: a }, { dataVersion: b }) => (b ?? 0) - (a ?? 0));
    return schema.decodeTlv(bestDataVersionValue[0].data);
}

/** Decodes the data for one unknown attribute via the AnySchema including array un-chunking. */
export function decodeUnknownAttributeValue(values: TypeFromSchema<typeof TlvAttributeData>[]): any {
    const schema = TlvAny;
    // No values, so use default value if available
    if (!values.length) {
        return undefined;
    }

    // The value was returned as one Tlv value, so decode it normally
    if (values.length === 1 && values[0].path.listIndex === undefined) {
        const tlvEncoded = schema.decodeTlv(values[0].data);
        return schema.decodeAnyTlvStream(tlvEncoded);
    } else {
        // Chunked any data
        const tlvEncoded = new ArraySchema(schema).decodeFromChunkedArray(
            values.map(({ data, path: { listIndex } }) => ({ listIndex, element: data })),
        );
        return tlvEncoded.map(element => schema.decodeAnyTlvStream(element));
    }
}

/** Structure the data of a received DataReport into an endpointId/clusterId/attributeName object structure. */
export function structureReadAttributeDataToClusterObject(data: DecodedAttributeReportValue<any>[]) {
    const structure: StructuredReadAttributeData = {};
    for (const {
        path: { endpointId, clusterId, attributeName },
        value,
    } of data) {
        if (structure[endpointId] === undefined) {
            if ((endpointId as any) === "__proto__") {
                continue;
            }
            structure[endpointId] = {};
        }
        if (structure[endpointId][clusterId] === undefined) {
            if ((clusterId as any) === "__proto__") {
                continue;
            }
            structure[endpointId][clusterId] = {};
        }
        structure[endpointId][clusterId][attributeName] = value;
    }
    return structure;
}
