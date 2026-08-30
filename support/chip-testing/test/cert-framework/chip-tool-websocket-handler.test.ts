/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    DataReadError,
    ImplementationError,
    InternalError,
    NotImplementedError,
    UnexpectedDataError,
} from "@matter/main";
import { Status, StatusResponseError } from "@matter/main/types";
import { Matter } from "@matter/model";
import { expect } from "chai";
import {
    convertWebsocketDataToMatter,
    discoveryIdentifierFor,
    discoveryResponseFor,
    failureResponseFor,
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

describe("discoveryIdentifierFor", () => {
    it("asks for the device each command names", () => {
        expect(discoveryIdentifierFor("find-commissionable-by-long-discriminator", "3840")).deep.equal({
            longDiscriminator: 3840,
        });
        expect(discoveryIdentifierFor("find-commissionable-by-short-discriminator", "15")).deep.equal({
            shortDiscriminator: 15,
        });
        expect(discoveryIdentifierFor("find-commissionable-by-device-type", "257")).deep.equal({ deviceType: 257 });
        expect(discoveryIdentifierFor("find-commissionable-by-vendor-id", "65521")).deep.equal({ vendorId: 65521 });
    });

    it("asks for any device where the command names none", () => {
        expect(discoveryIdentifierFor("find-commissionable-by-commissioning-mode", "")).deep.equal({});
        expect(discoveryIdentifierFor("commissionables", "")).deep.equal({});
    });

    it("takes a vendor id the specification reserves, rather than throwing before the command is answered", () => {
        // The step is asking what discovery answers for such an id; validating here would escape the
        // handler's own error path
        expect(discoveryIdentifierFor("find-commissionable-by-vendor-id", "65535")).deep.equal({ vendorId: 65535 });
        expect(discoveryIdentifierFor("find-commissionable-by-vendor-id", "not-a-number")).deep.equal({
            vendorId: NaN,
        });
    });

    it("refuses a discovery command it does not know", () => {
        expect(() => discoveryIdentifierFor("find-commissionable-by-nothing", "1")).throw(ImplementationError);
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

    it("refuses a payload it cannot read rather than answering the success shape, keeping the cause", () => {
        let raised: unknown;
        try {
            parseWritePayload("{not json", "write of x.y");
        } catch (e) {
            raised = e;
        }
        if (!(raised instanceof ImplementationError)) {
            throw new InternalError(`Expected an ImplementationError, got ${raised}`);
        }
        expect(raised.message).contains("write of x.y");
        expect(raised.cause).instanceOf(SyntaxError);
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

    it("leaves the DataReadError a truncated device message raises alone", () => {
        expect(isOwnFailure(new DataReadError("Read of 4 bytes at offset 0 exceeds the 2 byte buffer"))).equal(false);
    });
});

describe("failureResponseFor", () => {
    it("gives the bare failure a refusing device gives, which the corpus expects", () => {
        expect(failureResponseFor(new UnexpectedDataError("the device answered something else"))).deep.equal({
            results: [{ error: "FAILURE" }],
        });
    });

    it("does not spell a fault of this shim the same way", () => {
        expect(failureResponseFor(new ImplementationError("missing argument")).results[0].error).contains(
            "Test harness failure",
        );
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
