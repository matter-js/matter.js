/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, UnexpectedDataError } from "@matter/main";
import type { CertNodeApi, CertNodeRef, CertStepContext, ControllerAdapter } from "@matter/testing";
import { LogFollower } from "@matter/testing";
import { expect } from "chai";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import type { ManualPairingCodeParts } from "../cert/tc-dd-support.js";
import {
    CommissioningRefusals,
    manualPairingCode,
    ON_NETWORK_ONLY,
    qrPayloadWith,
    qrPayloadWithPrefix,
} from "../cert/tc-dd-support.js";
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
            parseManualPairingCode: unused,
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

    it("does not accept a bare UnexpectedDataError, which commissioning raises after taking the payload", async () => {
        const cx = contextWith(() => Promise.reject(new UnexpectedDataError("Invalid response from device")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused")).rejectedWith(
            CertCheckFailedError,
            /unrelated reason/,
        );
    });

    it("fails on a rejection that says nothing about the payload", async () => {
        const cx = contextWith(() => Promise.reject(new InternalError("chip-tool produced no reply")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused")).rejectedWith(
            CertCheckFailedError,
            /unrelated reason/,
        );
    });

    it("does not accept chip-tool failing after it took the payload", async () => {
        const cx = contextWith(() => Promise.reject(new ChipToolCommandError("chip-tool commissioning failed")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused")).rejectedWith(
            CertCheckFailedError,
            /unrelated reason/,
        );
    });

    it("accepts a controller that marked the payload itself as refused", async () => {
        const cx = contextWith(() =>
            Promise.reject(new OnboardingPayloadRefusedError("chip-tool refused the payload")),
        );
        const refusals = new CommissioningRefusals(BUDGETS);

        await refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused");
        await refusals.settle(cx);
    });

    it("does not accept a payload refusal as proof that no device was there", async () => {
        // Otherwise a malformed generated code passes the step at ~1ms, having never reached discovery
        const cx = contextWith(() => Promise.reject(new OnboardingPayloadRefusedError("bad code")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(
            refusals.requireNoCommissioning(cx, { manualPairingCode: "749" }, "nothing commissioned", 100),
        ).rejectedWith(CertCheckFailedError, /unrelated reason/);
    });

    it("accepts any other failure when the claim is only that nothing was commissioned", async () => {
        // The wrong-discriminator step: the code is well formed, so the DUT fails for lack of a device
        const cx = contextWith(() => Promise.reject(new ChipToolCommandError("chip-tool commissioning failed")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await refusals.requireNoCommissioning(cx, { manualPairingCode: "749" }, "nothing commissioned", 100);
        await refusals.settle(cx);
    });

    it("fails when something was commissioned after all", async () => {
        const removed = new Array<CertNodeRef>();
        const cx = contextWith(
            () => Promise.resolve("unexpected-ref"),
            async ref => {
                removed.push(ref);
            },
        );
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(
            refusals.requireNoCommissioning(cx, { manualPairingCode: "749" }, "nothing commissioned", 100),
        ).rejectedWith(CertCheckFailedError);

        await refusals.settle(cx);
        expect(removed).deep.equal(["unexpected-ref"]);
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

        await expect(refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused")).rejectedWith(
            CertCheckFailedError,
        );

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

        await expect(refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused")).rejectedWith(
            CertCheckFailedError,
        );

        await expect(refusals.settle(cx)).rejectedWith(CertCleanupError, /stray-ref: node is unreachable/);
    });

    it("gives up on an attempt that never settles rather than holding the run open", async () => {
        const cx = contextWith(() => new Promise<CertNodeRef>(() => {}));
        const refusals = new CommissioningRefusals(BUDGETS);

        await expect(refusals.requireRefusal(cx, { qrPairingCode: "MT:whatever" }, "must be refused")).rejected;

        await expect(refusals.settle(cx)).rejectedWith(CertCleanupError, /still running/);
    });
});

describe("manualPairingCode", () => {
    /** devicediscovery.adoc TC-DD-3.17's own example device: discriminator 0xF00, passcode 20202021. */
    const PLAN_DEVICE = { vidPidPresent: true, discriminator: 0xf00, passcode: 20202021, vendorId: 0xfff1 };
    const PLAN_PRODUCT_ID = 0x8001;

    function planCode(overrides: Partial<ManualPairingCodeParts> = {}) {
        return manualPairingCode({ ...PLAN_DEVICE, productId: PLAN_PRODUCT_ID, ...overrides });
    }

    it("writes the plan's own example code", () => {
        expect(planCode()).equal("749701123365521327694");
    });

    it("writes the plan's own substituted codes", () => {
        expect(planCode({ futureFormat: true }), "version").equal("849701123365521327693");
        expect(planCode({ vidPidPresent: false }), "VID_PID_PRESENT").equal("349701123365521327696");
        expect(planCode({ discriminator: 0xe00 }), "short discriminator").equal("733317123365521327692");
        expect(planCode({ productId: 0 }), "product id").equal("749701123365521000006");
        expect(planCode({ checkDigit: 3 }), "check digit").equal("749701123365521327693");
    });

    it("writes the plan's own code for each forbidden passcode", () => {
        const expected: [passcode: number, code: string][] = [
            [0, "749152000065521327698"],
            [11111111, "751911067865521327698"],
            [22222222, "754670135665521327694"],
            [33333333, "757429203465521327699"],
            [44444444, "760188271265521327697"],
            [55555555, "762947339065521327695"],
            [66666666, "749322406965521327695"],
            [77777777, "752081474765521327697"],
            [88888888, "754840542565521327693"],
            [99999999, "757599610365521327695"],
            [12345678, "757678075365521327695"],
            [87654321, "765457534965521327696"],
        ];

        for (const [passcode, code] of expected) {
            expect(planCode({ passcode }), `passcode ${passcode}`).equal(code);
        }
    });

    it("writes the plan's own code for each test vendor id", () => {
        expect(planCode({ vendorId: 0xfff2 })).equal("749701123365522327692");
        expect(planCode({ vendorId: 0xfff3 })).equal("749701123365523327697");
        expect(planCode({ vendorId: 0xfff4 })).equal("749701123365524327693");
    });

    it("writes an 11-digit code when neither id is given", () => {
        expect(manualPairingCode({ vidPidPresent: false, discriminator: 0xf00, passcode: 20202021 })).length(11);
    });

    it("refuses a part that does not fit its field", () => {
        expect(() => manualPairingCode({ ...PLAN_DEVICE, productId: 0x10000 }), "productId").throw(InternalError);
        expect(() => manualPairingCode({ ...PLAN_DEVICE, productId: 1, discriminator: 0x1000 }), "disc").throw(
            InternalError,
        );
        expect(() => manualPairingCode({ ...PLAN_DEVICE, productId: 1, checkDigit: 10 }), "checkDigit").throw(
            InternalError,
        );
    });

    it("refuses one id without the other", () => {
        expect(() => manualPairingCode({ ...PLAN_DEVICE, productId: undefined })).throw(InternalError);
    });
});
