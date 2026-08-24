/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DiscoveryAggregateError,
    DiscoveryError,
    ImplementationError,
    InternalError,
    Millis,
    UnexpectedDataError,
} from "@matter/main";
import type { CertNodeApi, CertNodeRef, CertStepContext, CheckRecord, ControllerAdapter } from "@matter/testing";
import { LogFollower } from "@matter/testing";
import { expect } from "chai";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import type { ManualPairingCodeParts } from "../cert/tc-dd-support.js";
import {
    checkGeneratedManualCode,
    checkGeneratedPayload,
    CommissioningRefusals,
    manualPairingCode,
    manualPairingCodeDigits,
    ON_NETWORK_ONLY,
    qrPayloadFields,
    qrPayloadWith,
    qrPayloadWithPrefix,
    recordDiscoveryCapabilityAbsent,
    recordGeneratedManualCode,
    recordGeneratedPayload,
    recordVendorOutcome,
} from "../cert/tc-dd-support.js";
import { CertCheckFailedError, CertCleanupError, CommissionedRefs } from "../cert/tc-support.js";

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

/** What each context recorded, for a test judging the evidence rather than only the outcome. */
const recordedChecks = new WeakMap<CertStepContext, CheckRecord[]>();

function checksOf(cx: CertStepContext): CheckRecord[] {
    return recordedChecks.get(cx) ?? [];
}

/** A step context whose DUT controller answers commissioning as the test says, and nothing else. */
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

    const checks = new Array<CheckRecord>();
    const cx: CertStepContext = {
        controllers: { dut },
        devices: {},
        recorder: {
            beginStep() {},
            check(record) {
                checks.push(record);
            },
            endStep() {
                return [];
            },
            async flush() {
                return "";
            },
        },
    };
    recordedChecks.set(cx, checks);

    return cx;
}

describe("CommissioningRefusals", () => {
    const BUDGETS = { refusalTimeout: Millis(100), settleTimeout: Millis(100) };

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
            refusals.requireNoCommissioning(cx, { manualPairingCode: "749" }, "nothing commissioned", Millis(100)),
        ).rejectedWith(CertCheckFailedError, /unrelated reason/);
    });

    it("accepts any other failure when the claim is only that nothing was commissioned", async () => {
        // The wrong-discriminator step: the code is well formed, so the DUT fails for lack of a device
        const cx = contextWith(() => Promise.reject(new ChipToolCommandError("chip-tool commissioning failed")));
        const refusals = new CommissioningRefusals(BUDGETS);

        await refusals.requireNoCommissioning(cx, { manualPairingCode: "749" }, "nothing commissioned", Millis(100));
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
            refusals.requireNoCommissioning(cx, { manualPairingCode: "749" }, "nothing commissioned", Millis(100)),
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

describe("recordDiscoveryCapabilityAbsent", () => {
    /** A DUT that reads a payload the way both real controllers do. */
    function contextWithParser(): CertStepContext {
        const cx = contextWith(() => Promise.reject(new InternalError("not used by these tests")));
        cx.controllers.dut.parseQrPayload = async payload => {
            const { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode } =
                qrPayloadFields(payload);
            return { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode };
        };
        return cx;
    }

    // chip-all-clusters-app's own payload, whose bitmask is BLE alone — the plan's own example payload
    // is already OnNetwork-only, so substituting the capabilities into it changes nothing and the check
    // would hold however the field were compared
    const BLE_PAYLOAD = "MT:-24J042C00KA0648G00";

    it("passes for a payload that changed nothing but the capabilities", async () => {
        const cx = contextWithParser();

        await recordDiscoveryCapabilityAbsent(
            cx,
            qrPayloadWith(BLE_PAYLOAD, { discoveryCapabilities: ON_NETWORK_ONLY }),
            "ble",
            "no BLE",
            BLE_PAYLOAD,
        );

        expect(checksOf(cx).map(({ verdict }) => verdict)).deep.equal(["pass", "pass"]);
    });

    it("fails when the derivation moved a field the plan told it to keep", async () => {
        const cx = contextWithParser();

        await expect(
            recordDiscoveryCapabilityAbsent(
                cx,
                qrPayloadWith(BLE_PAYLOAD, { discoveryCapabilities: ON_NETWORK_ONLY, passcode: 12345678 }),
                "ble",
                "no BLE",
                BLE_PAYLOAD,
            ),
        ).rejectedWith(CertCheckFailedError, /passcode=20202021/);
    });

    it("fails when the payload still offers the capability", async () => {
        const cx = contextWithParser();

        await expect(recordDiscoveryCapabilityAbsent(cx, BLE_PAYLOAD, "ble", "no BLE", BLE_PAYLOAD)).rejectedWith(
            CertCheckFailedError,
            /ble is offered/,
        );
    });
});

describe("recordVendorOutcome", () => {
    const CODE = "34970112332";
    const IDS = { vendorId: 0xfff2, thVendorId: 0xfff1 };
    const BUDGET = { refusalTimeout: Millis(50), settleTimeout: Millis(50) };

    /** The advertisement check the real helper makes, which these tests have no mDNS to answer. */
    const observed = async () => {};

    it("fails, and leaves cleanup owning the attempt, when the DUT neither onboards nor gives up", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(() => new Promise<CertNodeRef>(() => {}));

        await expect(
            recordVendorOutcome(
                cx,
                CODE,
                new CommissionedRefs(),
                refusals,
                "vendor outcome",
                Millis(50),
                IDS,
                observed,
            ),
        ).rejectedWith(/neither onboarded the TH nor gave up/);

        await expect(refusals.settle(cx)).rejectedWith(/still running/);
    });

    it("records the DUT onboarding the TH, leaving the fabric to the step that owns it", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const decommissioned = new Array<CertNodeRef>();
        const cx = contextWith(
            async () => "peer1" as CertNodeRef,
            async ref => {
                decommissioned.push(ref);
            },
        );
        const commissioned = new CommissionedRefs();

        await recordVendorOutcome(cx, CODE, commissioned, refusals, "vendor outcome", Millis(50), IDS, observed);

        expect(commissioned.get("dut")).equal("peer1");

        // Cleanup must not remove it as well: the ref above is what removes it, and a second removal
        // of the same fabric fails
        await refusals.settle(cx);
        expect(decommissioned).deep.equal([]);
    });

    it("records the DUT giving up on the code, and which vendor id the code named", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(async () => {
            throw new DiscoveryError("No commissionable device was discovered");
        });
        const commissioned = new CommissionedRefs();

        await recordVendorOutcome(cx, CODE, commissioned, refusals, "vendor outcome", Millis(50), IDS, observed);

        expect(commissioned.get("dut")).equal(undefined);
        const detail = checksOf(cx).at(-1)?.detail ?? "";
        expect(detail).contains("DUT terminated commissioning");
        expect(detail).contains("the code names vendor 0xfff2 where the TH's own payload names 0xfff1");
        await refusals.settle(cx);
    });

    it("accepts a give-up that tried a candidate and failed on it", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(async () => {
            throw new DiscoveryAggregateError(
                [new UnexpectedDataError("PASE failed for a candidate that matched the short discriminator")],
                "discovery of node with discriminator 15 failed",
            );
        });

        await recordVendorOutcome(
            cx,
            CODE,
            new CommissionedRefs(),
            refusals,
            "vendor outcome",
            Millis(50),
            IDS,
            observed,
        );

        expect(checksOf(cx).at(-1)?.detail).contains("DUT terminated commissioning");
        await refusals.settle(cx);
    });

    it("does not accept a rejection that says nothing about the code", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(async () => {
            throw new InternalError("the controller would not start");
        });

        await expect(
            recordVendorOutcome(
                cx,
                CODE,
                new CommissionedRefs(),
                refusals,
                "vendor outcome",
                Millis(50),
                IDS,
                observed,
            ),
        ).rejectedWith(CertCheckFailedError, /says nothing about the code/);

        await refusals.settle(cx);
    });

    it("does not accept a payload refusal, which happens before the controller looks for the TH", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(async () => {
            throw new OnboardingPayloadRefusedError(`Refused manual pairing code ${CODE}`);
        });

        await expect(
            recordVendorOutcome(
                cx,
                CODE,
                new CommissionedRefs(),
                refusals,
                "vendor outcome",
                Millis(50),
                IDS,
                observed,
            ),
        ).rejectedWith(CertCheckFailedError, /says nothing about the code/);

        await refusals.settle(cx);
    });

    it("accepts chip-tool's own give-up, which its output cannot qualify", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(async () => {
            throw new ChipToolCommandError("chip-tool commissioning of node 4113 failed");
        });

        await recordVendorOutcome(
            cx,
            CODE,
            new CommissionedRefs(),
            refusals,
            "vendor outcome",
            Millis(50),
            IDS,
            observed,
        );

        await refusals.settle(cx);
    });

    it("does not drive the attempt when the TH was not observed advertising", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        let commissionCalled = false;
        const cx = contextWith(async () => {
            commissionCalled = true;
            return "peer1" as CertNodeRef;
        });

        await expect(
            recordVendorOutcome(
                cx,
                CODE,
                new CommissionedRefs(),
                refusals,
                "vendor outcome",
                Millis(50),
                IDS,
                async () => {
                    throw new CertCheckFailedError("TH advertising before the attempt check failed");
                },
            ),
        ).rejectedWith(CertCheckFailedError, /TH advertising before the attempt/);

        expect(commissionCalled).equal(false);
        await refusals.settle(cx);
    });

    it("says so when the code names the vendor the TH itself advertises", async () => {
        const refusals = new CommissioningRefusals(BUDGET);
        const cx = contextWith(async () => "peer1" as CertNodeRef);

        await recordVendorOutcome(
            cx,
            CODE,
            new CommissionedRefs(),
            refusals,
            "vendor outcome",
            Millis(50),
            { vendorId: 0xfff1, thVendorId: 0xfff1 },
            observed,
        );

        expect(checksOf(cx).at(-1)?.detail).contains("substitutes nothing");
        await refusals.settle(cx);
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

describe("qrPayloadFields", () => {
    it("reads back the plan's own example payload", () => {
        expect(qrPayloadFields(PLAN_PAYLOAD)).deep.equal({
            prefix: "MT:",
            version: 0,
            vendorId: 0xfff1,
            productId: 0x8001,
            flowType: 2,
            discoveryCapabilities: ON_NETWORK_ONLY,
            discriminator: 0xf00,
            passcode: 20202021,
            tlv: "",
        });
    });

    it("reads back the TLV a payload appends, which no substitution may disturb", () => {
        const withTlv = "MT:-24J029Q00KA064IJ3P0IXZB0DK5N1K8SQ1RYCU1-A40";

        expect(qrPayloadFields(withTlv).tlv).not.equal("");
        expect(qrPayloadFields(withTlv).tlv).equal(qrPayloadFields(qrPayloadWith(withTlv, { passcode: 12345678 })).tlv);
    });

    it("reads back each substitution the plan makes", () => {
        expect(qrPayloadFields("MT:034J029Q00KA0648G00").version, "version").equal(0b010);

        for (const [passcode, payload] of PLAN_INVALID_PASSCODE_PAYLOADS) {
            expect(qrPayloadFields(payload).passcode, `passcode ${passcode}`).equal(passcode);
        }
    });

    it("reads a payload behind a substituted prefix", () => {
        const fields = qrPayloadFields(qrPayloadWithPrefix(PLAN_PAYLOAD, "AB:"));

        expect(fields.prefix).equal("AB:");
        expect(fields.passcode).equal(20202021);
    });

    it("reads back a payload carrying appended TLV data", () => {
        expect(qrPayloadFields("MT:-24J029Q00KA064IJ3P0IXZB0DK5N1K8SQ1RYCU1-A40").passcode).equal(20202021);
    });

    it("refuses a code carrying no prefix at all", () => {
        expect(() => qrPayloadFields("34970112336552132769")).throw(InternalError);
    });
});

describe("manualPairingCodeDigits", () => {
    it("reads back the plan's own example code", () => {
        expect(manualPairingCodeDigits("749701123365521327694")).deep.equal({
            length: 21,
            futureFormat: false,
            vidPidPresent: true,
            shortDiscriminator: 0xf,
            passcode: 20202021,
            vendorId: 0xfff1,
            productId: 0x8001,
            checkDigit: 4,
            checkDigitCorrect: true,
        });
    });

    it("reads back each substitution the plan makes", () => {
        expect(manualPairingCodeDigits("849701123365521327693").futureFormat, "version").equal(true);
        expect(manualPairingCodeDigits("349701123365521327696").vidPidPresent, "VID_PID_PRESENT").equal(false);
        expect(manualPairingCodeDigits("733317123365521327692").shortDiscriminator, "discriminator").equal(0xe);
        expect(manualPairingCodeDigits("749701123365521000006").productId, "product id").equal(0);
        expect(manualPairingCodeDigits("749701123365522327692").vendorId, "vendor id").equal(0xfff2);
        expect(manualPairingCodeDigits("749152000065521327698").passcode, "passcode").equal(0);
    });

    it("reports a check digit that is not the one the digits produce", () => {
        const digits = manualPairingCodeDigits("749701123365521327693");

        expect(digits.checkDigit).equal(3);
        expect(digits.checkDigitCorrect).equal(false);
    });

    it("reads back an 11-digit code", () => {
        const code = manualPairingCode({ vidPidPresent: false, discriminator: 0xf00, passcode: 20202021 });

        expect(manualPairingCodeDigits(code)).deep.contain({
            length: 11,
            vidPidPresent: false,
            shortDiscriminator: 0xf,
            passcode: 20202021,
            vendorId: undefined,
            productId: undefined,
        });
    });

    it("ignores the separators a tester may type", () => {
        expect(manualPairingCodeDigits("7497-011.233 65521327694").passcode).equal(20202021);
    });

    it("refuses a digit count no manual pairing code has", () => {
        expect(() => manualPairingCodeDigits("7497011233655213276")).throw(InternalError);
    });
});

function recordingContext() {
    const checks = new Array<CheckRecord>();
    const cx = contextWith(() => Promise.reject(new InternalError("not used by these tests")));

    return { checks, cx: { ...cx, recorder: { ...cx.recorder, check: (check: CheckRecord) => checks.push(check) } } };
}

describe("recordGeneratedPayload", () => {
    it("records the fields the payload carries", () => {
        const { checks, cx } = recordingContext();

        recordGeneratedPayload(cx, PLAN_PAYLOAD, { passcode: 20202021 }, "plan payload");

        expect(checks).length(1);
        expect(checks[0].verdict).equal("pass");
        expect(checks[0].detail).contain("passcode=20202021");
    });

    it("fails the step when the payload does not carry what the step asked for", () => {
        const { checks, cx } = recordingContext();

        expect(() => recordGeneratedPayload(cx, PLAN_PAYLOAD, { passcode: 12345678 }, "plan payload")).throw(
            CertCheckFailedError,
        );
        expect(checks[0].verdict).equal("fail");
        expect(checks[0].detail).contain("expected passcode=12345678");
    });

    it("fails the step on a prefix the step did not ask for", () => {
        const { cx } = recordingContext();

        expect(() => recordGeneratedPayload(cx, PLAN_PAYLOAD, { prefix: "AB:" }, "plan payload")).throw(
            CertCheckFailedError,
        );
    });
});

describe("recordGeneratedManualCode", () => {
    const PLAN_CODE = "749701123365521327694";

    it("records the digits the code carries", () => {
        const { checks, cx } = recordingContext();

        recordGeneratedManualCode(cx, PLAN_CODE, { vendorId: 0xfff1 }, "plan code");

        expect(checks).length(1);
        expect(checks[0].verdict).equal("pass");
        expect(checks[0].detail).contain("checkDigit=4 (correct)");
    });

    it("fails the step when the code does not carry what the step asked for", () => {
        const { checks, cx } = recordingContext();

        expect(() => recordGeneratedManualCode(cx, PLAN_CODE, { productId: 0 }, "plan code")).throw(
            CertCheckFailedError,
        );
        expect(checks[0].detail).contain("expected productId=0");
    });

    it("asserts the Verhoeff digit no step names, which every step's expected outcome demands", () => {
        const { checks, cx } = recordingContext();

        expect(() => recordGeneratedManualCode(cx, "749701123365521327693", { vendorId: 0xfff1 }, "plan code")).throw(
            CertCheckFailedError,
        );
        expect(checks[0].detail).contain("expected checkDigitCorrect=true");
    });

    it("accepts the wrong check digit the step that asks for one generates", () => {
        const { checks, cx } = recordingContext();

        recordGeneratedManualCode(cx, "749701123365521327693", { checkDigitCorrect: false }, "wrong check digit");

        expect(checks[0].verdict).equal("pass");
        expect(checks[0].detail).contain("not the Verhoeff digit");
    });

    it("fails the step when the code does not differ from the one it must differ from", () => {
        const { checks, cx } = recordingContext();

        expect(() => recordGeneratedManualCode(cx, PLAN_CODE, { differsFrom: PLAN_CODE }, "plan code")).throw(
            CertCheckFailedError,
        );
        expect(checks[0].detail).contain(`expected a code other than ${PLAN_CODE}`);
    });
});

describe("checkGeneratedManualCode", () => {
    const PLAN_CODE = "749701123365521327694";

    it("asserts a field a caller states as undefined rather than silently skipping it", () => {
        // `Partial<T>` accepts an accidental `undefined` from an optional source field, and treating
        // that as "not asserted" is how a step would claim something it never checked
        expect(checkGeneratedManualCode(PLAN_CODE, { productId: undefined }).verdict).equal("fail");
    });

    it("asserts an absent field, which the 11-digit form has", () => {
        const short = manualPairingCode({ vidPidPresent: false, discriminator: 0xf00, passcode: 20202021 });

        expect(checkGeneratedManualCode(short, { vendorId: undefined, productId: undefined }).verdict).equal("pass");
        expect(checkGeneratedManualCode(PLAN_CODE, { vendorId: undefined }).verdict).equal("fail");
    });

    it("asserts a field whose expected value is falsy", () => {
        expect(checkGeneratedManualCode("749701123365521000006", { productId: 0 }).verdict).equal("pass");
        expect(checkGeneratedManualCode(PLAN_CODE, { productId: 0 }).verdict).equal("fail");
        expect(checkGeneratedManualCode("349701123365521327696", { vidPidPresent: false }).verdict).equal("pass");
        expect(checkGeneratedManualCode(PLAN_CODE, { vidPidPresent: false }).verdict).equal("fail");
    });
});

describe("checkGeneratedPayload", () => {
    it("asserts a field a caller states as undefined rather than silently skipping it", () => {
        expect(checkGeneratedPayload(PLAN_PAYLOAD, { passcode: undefined }).verdict).equal("fail");
    });

    it("asserts a version of 0, which is the value the specification requires", () => {
        expect(checkGeneratedPayload(PLAN_PAYLOAD, { version: 0 }).verdict).equal("pass");
        expect(checkGeneratedPayload(qrPayloadWith(PLAN_PAYLOAD, { version: 2 }), { version: 0 }).verdict).equal(
            "fail",
        );
    });
});

describe("unchangedFrom", () => {
    const PLAN_CODE = "749701123365521327694";

    it("fails a payload whose vendor, product, flow or discriminator moved", () => {
        // The four fields the reader gained: comparing only the substituted one left a generator
        // free to corrupt any of them
        const source = qrPayloadFields(PLAN_PAYLOAD);
        for (const field of ["vendorId", "productId", "flowType", "discriminator"] as const) {
            const moved = { ...source, [field]: source[field] + 1 };
            expect(checkGeneratedPayload(PLAN_PAYLOAD, { ...moved, unchangedFrom: PLAN_PAYLOAD }).verdict, field).equal(
                "fail",
            );
        }
    });

    it("fails a payload whose other fields moved, which the substituted field alone cannot show", () => {
        const clobbered = qrPayloadWith(PLAN_PAYLOAD, { passcode: 12345678, discoveryCapabilities: 0b010 });

        expect(checkGeneratedPayload(clobbered, { passcode: 12345678 }).verdict, "the substituted field alone").equal(
            "pass",
        );
        expect(
            checkGeneratedPayload(clobbered, { passcode: 12345678, unchangedFrom: PLAN_PAYLOAD }).verdict,
            "against the source payload",
        ).equal("fail");
    });

    it("passes a payload where only the substituted field moved", () => {
        expect(
            checkGeneratedPayload(qrPayloadWith(PLAN_PAYLOAD, { passcode: 12345678 }), {
                passcode: 12345678,
                unchangedFrom: PLAN_PAYLOAD,
            }).verdict,
        ).equal("pass");
    });

    it("fails a code whose other digits moved", () => {
        const parts = { vidPidPresent: true, discriminator: 0xf00, passcode: 20202021, productId: 0x8001 };
        const clobbered = manualPairingCode({ ...parts, vendorId: 0xfff2, discriminator: 0xe00 });

        expect(checkGeneratedManualCode(clobbered, { vendorId: 0xfff2 }).verdict, "the vendor alone").equal("pass");
        expect(
            checkGeneratedManualCode(clobbered, { vendorId: 0xfff2, unchangedFrom: PLAN_CODE }).verdict,
            "against the source code",
        ).equal("fail");
    });

    it("passes a code where only the substituted digits moved, check digit aside", () => {
        expect(
            checkGeneratedManualCode("749701123365522327692", { vendorId: 0xfff2, unchangedFrom: PLAN_CODE }).verdict,
        ).equal("pass");
    });

    it("refuses a code field that is there but undefined, rather than dropping the assertion", () => {
        expect(() => checkGeneratedManualCode(PLAN_CODE, { unchangedFrom: undefined }), "unchangedFrom").throw(
            ImplementationError,
        );
        expect(() => checkGeneratedManualCode(PLAN_CODE, { differsFrom: undefined }), "differsFrom").throw(
            ImplementationError,
        );
        expect(() => checkGeneratedPayload(PLAN_PAYLOAD, { unchangedFrom: undefined }), "payload").throw(
            ImplementationError,
        );
    });

    it("does not demand the check digit, which every substitution changes", () => {
        // The source's own check digit is 4 and the substituted code's is 2; naming it would make
        // every `unchangedFrom` expectation self-contradictory
        expect(
            checkGeneratedManualCode("749701123365522327692", { vendorId: 0xfff2, unchangedFrom: PLAN_CODE }).detail,
        ).contain("checkDigit=2 (correct)");
    });
});
