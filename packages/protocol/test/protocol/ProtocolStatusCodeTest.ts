/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProtocolStatusMessage, ProtocolStatusMessageSchema } from "#protocol/index.js";
import { Bytes } from "@matter/general";
import { BDX_PROTOCOL_ID, BdxStatusCode, GeneralStatusCode, VendorId } from "@matter/types";

class NumberProtocolStatusMessageSchema extends ProtocolStatusMessageSchema<ProtocolStatusMessage<number>> {}

/** Validate ProtocolStatusMessageSchema with examples from Matter Specs */
describe("ProtocolStatusCode", () => {
    it("Encodes and decodes without protocol data", () => {
        const schema = new NumberProtocolStatusMessageSchema(BDX_PROTOCOL_ID, false);
        const encoded = schema.encode({
            generalStatus: GeneralStatusCode.Failure,
            protocolStatus: BdxStatusCode.StartOffsetNotSupported,
        });
        expect(Bytes.toHex(encoded)).equal("0100020000005200");

        const decoded = schema.decode(encoded);
        expect(decoded.generalStatus).equal(GeneralStatusCode.Failure);
        expect(decoded.protocolId).equal(BDX_PROTOCOL_ID);
        expect(decoded.vendorId).equal(VendorId(0));
        expect(decoded.protocolStatus).equal(BdxStatusCode.StartOffsetNotSupported);
        expect(decoded.protocolData).to.be.undefined;
    });

    it("Encodes and decodes vendor specific without protocol data", () => {
        const schema = new NumberProtocolStatusMessageSchema({ protocolId: 0xaabb, vendorId: VendorId(0xfff1) }, false);
        const encoded = schema.encode({
            generalStatus: GeneralStatusCode.Success,
            protocolStatus: 0,
        });
        expect(Bytes.toHex(encoded)).equal("0000bbaaf1ff0000");

        const decoded = schema.decode(encoded);
        expect(decoded.generalStatus).equal(GeneralStatusCode.Success);
        expect(decoded.protocolId).equal(0xaabb);
        expect(decoded.vendorId).equal(VendorId(0xfff1));
        expect(decoded.protocolStatus).equal(0);
        expect(decoded.protocolData).to.be.undefined;
    });

    it("Encodes and decodes vendor specific with protocol data", () => {
        const schema = new NumberProtocolStatusMessageSchema({ protocolId: 0xaabb, vendorId: VendorId(0xfff1) }, true);
        const encoded = schema.encode({
            generalStatus: GeneralStatusCode.Failure,
            protocolStatus: 9921,
            protocolData: Bytes.fromHex("5566eeff"),
        });
        expect(Bytes.toHex(encoded)).equal("0100bbaaf1ffc1265566eeff");

        const decoded = schema.decode(encoded);
        expect(decoded.generalStatus).equal(GeneralStatusCode.Failure);
        expect(decoded.protocolId).equal(0xaabb);
        expect(decoded.vendorId).equal(VendorId(0xfff1));
        expect(decoded.protocolStatus).equal(9921);
        expect(Bytes.toHex(decoded.protocolData!)).equal("5566eeff");
    });
});
