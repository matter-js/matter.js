/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, InternalError, NotImplementedError, UnexpectedDataError } from "@matter/main";
import { Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import { expect } from "chai";
import {
    convertWebsocketDataToMatter,
    discoveryResponseFor,
    isOwnFailure,
    ownFailureResponse,
    parseWritePayload,
} from "../../src/ChipToolWebSocketHandler.js";

const NETWORK_COMMISSIONING = Matter.clusters.require("NetworkCommissioning");
const LAST_NETWORK_ID_ATTRIBUTE = NETWORK_COMMISSIONING.attributes.require("lastNetworkID");

describe("ChipToolWebSocketHandler convertWebsocketDataToMatter octet strings", () => {
    it("decodes an empty string with no prefix as an empty byte array", () => {
        const decoded = convertWebsocketDataToMatter("", LAST_NETWORK_ID_ATTRIBUTE);
        expect(Bytes.isBytes(decoded) && Bytes.toHex(decoded)).to.equal("");
    });

    it("still decodes a hex: prefixed string as bytes", () => {
        const bytes = Bytes.fromHex("0102030405");
        const decoded = convertWebsocketDataToMatter(`hex:${Bytes.toHex(bytes)}`, LAST_NETWORK_ID_ATTRIBUTE);
        expect(Bytes.isBytes(decoded) && Bytes.toHex(decoded)).to.equal(Bytes.toHex(bytes));
    });

    it("decodes a base64: prefixed string as bytes", () => {
        const bytes = Bytes.fromHex("0102030405");
        const decoded = convertWebsocketDataToMatter(`base64:${Bytes.toBase64(bytes)}`, LAST_NETWORK_ID_ATTRIBUTE);
        expect(Bytes.isBytes(decoded) && Bytes.toHex(decoded)).to.equal(Bytes.toHex(bytes));
    });

    it("leaves a non-empty unprefixed string unchanged", () => {
        const decoded = convertWebsocketDataToMatter("not-a-prefix-abcd", LAST_NETWORK_ID_ATTRIBUTE);
        expect(decoded).to.equal("not-a-prefix-abcd");
    });
});

describe("discoveryResponseFor", () => {
    // One entry of the shape `LegacyControllerCommandHandler.handleDiscovery` builds; the values are this
    // test's own
    const device = {
        value: {
            commissioningMode: 1,
            deviceName: "",
            deviceType: 0,
            hostName: "B0FFFF00FF00",
            instanceName: "0123456789ABCDEF",
            longDiscriminator: 3840,
            numIPs: 1,
            pairingHint: -1,
            pairingInstruction: "",
            port: 5540,
            productId: 32769,
            rotatingId: "",
            rotatingIdLen: 0,
            shortDiscriminator: 15,
            vendorId: 65521,
            supportsTcpServer: false,
            supportsTcpClient: false,
        },
    };

    it("hands the runner what discovery found", () => {
        expect(discoveryResponseFor([device], "find-commissionable-by-long-discriminator")).deep.equal({
            results: [device],
        });
    });

    it("fails the command when discovery found nothing, which the empty result would report as success", () => {
        expect(discoveryResponseFor([], "find-commissionable-by-long-discriminator")).deep.equal({
            results: [{ error: "FAILURE" }],
        });
    });
});

describe("parseWritePayload", () => {
    it("reads the payload a step handed over", () => {
        expect(parseWritePayload('{"a":1}', "write of x.y")).deep.equal({ a: 1 });
    });

    it("refuses a payload it cannot read rather than answering the success shape", () => {
        expect(() => parseWritePayload("{not json", "write of x.y")).throw(ImplementationError, /write of x\.y/);
    });
});

describe("isOwnFailure", () => {
    it("claims this shim's own faults", () => {
        expect(isOwnFailure(new ImplementationError("missing argument"))).equal(true);
        expect(isOwnFailure(new InternalError("cannot happen"))).equal(true);
        expect(isOwnFailure(new NotImplementedError("no handler for this command"))).equal(true);
        expect(isOwnFailure(new TypeError("cluster is undefined"))).equal(true);
    });

    it("claims a SyntaxError, which is how a step's own malformed argument arrives", () => {
        // JSON.parse in parseChipJSON and BigInt in parseNumber both raise one inside a handler's try
        let raised: unknown;
        try {
            JSON.parse("{not json");
        } catch (e) {
            raised = e;
        }
        expect(isOwnFailure(raised)).equal(true);
    });

    it("claims one of ours that arrived wrapped", () => {
        expect(isOwnFailure(new Error("while writing", { cause: new ImplementationError("missing argument") }))).equal(
            true,
        );
    });

    it("leaves an answer the device gave, or a device it could not reach, to the FAILURE the runner expects", () => {
        expect(isOwnFailure(new StatusResponseError("refused", Status.UnsupportedAttribute))).equal(false);
        expect(isOwnFailure(new UnexpectedDataError("the device answered something else"))).equal(false);
    });

    it("leaves a RangeError alone, which a truncated device message raises through DataReader", () => {
        expect(isOwnFailure(new RangeError("Offset is outside the bounds of the DataView"))).equal(false);
    });
});

describe("ownFailureResponse", () => {
    it("names the failure and fails the command", () => {
        expect(ownFailureResponse(new ImplementationError("missing argument"))).deep.equal({
            results: [{ error: "Test harness failure — ImplementationError: missing argument" }, { error: "FAILURE" }],
        });
    });

    it("names an error even where the failure carries no text of its own", () => {
        // A falsy error entry is no error at all to the runner, so neither an Error without a message nor
        // a thrown empty string may produce one
        expect(ownFailureResponse(new InternalError("")).results[0].error).equal(
            "Test harness failure — InternalError: ",
        );
        expect(ownFailureResponse("").results[0].error).equal("Test harness failure — no message");
    });
});
