/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, UnexpectedDataError } from "@matter/general";
import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import { expect } from "chai";
import {
    chipJsonToMatter,
    matterToChipJson,
    parseChipJson,
    stringifyChipJson,
} from "../../src/chip-tool/json-codec.js";

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

const ELECTRICAL_POWER_MEASUREMENT = Matter.clusters.require("ElectricalPowerMeasurement");
const VOLTAGE_ATTRIBUTE = ELECTRICAL_POWER_MEASUREMENT.attributes.require("voltage");

const CARBON_DIOXIDE_CONCENTRATION = Matter.clusters.require("CarbonDioxideConcentrationMeasurement");
const MEASURED_VALUE_ATTRIBUTE = CARBON_DIOXIDE_CONCENTRATION.attributes.require("measuredValue");

const NODE_LABEL_ATTRIBUTE = BASIC_INFORMATION.attributes.require("nodeLabel");

const TIME_SYNCHRONIZATION = Matter.clusters.require("TimeSynchronization");
const UTC_TIME_ATTRIBUTE = TIME_SYNCHRONIZATION.attributes.require("utcTime");

describe("chip-tool json codec", () => {
    it("round-trips a uint16 attribute as a plain number", () => {
        expect(chipJsonToMatter(0xfff1, VENDOR_ID_ATTRIBUTE, BASIC_INFORMATION)).to.equal(0xfff1);
        expect(matterToChipJson(0xfff1, VENDOR_ID_ATTRIBUTE, BASIC_INFORMATION, "hex")).to.equal(0xfff1);
    });

    it("survives a uint64 value above Number.MAX_SAFE_INTEGER as a bigint and re-encodes it as unsigned", () => {
        const wireJson = '{"value":18446744073709551615}';
        expect(parseChipJson(wireJson)).to.deep.equal({ value: 18446744073709551615n });

        const matterValue = chipJsonToMatter(18446744073709551615n, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS);
        expect(matterValue).to.equal(18446744073709551615n);

        // chip-tool's own type inference is 32-bit, so a plain JSON number this large reaches the peer
        // as a float; the value goes back out in the `u:` form that states its type.
        const wireValue = matterToChipJson(matterValue, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex");
        expect(stringifyChipJson({ value: wireValue })).to.equal('{"value":"u:18446744073709551615"}');
    });

    it("leaves an unsigned value chip-tool already encodes as unsigned a plain number", () => {
        expect(matterToChipJson(0xffffffff, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex")).to.equal(0xffffffff);
        expect(matterToChipJson(0x100000000, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex")).to.equal("u:4294967296");
    });

    it("forces the signed encoding of every signed value chip-tool would not infer as signed", () => {
        // `isUInt()` is tried first and is 32-bit, so a signed field is mistyped in three ways: as an
        // unsigned element for anything from zero up, and as a float outside the 32-bit window.
        for (const [value, expected] of [
            [-9_000_000_000_000n, "s:-9000000000000"],
            [3_000_000_000, "s:3000000000"],
            [0, "s:0"],
            [1, "s:1"],
            [0x7fffffff, "s:2147483647"],
        ] as const) {
            expect(
                matterToChipJson(value, VOLTAGE_ATTRIBUTE, ELECTRICAL_POWER_MEASUREMENT, "hex"),
                `${value}`,
            ).to.equal(expected);
        }
    });

    it("leaves a signed value chip-tool already types correctly a plain number", () => {
        // Negative and no smaller than INT32_MIN is the only case its inference gets right.
        expect(matterToChipJson(-2_000_000, VOLTAGE_ATTRIBUTE, ELECTRICAL_POWER_MEASUREMENT, "hex")).to.equal(
            -2_000_000,
        );
        expect(matterToChipJson(-0x80000000, VOLTAGE_ATTRIBUTE, ELECTRICAL_POWER_MEASUREMENT, "hex")).to.equal(
            -0x80000000,
        );
    });

    it("states a float field's type, which chip-tool never infers from a whole number", () => {
        expect(matterToChipJson(2, MEASURED_VALUE_ATTRIBUTE, CARBON_DIOXIDE_CONCENTRATION, "hex")).to.equal("f:2");
        expect(matterToChipJson(2.5, MEASURED_VALUE_ATTRIBUTE, CARBON_DIOXIDE_CONCENTRATION, "hex")).to.equal("f:2.5");
    });

    it("carries the widest integer a Matter field can hold, which fits chip-tool's buffer exactly", () => {
        // 18446744073709551615 and -9223372036854775808 are both 20 characters, the most chip-tool
        // keeps of a prefixed value.
        expect(matterToChipJson(18446744073709551615n, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex")).to.equal(
            "u:18446744073709551615",
        );
        expect(
            matterToChipJson(-9223372036854775808n, VOLTAGE_ATTRIBUTE, ELECTRICAL_POWER_MEASUREMENT, "hex"),
        ).to.equal("s:-9223372036854775808");
    });

    it("refuses a float chip-tool's buffer would silently truncate", () => {
        // The largest finite double renders as 23 characters; chip-tool would keep 20 and parse a
        // well-formed number that is not this one.
        expect(() =>
            matterToChipJson(Number.MAX_VALUE, MEASURED_VALUE_ATTRIBUTE, CARBON_DIOXIDE_CONCENTRATION, "hex"),
        ).to.throw(ImplementationError, /characters/);

        // 21 characters, just past the budget, and computed so the literal keeps its precision.
        expect(() =>
            matterToChipJson(Math.PI * 1e-10, MEASURED_VALUE_ATTRIBUTE, CARBON_DIOXIDE_CONCENTRATION, "hex"),
        ).to.throw(ImplementationError);
    });

    it("refuses a non-integral value on an integer field, naming the field", () => {
        expect(() => matterToChipJson(1.5, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex")).to.throw(
            ImplementationError,
            /UpTime/,
        );
    });

    it("refuses a negative value on an unsigned field", () => {
        expect(() => matterToChipJson(-1, UP_TIME_ATTRIBUTE, GENERAL_DIAGNOSTICS, "hex")).to.throw(ImplementationError);
    });

    it("refuses a string chip-tool would read as a typed value rather than as a string", () => {
        for (const value of ["u:1", "s:1", "hex:ab", "f:1", "d:1"]) {
            expect(() => matterToChipJson(value, NODE_LABEL_ATTRIBUTE, BASIC_INFORMATION, "hex")).to.throw(
                ImplementationError,
            );
        }
        expect(matterToChipJson("living room", NODE_LABEL_ATTRIBUTE, BASIC_INFORMATION, "hex")).to.equal("living room");
    });

    it("forces the unsigned encoding of an epoch-us above 32 bits after subtracting the Matter epoch", () => {
        expect(matterToChipJson(1_600_000_000_000_000n, UTC_TIME_ATTRIBUTE, TIME_SYNCHRONIZATION, "hex")).to.equal(
            "u:653315200000000",
        );
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

    it("decodes an empty octet string with no prefix as an empty byte array, and encodes back with a prefix", () => {
        const decoded = chipJsonToMatter("", LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING);
        expect(Bytes.isBytes(decoded) && Bytes.toHex(decoded)).to.equal("");

        expect(matterToChipJson(decoded, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING, "hex")).to.equal("hex:");
        expect(matterToChipJson(decoded, LAST_NETWORK_ID_ATTRIBUTE, NETWORK_COMMISSIONING, "base64")).to.equal(
            "base64:",
        );
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
