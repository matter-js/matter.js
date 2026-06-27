/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InputChunk } from "#action/client/InputChunk.js";
import { ReadResult } from "#action/response/ReadResult.js";
import {
    AttributeId,
    ClusterId,
    DataReport,
    EndpointNumber,
    EventId,
    EventNumber,
    Status,
    TlvArray,
    TlvAttributeReport,
    TlvBoolean,
    TlvEventData,
    TlvInt32,
    TlvOfModel,
    TlvUInt32,
    TlvVoid,
    TypeFromSchema,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { OnOff } from "@matter/types/clusters/on-off";

const TlvStartUpEvent = TlvOfModel(BasicInformation.events.startUp);

function buildReport(input: Partial<DataReport>): DataReport {
    return {
        ...input,
    };
}

async function collect(report: DataReport, leftover?: TypeFromSchema<typeof TlvAttributeReport>[]) {
    const out = new Array<ReadResult.Report>();
    for await (const chunk of InputChunk(report, leftover)) out.push(chunk);
    return out;
}

describe("InputChunk", () => {
    describe("attributes", () => {
        it("yields one attr-value per fully-qualified path entry", async () => {
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: {
                                endpointId: EndpointNumber(0),
                                clusterId: ClusterId(BasicInformation.id),
                                attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                            },
                            dataVersion: 100,
                            data: TlvUInt32.encodeTlv(17),
                        },
                    },
                ],
            });

            const chunks = await collect(report);

            expect(chunks).deep.equal([
                {
                    kind: "attr-value",
                    path: {
                        nodeId: undefined,
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(BasicInformation.id),
                        attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                    },
                    tlv: chunks[0].kind === "attr-value" ? chunks[0].tlv : undefined,
                    value: 17,
                    version: 100,
                },
            ]);
        });

        it("preserves cross-path order (A.1, B.1, A.2, B.2 → same order out)", async () => {
            const vendorId = ClusterId(BasicInformation.id);
            const otherId = ClusterId(OnOff.id);
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: {
                                endpointId: EndpointNumber(0),
                                clusterId: vendorId,
                                attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                            },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(11),
                        },
                    },
                    {
                        attributeData: {
                            path: {
                                endpointId: EndpointNumber(1),
                                clusterId: otherId,
                                attributeId: AttributeId(OnOff.attributes.onOff.id),
                            },
                            dataVersion: 2,
                            data: TlvBoolean.encodeTlv(true),
                        },
                    },
                    {
                        attributeData: {
                            path: {
                                endpointId: EndpointNumber(0),
                                clusterId: vendorId,
                                attributeId: AttributeId(BasicInformation.attributes.vendorId.id),
                            },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(0xfff1),
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            const summary = chunks.map(c =>
                c.kind === "attr-value"
                    ? {
                          endpointId: c.path.endpointId,
                          clusterId: c.path.clusterId,
                          attributeId: c.path.attributeId,
                          value: c.value,
                      }
                    : null,
            );

            expect(summary).deep.equal([
                {
                    endpointId: EndpointNumber(0),
                    clusterId: vendorId,
                    attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                    value: 11,
                },
                {
                    endpointId: EndpointNumber(1),
                    clusterId: otherId,
                    attributeId: AttributeId(OnOff.attributes.onOff.id),
                    value: true,
                },
                {
                    endpointId: EndpointNumber(0),
                    clusterId: vendorId,
                    attributeId: AttributeId(BasicInformation.attributes.vendorId.id),
                    value: 0xfff1,
                },
            ]);
        });

        it("restores tag-compressed paths from the previous fully-qualified entry", async () => {
            const clusterId = ClusterId(BasicInformation.id);
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: {
                                endpointId: EndpointNumber(0),
                                clusterId,
                                attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                            },
                            dataVersion: 200,
                            data: TlvUInt32.encodeTlv(1),
                        },
                    },
                    {
                        attributeData: {
                            // Only attributeId given; endpoint/cluster/dataVersion inherit
                            path: {
                                enableTagCompression: true,
                                attributeId: AttributeId(BasicInformation.attributes.vendorId.id),
                            },
                            data: TlvUInt32.encodeTlv(0xfff1),
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks).has.length(2);
            const second = chunks[1];
            expect(second.kind).equal("attr-value");
            if (second.kind !== "attr-value") return;
            expect(second.path.endpointId).equal(EndpointNumber(0));
            expect(second.path.clusterId).equal(clusterId);
            expect(second.path.attributeId).equal(AttributeId(BasicInformation.attributes.vendorId.id));
            expect(second.value).equal(0xfff1);
            expect(second.version).equal(200);
        });

        it("emits attr-value then attr-status when a different-path status follows data", async () => {
            // Different paths → path change → flush data group, then status emits as its own chunk.
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.dataModelRevision.id);
            const statusAttrId = AttributeId(BasicInformation.attributes.vendorId.id);
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: attrId },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(7),
                        },
                    },
                    {
                        attributeStatus: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: statusAttrId },
                            status: { status: Status.UnsupportedAttribute },
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks.map(c => c.kind)).deep.equal(["attr-value", "attr-status"]);
            expect(chunks[1].kind === "attr-status" && chunks[1].status).equal(Status.UnsupportedAttribute);
        });

        it("keeps adjacent same-cluster different-attribute entries from being lumped", async () => {
            // Three attrs of the same cluster, interleaved data and status. Each entry has its own attribute path
            // → each flushes on path change, emitted in wire order. A status entry must not cause the next-path
            // data entry to be skipped or reordered.
            const clusterId = ClusterId(BasicInformation.id);
            const a1 = AttributeId(BasicInformation.attributes.dataModelRevision.id);
            const a2 = AttributeId(BasicInformation.attributes.vendorId.id);
            const a3 = AttributeId(BasicInformation.attributes.productId.id);
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: a1 },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(11),
                        },
                    },
                    {
                        attributeStatus: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: a2 },
                            status: { status: Status.UnsupportedAttribute },
                        },
                    },
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: a3 },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(33),
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks.map(c => c.kind)).deep.equal(["attr-value", "attr-status", "attr-value"]);
            const ids = chunks.map(c =>
                c.kind === "attr-value" || c.kind === "attr-status" ? c.path.attributeId : undefined,
            );
            expect(ids).deep.equal([a1, a2, a3]);
        });

        it("emits data and status for the same path in wire order", async () => {
            // Spec-pathological (data + status for the same attribute), but the streamer flushes on kind change
            // within a path so the output preserves wire order: value first, status second.
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.dataModelRevision.id);
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: attrId },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(5),
                        },
                    },
                    {
                        attributeStatus: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: attrId },
                            status: { status: Status.Failure },
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks.map(c => c.kind)).deep.equal(["attr-value", "attr-status"]);
        });

        it("stashes a chunked-array tail (listIndex entries) when moreChunkedMessages is set", async () => {
            // Initial value entry + listIndex=null append entry, same path. The append-action listIndex marks the
            // tail as chunked, so the whole group is stashed for the next report.
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.capabilityMinima.id);
            const basePath = { endpointId: EndpointNumber(0), clusterId, attributeId: attrId };

            const reportN = buildReport({
                moreChunkedMessages: true,
                attributeReports: [
                    {
                        attributeData: {
                            path: { ...basePath },
                            dataVersion: 5,
                            data: TlvUInt32.encodeTlv(1),
                        },
                    },
                    {
                        attributeData: {
                            path: { ...basePath, listIndex: null },
                            data: TlvUInt32.encodeTlv(2),
                        },
                    },
                ],
            });

            const leftover = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
            const chunksN = await collect(reportN, leftover);

            expect(chunksN).has.length(0);
            expect(leftover).has.length(2);
        });

        it("stashes a chunked-array tail (single array-typed initial value) when moreChunkedMessages is set", async () => {
            // Exercises the second branch of isChunkedArrayTail: single entry, no listIndex, but the TLV stream
            // starts with an Array container and carries >1 inner element. Matches the publisher pattern where the
            // first chunk of a multi-report list comes as the bare array.
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.capabilityMinima.id);
            const TlvU32Array = TlvArray(TlvUInt32);

            const reportN = buildReport({
                moreChunkedMessages: true,
                attributeReports: [
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: attrId },
                            dataVersion: 11,
                            data: TlvU32Array.encodeTlv([1, 2, 3]),
                        },
                    },
                ],
            });

            const leftover = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
            const chunksN = await collect(reportN, leftover);

            expect(chunksN).has.length(0);
            expect(leftover).has.length(1);
        });

        it("prepends leftover into the next call and clears the leftover buffer", async () => {
            // The leftover-merge step does not decode by itself, but we can verify the buffer flow: the next call
            // sees the prepended entries and drains the buffer regardless of what it then chooses to do with them.
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.capabilityMinima.id);
            const basePath = { endpointId: EndpointNumber(0), clusterId, attributeId: attrId };

            const leftover: TypeFromSchema<typeof TlvAttributeReport>[] = [
                { attributeData: { path: { ...basePath }, dataVersion: 5, data: TlvUInt32.encodeTlv(1) } },
                { attributeData: { path: { ...basePath, listIndex: null }, data: TlvUInt32.encodeTlv(2) } },
            ];

            // Final report — moreChunkedMessages false, leftover gets consumed.
            const reportFinal = buildReport({
                moreChunkedMessages: false,
                attributeReports: [],
            });
            await collect(reportFinal, leftover);

            expect(leftover).has.length(0);
        });

        it("flushes (not stashes) when moreChunkedMessages is false", async () => {
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.dataModelRevision.id);
            const report = buildReport({
                moreChunkedMessages: false,
                attributeReports: [
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: attrId },
                            dataVersion: 9,
                            data: TlvUInt32.encodeTlv(3),
                        },
                    },
                ],
            });

            const leftover = new Array<TypeFromSchema<typeof TlvAttributeReport>>();
            const chunks = await collect(report, leftover);
            expect(chunks).has.length(1);
            expect(leftover).has.length(0);
        });
    });

    describe("events", () => {
        it("preserves wire (EventNumber) order across interleaved event types (#3785)", async () => {
            // Mimic Generic-Switch-style alternating sequence on a single path:
            //   startUp(en=1), shutDown(en=2), startUp(en=3) → must come out in that exact order.
            const startUp = EventId(BasicInformation.events.startUp.id);
            const shutDown = EventId(BasicInformation.events.shutDown.id);
            const clusterId = ClusterId(BasicInformation.id);
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId, eventId: startUp },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId, eventId: shutDown },
                    eventNumber: EventNumber(2),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvVoid.encodeTlv(),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId, eventId: startUp },
                    eventNumber: EventNumber(3),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 3 }),
                },
            ];

            const report = buildReport({
                eventReports: data.map(eventData => ({ eventData })),
            });

            const chunks = await collect(report);
            expect(chunks).has.length(3);
            expect(chunks.map(c => (c.kind === "event-value" ? c.number : undefined))).deep.equal([
                EventNumber(1),
                EventNumber(2),
                EventNumber(3),
            ]);
            expect(chunks.map(c => (c.kind === "event-value" ? c.path.eventId : undefined))).deep.equal([
                startUp,
                shutDown,
                startUp,
            ]);
        });

        it("propagates the wire timestamp variant fields onto the chunk", async () => {
            // Publisher chose the systemTimestamp variant; only that field carries the value, the others stay
            // undefined. `timestamp` reflects the collapsed convenience.
            const eventId = EventId(BasicInformation.events.startUp.id);
            const clusterId = ClusterId(BasicInformation.id);
            const report = buildReport({
                eventReports: [
                    {
                        eventData: {
                            path: { endpointId: EndpointNumber(0), clusterId, eventId },
                            eventNumber: EventNumber(1),
                            priority: 1,
                            systemTimestamp: 1234,
                            data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks).has.length(1);
            const ev = chunks[0];
            expect(ev.kind).equal("event-value");
            if (ev.kind !== "event-value") return;
            expect(ev.systemTimestamp).equal(1234);
            expect(ev.epochTimestamp).equal(undefined);
            expect(ev.deltaEpochTimestamp).equal(undefined);
            expect(ev.deltaSystemTimestamp).equal(undefined);
            expect(ev.timestamp).equal(1234);
        });

        it("emits a single event-status chunk when both status and clusterStatus are set (B2 regression)", async () => {
            // clusterStatus is wire-typed as uint8 but the TLV schema uses the Status enum; cluster-specific codes
            // are not Status enum members, so cast to satisfy the (overly narrow) type.
            const clusterStatus = 42 as Status;
            const report = buildReport({
                eventReports: [
                    {
                        eventStatus: {
                            path: {
                                endpointId: EndpointNumber(0),
                                clusterId: ClusterId(BasicInformation.id),
                                eventId: EventId(BasicInformation.events.startUp.id),
                            },
                            status: { status: Status.Failure, clusterStatus },
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks).has.length(1);
            const only = chunks[0];
            expect(only.kind).equal("event-status");
            if (only.kind !== "event-status") return;
            expect(only.status).equal(Status.Failure);
            expect(only.clusterStatus).equal(clusterStatus);
        });
    });

    describe("ordering across attributes and events", () => {
        it("yields attributes first, then events (matches wire layout)", async () => {
            const clusterId = ClusterId(BasicInformation.id);
            const attrId = AttributeId(BasicInformation.attributes.dataModelRevision.id);
            const eventId = EventId(BasicInformation.events.startUp.id);
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: { endpointId: EndpointNumber(0), clusterId, attributeId: attrId },
                            dataVersion: 1,
                            data: TlvUInt32.encodeTlv(1),
                        },
                    },
                ],
                eventReports: [
                    {
                        eventData: {
                            path: { endpointId: EndpointNumber(0), clusterId, eventId },
                            eventNumber: EventNumber(1),
                            priority: 1,
                            epochTimestamp: 0,
                            data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks.map(c => c.kind)).deep.equal(["attr-value", "event-value"]);
        });
    });

    describe("relaxed integer type checks", () => {
        // dataModelRevision is an unsigned attribute; encode its value as a signed integer to mimic a non-compliant
        // device. Data report decode tolerates the mismatch so the entry is not dropped.
        it("decodes a signed-encoded value for an unsigned attribute", async () => {
            const report = buildReport({
                attributeReports: [
                    {
                        attributeData: {
                            path: {
                                endpointId: EndpointNumber(0),
                                clusterId: ClusterId(BasicInformation.id),
                                attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                            },
                            dataVersion: 1,
                            data: TlvInt32.encodeTlv(17),
                        },
                    },
                ],
            });

            const chunks = await collect(report);
            expect(chunks.length).equal(1);
            expect((chunks[0] as ReadResult.AttributeValue).value).equal(17);
        });
    });
});
