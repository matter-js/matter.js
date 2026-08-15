/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import { expect } from "chai";
import { convertWebsocketDataToMatter } from "../../src/ChipToolWebSocketHandler.js";

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
