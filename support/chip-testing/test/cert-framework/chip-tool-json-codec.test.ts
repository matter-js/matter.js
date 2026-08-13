/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "@matter/general";
import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import {
    chipJsonToMatter,
    matterToChipJson,
    parseChipJson,
    stringifyChipJson,
} from "../../src/chip-tool/json-codec.js";
import { expect } from "chai";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const VENDOR_ID_ATTRIBUTE = BASIC_INFORMATION.attributes.require("vendorId");

const GENERAL_DIAGNOSTICS = Matter.clusters.require("GeneralDiagnostics");
const UP_TIME_ATTRIBUTE = GENERAL_DIAGNOSTICS.attributes.require("upTime");

const OPERATIONAL_CREDENTIALS = Matter.clusters.require("OperationalCredentials");
const FABRICS_ATTRIBUTE = OPERATIONAL_CREDENTIALS.attributes.require("fabrics");
const FABRIC_DESCRIPTOR = FABRICS_ATTRIBUTE.members.require("entry");
const FABRIC_INDEX_ID = FABRIC_DESCRIPTOR.members.require("fabricIndex").id;
const NODE_ID_ID = FABRIC_DESCRIPTOR.members.require("nodeId").id;
const LABEL_ID = FABRIC_DESCRIPTOR.members.require("label").id;

const NETWORK_COMMISSIONING = Matter.clusters.require("NetworkCommissioning");
const LAST_NETWORK_ID_ATTRIBUTE = NETWORK_COMMISSIONING.attributes.require("lastNetworkID");

const BOOLEAN_STATE_CONFIGURATION = Matter.clusters.require("BooleanStateConfiguration");
const ALARMS_ACTIVE_ATTRIBUTE = BOOLEAN_STATE_CONFIGURATION.attributes.require("alarmsActive");

const ACCESS_CONTROL = Matter.clusters.require("AccessControl");
const ACCESS_CONTROL_FEATURE_MAP_ATTRIBUTE = ACCESS_CONTROL.attributes.require("featureMap");

const WINDOW_COVERING = Matter.clusters.require("WindowCovering");
const OPERATIONAL_STATUS_ATTRIBUTE = WINDOW_COVERING.attributes.require("operationalStatus");

const THERMOSTAT = Matter.clusters.require("Thermostat");
const SETPOINT_CHANGE_SOURCE_TIMESTAMP_ATTRIBUTE = THERMOSTAT.attributes.require("setpointChangeSourceTimestamp");

const TIME_SYNCHRONIZATION = Matter.clusters.require("TimeSynchronization");
const UTC_TIME_ATTRIBUTE = TIME_SYNCHRONIZATION.attributes.require("utcTime");

describe("chip-tool json codec", () => {
    it("round-trips a uint16 attribute as a plain number", () => {
        expect(chipJsonToMatter(0xfff1, VENDOR_ID_ATTRIBUTE, BASIC_INFORMATION)).to.equal(0xfff1);
        expect(matterToChipJson(0xfff1, VENDOR_ID_ATTRIBUTE, BASIC_INFORMATION, "hex")).to.equal(0xfff1);
    });

    it("survives a uint64 value above Number.MAX_SAFE_INTEGER as a bigint and re-encodes losslessly", () => {
        const wireJson = '{"value":18446744073709551615}';
        expect(parseChipJson(wireJson)).to.deep.equal({ value: 18446744073709551615n });

        const matterValue = chipJsonToMatter(18446744073709551615n, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS);
        expect(matterValue).to.equal(18446744073709551615n);

        const wireValue = matterToChipJson(matterValue, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex");
        expect(stringifyChipJson({ value: wireValue })).to.equal(wireJson);
    });

    it("round-trips a negative int64 value below Number.MIN_SAFE_INTEGER as a bigint, losslessly", () => {
        const wireJson = '{"value":-18446744073709551615}';
        expect(parseChipJson(wireJson)).to.deep.equal({ value: -18446744073709551615n });
        expect(stringifyChipJson({ value: -18446744073709551615n })).to.equal(wireJson);
    });

    it("decodes a struct from numeric-id keys and encodes it back", () => {
        const wire = { [FABRIC_INDEX_ID]: 1, [NODE_ID_ID]: 112233, [LABEL_ID]: "th1" };

        const matterValue = chipJsonToMatter(wire, FABRIC_DESCRIPTOR, OPERATIONAL_CREDENTIALS);
        expect(matterValue).to.deep.equal({ fabricIndex: 1, nodeId: 112233, label: "th1" });

        expect(matterToChipJson(matterValue, FABRIC_DESCRIPTOR, OPERATIONAL_CREDENTIALS, "hex")).to.deep.equal(wire);
    });

    it("round-trips a list of structs", () => {
        const wireEntry = { [FABRIC_INDEX_ID]: 1, [NODE_ID_ID]: 112233, [LABEL_ID]: "th1" };
        const wireList = [wireEntry];

        const matterValue = chipJsonToMatter(wireList, FABRICS_ATTRIBUTE, OPERATIONAL_CREDENTIALS);
        expect(matterValue).to.deep.equal([{ fabricIndex: 1, nodeId: 112233, label: "th1" }]);

        expect(matterToChipJson(matterValue, FABRICS_ATTRIBUTE, OPERATIONAL_CREDENTIALS, "hex")).to.deep.equal(
            wireList,
        );
    });

    it("decodes an octet string from base64: and encodes to hex: or base64: per option", () => {
        const bytes = Bytes.fromHex("0102030405");
        const wireBase64 = `base64:${Bytes.toBase64(bytes)}`;

        const decoded = chipJsonToMatter(wireBase64, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING);
        expect(Bytes.isBytes(decoded) && Bytes.toHex(decoded)).to.equal(Bytes.toHex(bytes));

        expect(matterToChipJson(decoded, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING, "hex")).to.equal(
            `hex:${Bytes.toHex(bytes)}`,
        );
        expect(matterToChipJson(decoded, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING, "base64")).to.equal(
            wireBase64,
        );
    });

    it("also decodes an octet string from hex:, the form CustomArgument accepts on input", () => {
        const bytes = Bytes.fromHex("0102030405");
        const decoded = chipJsonToMatter(`hex:${Bytes.toHex(bytes)}`, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING);
        expect(Bytes.isBytes(decoded) && Bytes.toHex(decoded)).to.equal(Bytes.toHex(bytes));
    });

    it("rejects an octet string with neither a base64: nor a hex: prefix", () => {
        expect(() => chipJsonToMatter("not-a-prefix:abcd", LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING)).to.throw(
            UnexpectedDataError,
        );
    });

    it("decodes a bitmap from a number into per-flag booleans and encodes back to the same number", () => {
        const decoded = chipJsonToMatter(0b01, ALARMS_ACTIVE_ATTRIBUTE, BOOLEAN_STATE_CONFIGURATION);
        expect(decoded).to.deep.equal({ visual: true, audible: false });

        expect(matterToChipJson(decoded, ALARMS_ACTIVE_ATTRIBUTE, BOOLEAN_STATE_CONFIGURATION, "hex")).to.equal(0b01);
    });

    it("masks a multi-bit bitmap field to its declared width on encode", () => {
        // Lift is a 2-bit field (bits 2-3); an out-of-range 0b111 must not bleed into Tilt's bits.
        const wire = matterToChipJson(
            { global: 0, lift: 0b111, tilt: 0 },
            OPERATIONAL_STATUS_ATTRIBUTE,
            WINDOW_COVERING,
            "hex",
        );
        expect(wire).to.equal(0b001100);
    });

    it("resolves a FeatureMap bit by its short property name as well as its title, on encode", () => {
        const decoded = chipJsonToMatter(0b001, ACCESS_CONTROL_FEATURE_MAP_ATTRIBUTE, ACCESS_CONTROL);
        expect(decoded).to.deep.equal({ extension: true, managedDevice: false, auxiliary: false });

        expect(matterToChipJson({ exts: true }, ACCESS_CONTROL_FEATURE_MAP_ATTRIBUTE, ACCESS_CONTROL, "hex")).to.equal(
            0b001,
        );
    });

    it("round-trips an epoch-s attribute, applying the matter epoch offset", () => {
        expect(chipJsonToMatter(0, SETPOINT_CHANGE_SOURCE_TIMESTAMP_ATTRIBUTE, THERMOSTAT)).to.equal(946684800);
        expect(matterToChipJson(946684800, SETPOINT_CHANGE_SOURCE_TIMESTAMP_ATTRIBUTE, THERMOSTAT, "hex")).to.equal(0);
    });

    it("round-trips an epoch-us attribute as a bigint, applying the matter epoch offset", () => {
        expect(chipJsonToMatter(0n, UTC_TIME_ATTRIBUTE, TIME_SYNCHRONIZATION)).to.equal(946684800000000n);
        expect(matterToChipJson(946684800000000n, UTC_TIME_ATTRIBUTE, TIME_SYNCHRONIZATION, "hex")).to.equal(0n);
    });

    it("passes null through both directions for a nullable attribute", () => {
        expect(chipJsonToMatter(null, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING)).to.equal(null);
        expect(matterToChipJson(null, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING, "hex")).to.equal(null);
    });

    describe("parseChipJson / stringifyChipJson", () => {
        it("parses an integer above Number.MAX_SAFE_INTEGER as a bigint", () => {
            expect(parseChipJson('{"value": 18446744073709551000}')).to.deep.equal({
                value: 18446744073709551000n,
            });
        });

        it("stringifies that bigint as an unquoted integer literal", () => {
            const result = stringifyChipJson({ value: 18446744073709551000n });
            expect(result).to.equal('{"value":18446744073709551000}');
            expect(result).to.not.include('"18446744073709551000"');
        });
    });
});
