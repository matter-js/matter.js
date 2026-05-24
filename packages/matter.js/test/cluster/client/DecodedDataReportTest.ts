/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decodeDataReport } from "#cluster/client/DecodedDataReport.js";
import {
    AttributeId,
    ClusterId,
    DataReport,
    EndpointNumber,
    EventId,
    EventNumber,
    Status,
    TlvOfModel,
    TlvUInt32,
    TlvVoid,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";

const TlvStartUpEvent = TlvOfModel(BasicInformation.events.startUp);

function buildReport(input: Partial<DataReport>): DataReport {
    return { ...input };
}

describe("decodeDataReport", () => {
    it("decodes a single attribute into the legacy 4-array shape with resolved name", async () => {
        const report = buildReport({
            attributeReports: [
                {
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(BasicInformation.id),
                            attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
                        },
                        dataVersion: 17,
                        data: TlvUInt32.encodeTlv(1),
                    },
                },
            ],
        });

        const decoded = await decodeDataReport(report);

        expect(decoded.attributeReports).has.length(1);
        expect(decoded.attributeReports[0].path.attributeName).equal("dataModelRevision");
        expect(decoded.attributeReports[0].value).equal(1);
        expect(decoded.attributeReports[0].version).equal(17);
        expect(decoded.attributeStatus).equal(undefined);
    });

    it("preserves wire (EventNumber) order across interleaved event types (#3785 regression)", async () => {
        const startUp = EventId(BasicInformation.events.startUp.id);
        const shutDown = EventId(BasicInformation.events.shutDown.id);
        const clusterId = ClusterId(BasicInformation.id);
        const report = buildReport({
            eventReports: [
                {
                    eventData: {
                        path: { endpointId: EndpointNumber(0), clusterId, eventId: startUp },
                        eventNumber: EventNumber(1),
                        priority: 1,
                        epochTimestamp: 0,
                        data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                    },
                },
                {
                    eventData: {
                        path: { endpointId: EndpointNumber(0), clusterId, eventId: shutDown },
                        eventNumber: EventNumber(2),
                        priority: 1,
                        epochTimestamp: 0,
                        data: TlvVoid.encodeTlv(),
                    },
                },
                {
                    eventData: {
                        path: { endpointId: EndpointNumber(0), clusterId, eventId: startUp },
                        eventNumber: EventNumber(3),
                        priority: 1,
                        epochTimestamp: 0,
                        data: TlvStartUpEvent.encodeTlv({ softwareVersion: 3 }),
                    },
                },
            ],
        });

        const decoded = await decodeDataReport(report);

        expect(decoded.eventReports).has.length(3);
        expect(decoded.eventReports.map(r => r.events[0].eventNumber)).deep.equal([
            EventNumber(1),
            EventNumber(2),
            EventNumber(3),
        ]);
        expect(decoded.eventReports.map(r => r.path.eventId)).deep.equal([startUp, shutDown, startUp]);
        expect(decoded.eventReports.map(r => r.path.eventName)).deep.equal(["startUp", "shutDown", "startUp"]);
    });

    it("populates attributeStatus for failed attribute reads", async () => {
        const report = buildReport({
            attributeReports: [
                {
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(BasicInformation.id),
                            attributeId: AttributeId(BasicInformation.attributes.vendorId.id),
                        },
                        status: { status: Status.UnsupportedAttribute },
                    },
                },
            ],
        });

        const decoded = await decodeDataReport(report);

        expect(decoded.attributeReports).has.length(0);
        expect(decoded.attributeStatus).has.length(1);
        expect(decoded.attributeStatus![0].status).equal(Status.UnsupportedAttribute);
        expect(decoded.attributeStatus![0].path.attributeName).equal("vendorId");
    });
});
