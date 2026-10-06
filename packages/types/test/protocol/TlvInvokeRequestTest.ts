/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterId } from "#datatype/ClusterId.js";
import { CommandId } from "#datatype/CommandId.js";
import { EndpointNumber } from "#datatype/EndpointNumber.js";
import { InvokeRequest, TlvInvokeRequest } from "#protocol/messages/TlvInvokeRequest.js";
import { TlvCommandData } from "#protocol/types/TlvCommandData.js";
import { TlvDelayReportData } from "#protocol/types/TlvDelayReportData.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvBoolean } from "#tlv/TlvBoolean.js";
import { TlvUInt8 } from "#tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "#tlv/TlvObject.js";
import { Bytes, UnexpectedDataError } from "@matter/general";

/** InvokeRequestMessage as a server that does not know DelayReportData decodes it. */
const TlvInvokeRequestWithoutDelayReportData = TlvObject({
    suppressResponse: TlvField(0, TlvBoolean),
    timedRequest: TlvField(1, TlvBoolean),
    invokeRequests: TlvField(2, TlvArray(TlvCommandData)),
    interactionModelRevision: TlvOptionalField(0xff, TlvUInt8),
});

const request: InvokeRequest = {
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        { commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x30), commandId: CommandId(0) } },
    ],
    delayReportData: { delayMinMs: 1000, delayJitterWindowMs: 1000 },
    interactionModelRevision: 12,
};

describe("TlvInvokeRequest", () => {
    it("encodes DelayReportDataIB with context tags 0 and 1", () => {
        expect(Bytes.toHex(TlvDelayReportData.encode({ delayMinMs: 200, delayJitterWindowMs: 500 }))).equals(
            "152400c82501f40118",
        );
    });

    it("round-trips DelayReportData in context tag 3", () => {
        const encoded = TlvInvokeRequest.encode(request);

        expect(Bytes.toHex(encoded)).contains("35032500e8032501e80318");
        expect(TlvInvokeRequest.decode(encoded)).deep.equals(request);
    });

    it("decodes a request without DelayReportData", () => {
        const { delayReportData: _, ...withoutDelay } = request;

        expect(TlvInvokeRequest.decode(TlvInvokeRequest.encode(withoutDelay))).deep.equals(withoutDelay);
    });

    it("decodes a missing DelayReportData field as 0", () => {
        expect(TlvDelayReportData.decode(Bytes.fromHex("152400c818"))).deep.equals({
            delayMinMs: 200,
            delayJitterWindowMs: 0,
        });
        expect(TlvDelayReportData.decode(Bytes.fromHex("1518"))).deep.equals({
            delayMinMs: 0,
            delayJitterWindowMs: 0,
        });
    });

    it("rejects DelayReportData that is not a structure", () => {
        const { delayReportData: _, ...withoutDelay } = request;
        const encoded = Bytes.toHex(TlvInvokeRequest.encode(withoutDelay));
        // Insert DelayReportData as an unsigned integer in context tag 3, before the InteractionModelRevision
        const malformed = encoded.replace("24ff0c18", "2403c824ff0c18");
        expect(malformed).not.equals(encoded);

        expect(() => TlvInvokeRequest.decode(Bytes.fromHex(malformed))).throws(UnexpectedDataError);
    });

    it("is skipped by a decoder that does not know the field", () => {
        const { delayReportData: _, ...withoutDelay } = request;

        expect(TlvInvokeRequestWithoutDelayReportData.decode(TlvInvokeRequest.encode(request))).deep.equals(
            withoutDelay,
        );
    });
});
