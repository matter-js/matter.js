/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Diagnostic, MatterFlowError } from "#general";
import {
    ArraySchema,
    AttributeId,
    ClusterId,
    EndpointNumber,
    NodeId,
    TlvAttributePath,
    TlvAttributeReport,
    TlvAttributeReportData,
    TlvDataReport,
    TlvEncodingOptions,
    TlvEventData,
    TlvEventReport,
    TlvSchema,
    TlvStream,
    TypeFromSchema,
} from "#types";

type FullAttributePath = {
    nodeId?: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
    dataVersion?: number;
};

/** Type for TlvAttributeReportData where the real data are represented with the schema and the JS value. */
type AttributeDataPayload = Omit<TypeFromSchema<typeof TlvAttributeReportData>, "data"> & {
    schema: TlvSchema<any>;
    payload: any;
};

/** Type for TlvAttributeReport where the real data are represented with the schema and the JS value. */
export type AttributeReportPayload = Omit<TypeFromSchema<typeof TlvAttributeReport>, "attributeData"> & {
    attributeData?: AttributeDataPayload;
    hasFabricSensitiveData: boolean;
};

/** Type for TlvEventData where the real data are represented with the schema and the JS value. */
export type EventDataPayload = Omit<TypeFromSchema<typeof TlvEventData>, "data"> & {
    schema: TlvSchema<any>;
    payload: any;
};

/** Type for TlvEventReport where the real data are represented with the schema and the JS value. */
export type EventReportPayload = Omit<TypeFromSchema<typeof TlvEventReport>, "eventData"> & {
    eventData?: EventDataPayload;
    hasFabricSensitiveData: boolean;
};

export type EventOrAttributeDataPayload = AttributeReportPayload | EventReportPayload;

/** A base type for a DataReport which removes the fields of the actual attribute or event content */
export type BaseDataReport = Omit<TypeFromSchema<typeof TlvDataReport>, "attributeReports" | "eventReports">;

/** Type for TlvDataReport where the real data are represented with the schema and the JS value. */
export type DataReportPayload = BaseDataReport & {
    attributeReportsPayload?: AttributeReportPayload[];
    eventReportsPayload?: EventReportPayload[];
};

/**
 * Type for the DataReport Generator function to send all data
 */
export type DataReportPayloadIterator = AsyncIterableIterator<EventOrAttributeDataPayload>;

export function encodeAttributePayloadData(
    attributePayload: AttributeReportPayload,
    options?: TlvEncodingOptions,
): TlvStream {
    const { attributeData } = attributePayload;
    if (attributeData === undefined) {
        throw new MatterFlowError(
            `Cannot encode Attribute Payload data with just a attributeStatus: ${Diagnostic.json(attributePayload)}`,
        );
    }

    const { schema, payload } = attributeData;
    return schema.encodeTlv(payload, options);
}

/** Encodes an AttributeReportPayload into a TlvStream (used for TlvAny type). */
export function encodeAttributePayload(
    attributePayload: AttributeReportPayload,
    options?: TlvEncodingOptions,
): TlvStream {
    const { attributeData, attributeStatus } = attributePayload;
    if (attributeData === undefined) {
        return TlvAttributeReport.encodeTlv({ attributeStatus });
    }

    const { path, schema, payload, dataVersion } = attributeData;
    return TlvAttributeReport.encodeTlv({
        attributeData: { path, data: schema.encodeTlv(payload, options), dataVersion },
    });
}

/** Encodes an EventReportPayload into a TlvStream (used for TlvAny type). */
export function encodeEventPayload(eventPayload: EventReportPayload, options?: TlvEncodingOptions): TlvStream {
    const { eventData, eventStatus } = eventPayload;
    if (eventData === undefined) {
        return TlvEventReport.encodeTlv({ eventStatus });
    }

    const {
        path,
        schema,
        payload,
        eventNumber,
        deltaEpochTimestamp,
        epochTimestamp,
        deltaSystemTimestamp,
        systemTimestamp,
        priority,
    } = eventData;
    return TlvEventReport.encodeTlv({
        eventData: {
            path,
            data: schema.encodeTlv(payload, options),
            priority,
            systemTimestamp,
            deltaSystemTimestamp,
            deltaEpochTimestamp,
            epochTimestamp,
            eventNumber,
        },
    });
}

/** Return if an AttributeReportPayload can be chunked or not. */
export function canAttributePayloadBeChunked(attributePayload: AttributeReportPayload): boolean {
    const { attributeData } = attributePayload;
    if (attributeData === undefined) {
        return false;
    }
    const {
        schema,
        payload,
        path: { listIndex },
    } = attributeData;
    return schema instanceof ArraySchema && Array.isArray(payload) && payload.length > 0 && listIndex === undefined;
}

/** Chunk an AttributeReportPayload into multiple AttributeReportPayloads. */
export function chunkAttributePayload(attributePayload: AttributeReportPayload): AttributeReportPayload[] {
    const { hasFabricSensitiveData, attributeData } = attributePayload;
    if (attributeData === undefined) {
        throw new MatterFlowError(
            `Cannot chunk an AttributePayload with just a attributeStatus: ${Diagnostic.json(attributePayload)}`,
        );
    }
    const { schema, path, dataVersion, payload } = attributeData;
    if (!(schema instanceof ArraySchema) || !Array.isArray(payload)) {
        throw new MatterFlowError(
            `Cannot chunk an AttributePayload with attributeData that is not an array: ${Diagnostic.json(
                attributePayload,
            )}`,
        );
    }
    const chunks = new Array<AttributeReportPayload>();
    chunks.push({
        hasFabricSensitiveData: hasFabricSensitiveData,
        attributeData: { schema, path: { ...path, listIndex: undefined }, payload: [], dataVersion },
    });
    payload.forEach(element => {
        chunks.push({
            hasFabricSensitiveData: hasFabricSensitiveData,
            attributeData: {
                schema: schema.elementSchema,
                path: { ...path, listIndex: null },
                payload: element,
                dataVersion,
            },
        });
    });

    // If the path of the initial AttributePayload was not compressed, we should compress the chunked data
    // TODO Enable once Tag Compression is supported https://github.com/project-chip/connectedhomeip/issues/29359
    /*
    if (path.enableTagCompression !== true) {
        return compressAttributeDataReportTags(chunks);
    }
    */

    return chunks;
}

/**
 * Sort function to sort AttributeReportPayloads by nodeId/EndpointId/clusterId/attributeId to generate an ideal
 * ground for tag compression.
 */
export function sortAttributeDataByPath(data1: AttributeReportPayload, data2: AttributeReportPayload) {
    const { path: path1 } = data1.attributeData ?? data1.attributeStatus ?? {};
    const { path: path2 } = data2.attributeData ?? data2.attributeStatus ?? {};
    if (path1?.nodeId !== undefined && path2?.nodeId !== undefined && path1.nodeId !== path2.nodeId) {
        return path1.nodeId < path2.nodeId ? -1 : 1;
    }
    if (path1?.endpointId !== undefined && path2?.endpointId !== undefined && path1.endpointId !== path2.endpointId) {
        return path1.endpointId < path2.endpointId ? -1 : 1;
    }
    if (path1?.clusterId !== undefined && path2?.clusterId !== undefined && path1.clusterId !== path2.clusterId) {
        return path1.clusterId < path2.clusterId ? -1 : 1;
    }
    if (
        path1?.attributeId !== undefined &&
        path2?.attributeId !== undefined &&
        path1.attributeId !== path2.attributeId
    ) {
        return path1.attributeId < path2.attributeId ? -1 : 1;
    }
    return 0;
}

/** Sort and use Tag compression to compress a list of AttributeReportPayloads. */
export function compressAttributeDataReportTags(data: AttributeReportPayload[]) {
    let lastFullPath: FullAttributePath | undefined;

    return data.sort(sortAttributeDataByPath).map(({ hasFabricSensitiveData, attributeData, attributeStatus }) => {
        if (attributeData !== undefined) {
            const { path, dataVersion } = attributeData;
            const compressedPath = compressPath(path, dataVersion, lastFullPath);
            const { enableTagCompression } = compressedPath.path;
            attributeData = {
                ...attributeData,
                path: compressedPath.path,
                dataVersion: enableTagCompression ? undefined : dataVersion,
            };
            lastFullPath = compressedPath.lastFullPath;
        }
        if (attributeStatus !== undefined) {
            const { path } = attributeStatus;
            const compressedPath = compressPath(path, undefined, lastFullPath);
            attributeStatus = { ...attributeStatus, path: compressedPath.path };
            lastFullPath = compressedPath.lastFullPath;
        }
        return { hasFabricSensitiveData, attributeData, attributeStatus };
    });
}

/** Helper method to compress one path and preserve the state for the next path. */
function compressPath(
    path: TypeFromSchema<typeof TlvAttributePath>,
    dataVersion: number | undefined,
    lastFullPath: FullAttributePath | undefined,
): { path: TypeFromSchema<typeof TlvAttributePath>; lastFullPath?: FullAttributePath } {
    const { nodeId, endpointId, clusterId, attributeId } = path;

    // Should never happen but typing likes it better that way
    if (endpointId === undefined || clusterId === undefined || attributeId === undefined) {
        return { path, lastFullPath };
    }

    const newFullPath = {
        path: { ...path, enableTagCompression: undefined },
        lastFullPath: { nodeId, endpointId, clusterId, attributeId, dataVersion },
    };
    // We have no stored Full path, so we take this as starting point
    if (lastFullPath === undefined) {
        return newFullPath;
    }

    // When dataVersion differs we can't compress
    if (dataVersion !== undefined && dataVersion !== lastFullPath.dataVersion) {
        return newFullPath;
    }

    // Based on Specs in DataReports AttributeId and CLusterId SHALL always be present in the path
    let compressedElements = 0;
    // Assume we can compress elements in the path
    const compressedPath = { ...path, enableTagCompression: true };
    if (endpointId === lastFullPath.endpointId) {
        delete compressedPath.endpointId;
        compressedElements++;
    }
    if (nodeId === lastFullPath.nodeId && nodeId !== undefined) {
        // No need to count if undefined
        delete compressedPath.nodeId;
        compressedElements++;
    }

    // Nothing was compressed, so we use this as new full path
    if (compressedElements === 0) {
        return newFullPath;
    }

    return { path: compressedPath, lastFullPath };
}
