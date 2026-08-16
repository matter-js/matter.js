/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { expect } from "chai";
import { qrPayloadWith, qrPayloadWithPrefix } from "../cert/tc-dd-support.js";

/**
 * `devicediscovery.adoc`'s own example payload for TC-DD-3.14: vendor id 0xFFF1, product id 0x8001,
 * custom commissioning flow, OnNetwork discovery, discriminator 0xF00, passcode 20202021.
 */
const PLAN_PAYLOAD = "MT:-24J029Q00KA0648G00";

/** The payloads the plan itself expects for each substitution, keyed by what it substituted. */
const PLAN_INVALID_PASSCODE_PAYLOADS: [passcode: number, payload: string][] = [
    [0, "MT:-24J029Q00OC0000000"],
    [11111111, "MT:-24J029Q00KMSP0Z800"],
    [22222222, "MT:-24J029Q00GWID1WH00"],
    [33333333, "MT:-24J029Q00C4912TQ00"],
    [44444444, "MT:-24J029Q008E.Q2QZ00"],
    [55555555, "MT:-24J029Q004ORE3N610"],
    [66666666, "MT:-24J029Q000YH24KF10"],
    [77777777, "MT:-24J029Q00Y58S4HO10"],
    [88888888, "MT:-24J029Q00UF-F5EX10"],
    [99999999, "MT:-24J029Q00QPQ36B420"],
    [12345678, "MT:-24J029Q004QG46Y900"],
    [87654321, "MT:-24J029Q00YX018EW10"],
];

describe("qrPayloadWith", () => {
    it("substitutes the version the plan's own example payload does", () => {
        expect(qrPayloadWith(PLAN_PAYLOAD, { version: 0b010 })).equal("MT:034J029Q00KA0648G00");
    });

    it("substitutes each forbidden passcode the plan's own example payloads do", () => {
        for (const [passcode, expected] of PLAN_INVALID_PASSCODE_PAYLOADS) {
            expect(qrPayloadWith(PLAN_PAYLOAD, { passcode })).equal(expected, `passcode ${passcode}`);
        }
    });

    it("leaves every other field where it was", () => {
        expect(qrPayloadWith(PLAN_PAYLOAD, {})).equal(PLAN_PAYLOAD);
    });

    it("carries appended TLV data through", () => {
        // The plan payload with § 5.1.5's own example TLV: serial number "1234567890" under tag 0x00
        const withTlv = "MT:-24J029Q00KA064IJ3P0IXZB0DK5N1K8SQ1RYCU1-A40";

        expect(qrPayloadWith(withTlv, { passcode: 12345678 })).equal("MT:-24J029Q004QG466D3P0IXZB0DK5N1K8SQ1RYCU1-A40");
    });

    it("refuses a code that is not a QR onboarding payload", () => {
        expect(() => qrPayloadWith("34970112336552132769", { version: 2 })).throw(InternalError);
    });

    it("refuses a value too wide for the field it substitutes", () => {
        expect(() => qrPayloadWith(PLAN_PAYLOAD, { version: 0b1000 })).throw(InternalError);
        expect(() => qrPayloadWith(PLAN_PAYLOAD, { passcode: 2 ** 27 })).throw(InternalError);
    });
});

describe("qrPayloadWithPrefix", () => {
    it("substitutes the prefix the plan's own example payload does", () => {
        expect(qrPayloadWithPrefix(PLAN_PAYLOAD, "AB:")).equal("AB:-24J029Q00KA0648G00");
    });

    it("refuses a code that is not a QR onboarding payload", () => {
        expect(() => qrPayloadWithPrefix("34970112336552132769", "AB:")).throw(InternalError);
    });
});
