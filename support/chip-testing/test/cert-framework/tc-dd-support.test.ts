/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, UnexpectedDataError } from "@matter/main";
import type { CertNodeApi, CertNodeRef, CertStepContext, ControllerAdapter } from "@matter/testing";
import { LogFollower } from "@matter/testing";
import { expect } from "chai";
import { CommissioningRefusals, ON_NETWORK_ONLY, qrPayloadWith, qrPayloadWithPrefix } from "../cert/tc-dd-support.js";
import { CertCheckFailedError, CertCleanupError } from "../cert/tc-support.js";

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

    it("substitutes the discovery capabilities, which is what makes a BLE-only TH testable", () => {
        // chip-all-clusters-app's own payload, whose bitmask is BLE alone
        expect(qrPayloadWith("MT:-24J042C00KA0648G00", { discoveryCapabilities: ON_NETWORK_ONLY })).equal(
            "MT:-24J0AFN00KA0648G00",
        );
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

    it("refuses a value the bitwise operators would coerce", () => {
        expect(() => qrPayloadWith(PLAN_PAYLOAD, { version: 1.5 })).throw(InternalError);
        expect(() => qrPayloadWith(PLAN_PAYLOAD, { passcode: NaN })).throw(InternalError);
        expect(() => qrPayloadWith(PLAN_PAYLOAD, { version: -1 })).throw(InternalError);
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

describe("CommissioningRefusals", () => {
    const BUDGETS = { refusalTimeoutMs: 100, settleTimeoutMs: 100 };

    function contextWith(
        commission: () => Promise<CertNodeRef>,
        decommission: (ref: CertNodeRef) => Promise<void> = async () => {},
    ): CertStepContext {
        const unused = () => Promise.reject(new InternalError("not used by these tests"));
        const noLines = async function* (): AsyncGenerator<string> {};

        const nodeFor = (ref: CertNodeRef) =>
            ({
                invoke: unused,
                invokeBatch: unused,
                readAttribute: unused,
                readAttributes: unused,
                writeAttribute: unused,
                writeAttributes: unused,
                subscribe: unused,
                readEvents: unused,
                subscribeEvents: unused,
                openCommissioningWindow: unused,
                operationalMdnsInstanceName: unused,
                decommission: () => decommission(ref),
            }) satisfies CertNodeApi;

        const dut = {
            id: "dut",
            log: new LogFollower(noLines(), "dut"),
            async start() {},
            async close() {},
            commission,
            parseQrPayload: unused,
            node: nodeFor,
        } satisfies ControllerAdapter;

        return {
            controllers: { dut },
            devices: {},
            recorder: {
                beginStep() {},
                check() {},
                endStep() {
                    return [];
                },
                async flush() {
                    return "";
                },
            },
        };
    }

    it("passes when the controller refuses the payload itself", async () => {
        const cx = contextWith(() => Promise.reject(new UnexpectedDataError("Invalid passcode 0")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await refusals.requireRefusal(cx, "MT:whatever", "must be refused");
        await refusals.settle(cx);
    });

    it("fails on a rejection that says nothing about the payload", async () => {
        const cx = contextWith(() => Promise.reject(new InternalError("chip-tool produced no reply")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, "MT:whatever", "must be refused")).rejectedWith(
            CertCheckFailedError,
            /unrelated reason/,
        );
    });

    it("removes the fabric of a commissioning that succeeded after its own budget expired", async () => {
        let finish: (ref: CertNodeRef) => void = () => {};
        const removed = new Array<CertNodeRef>();
        const cx = contextWith(
            () => new Promise<CertNodeRef>(resolve => (finish = resolve)),
            async ref => {
                removed.push(ref);
            },
        );
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, "MT:whatever", "must be refused")).rejectedWith(CertCheckFailedError);

        // On a macrotask, so a settle() that did not actually wait returns with nothing to remove
        const settling = refusals.settle(cx);
        setTimeout(() => finish("late-ref"), 20);
        await settling;

        expect(removed).deep.equal(["late-ref"]);
    });

    it("reports a stray fabric it could not remove", async () => {
        const cx = contextWith(
            () => Promise.resolve("stray-ref"),
            async () => {
                throw new InternalError("node is unreachable");
            },
        );
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, "MT:whatever", "must be refused")).rejectedWith(CertCheckFailedError);

        await expect(refusals.settle(cx)).rejectedWith(CertCleanupError, /stray-ref: node is unreachable/);
    });

    it("gives up on an attempt that never settles rather than holding the run open", async () => {
        const cx = contextWith(() => new Promise<CertNodeRef>(() => {}));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, "MT:whatever", "must be refused")).rejected;

        await expect(refusals.settle(cx)).rejectedWith(CertCleanupError, /still running/);
    });
});
