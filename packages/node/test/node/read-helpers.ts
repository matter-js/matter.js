import { AccessLevel, Specification } from "@matter/model";
import { AttributeReadResponse, Read, ReadResult } from "@matter/protocol";
import { ClusterId, EndpointNumber } from "@matter/types";
import { MockServerNode } from "./mock-server-node.js";

export function readAttr(node: MockServerNode, ...args: Parameters<typeof Read>) {
    const request = Read(...args);

    if (!Read.containsAttribute(request)) {
        throw new Error("Expected an attribute request");
    }
    return readAttrRaw(node, request);
}

export async function readAttrRaw(node: MockServerNode, data: Partial<Read.Attributes>) {
    const request = {
        isFabricFiltered: false,
        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        ...data,
    } as Read.Attributes;
    if (!Read.containsAttribute(request)) {
        throw new Error("Expected an attribute request");
    }
    return node.online({ accessLevel: AccessLevel.Administer }, ({ context }) => {
        const response = new AttributeReadResponse(node.protocol, context);
        const data = [...response.process(request)];
        data.forEach(chunks => {
            if (Array.isArray(chunks)) {
                chunks.forEach(chunk => {
                    if ("tlv" in chunk) {
                        chunk.tlv = {};
                    }
                });
            }
        });
        return { data, counts: response.counts };
    });
}

/**
 * Wildcard read preserving TLV schemas (unlike readAttrRaw which clears them).
 */
export async function readAllAttrs(node: MockServerNode) {
    const request: Read.Attributes = {
        isFabricFiltered: false,
        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        attributeRequests: [{}],
    };
    return node.online({ accessLevel: AccessLevel.Administer }, ({ context }) => {
        const response = new AttributeReadResponse(node.protocol, context);
        const data = [...response.process(request)];
        return { data, counts: response.counts };
    });
}

export function countAttrs(chunks: ReadResult.Chunk[]) {
    const counts = {} as Record<EndpointNumber, Record<ClusterId, number>>;
    for (const chunk of chunks) {
        for (const report of chunk) {
            if (report.kind !== "attr-value") {
                throw new Error("Only attribute values expected");
            }
            const endpointCounts = (counts[report.path.endpointId] ??= {});
            endpointCounts[report.path.clusterId] ??= 0;
            endpointCounts[report.path.clusterId]++;
        }
    }
    return counts;
}
