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
import type {
    CertDevice,
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    DeviceExitInfo,
    DeviceFlavor,
} from "@matter/testing";
import { LineQueue, LogFollower, PicsFile } from "@matter/testing";
import { expect } from "chai";
import { ChipToolCommandError } from "../../src/cert/ChipToolControllerAdapter.js";
import { OnboardingPayloadRefusedError } from "../../src/cert/onboarding-payload.js";
import type { ManualPairingCodeParts, TransitionMark } from "../cert/tc-dd-support.js";
import {
    checkGeneratedManualCode,
    checkGeneratedPayload,
    commissionByQr,
    CUSTOM_FLOW,
    flowName,
    flowTitle,
    CommissioningRefusals,
    manualPairingCode,
    manualPairingCodeDigits,
    ON_NETWORK_ONLY,
    qrPayloadFields,
    qrPayloadWith,
    qrPayloadWithPrefix,
    recordDiscoveryCapabilityAbsent,
    recordBackInCommissioningMode,
    recordGeneratedManualCode,
    recordPayloadOffering,
    recordGeneratedPayload,
    recordNotCommissioned,
    recordUnpair,
    recordVendorOutcome,
    STANDARD_FLOW,
    USER_INTENT_FLOW,
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

describe("flow naming", () => {
    it("titles each flow the plan defines", () => {
        expect([STANDARD_FLOW, USER_INTENT_FLOW, CUSTOM_FLOW].map(flowTitle)).deep.equal([
            "Standard",
            "User-Intent",
            "Custom",
        ]);
    });

    it("refuses to title a flow the specification does not define", () => {
        // The field is two bits wide, so a test case could name 3 and there is nothing to call it
        expect(() => flowTitle(3)).throw(InternalError);
    });

    it("names an undefined flow by its value, because a verdict has to say which one it saw", () => {
        expect(flowName(3)).equal("flow 3");
        expect(flowName(USER_INTENT_FLOW)).equal("the user-intent flow");
    });
});

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

    it("substitutes the flow, which is the field TC-DD-3.12 and TC-DD-3.13 are named for", () => {
        // The plan's own example payload carries the custom flow, and the standard-flow form of it is
        // the payload the capabilities test above arrives at from the other direction
        expect(qrPayloadWith(PLAN_PAYLOAD, { flowType: STANDARD_FLOW })).equal("MT:-24J0AFN00KA0648G00");
        expect(qrPayloadWith(PLAN_PAYLOAD, { flowType: USER_INTENT_FLOW })).equal("MT:-24J06VO00KA0648G00");
        expect(qrPayloadWith("MT:-24J0AFN00KA0648G00", { flowType: CUSTOM_FLOW })).equal(PLAN_PAYLOAD);
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

    it("refuses a flow too wide for the two bits the field holds", () => {
        expect(() => qrPayloadWith(PLAN_PAYLOAD, { flowType: 4 })).throw(InternalError);
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

describe("recordPayloadOffering", () => {
    function contextWithParser(): CertStepContext {
        const cx = contextWith(() => Promise.reject(new InternalError("not used by these tests")));
        cx.controllers.dut.parseQrPayload = async payload => {
            const { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode } =
                qrPayloadFields(payload);
            return { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode };
        };
        return cx;
    }

    // chip-all-clusters-app's own payload: standard flow, BLE alone
    const BLE_PAYLOAD = "MT:-24J042C00KA0648G00";

    it("passes for a standard-flow payload offering the capability asked for", async () => {
        const cx = contextWithParser();

        await recordPayloadOffering(cx, BLE_PAYLOAD, "ble");

        expect(checksOf(cx).map(({ verdict }) => verdict)).deep.equal(["pass"]);
    });

    it("fails when the payload offers a capability other than the one asked for", async () => {
        const cx = contextWithParser();

        await expect(
            recordPayloadOffering(cx, qrPayloadWith(BLE_PAYLOAD, { discoveryCapabilities: ON_NETWORK_ONLY }), "ble"),
        ).rejectedWith(CertCheckFailedError, /does not offer ble/);
    });

    // The flow a test case is named for is the caller's, not a constant: TC-DD-3.12 and 3.13 fabricate
    // flows no subject publishes, and a helper hardcoding the standard one would have printed a
    // verdict naming a flow nobody checked
    it("judges the payload against the flow the caller asked for", async () => {
        const cx = contextWithParser();

        await recordPayloadOffering(cx, PLAN_PAYLOAD, "onIpNetwork", CUSTOM_FLOW);

        const check = checksOf(cx).at(-1);
        expect(check?.verdict).equal("pass");
        expect(check?.detail).contains("flowType=2");
    });

    it("fails when the payload carries a different flow from the one asked for", async () => {
        const cx = contextWithParser();

        await expect(recordPayloadOffering(cx, PLAN_PAYLOAD, "onIpNetwork", USER_INTENT_FLOW)).rejectedWith(
            CertCheckFailedError,
            /flowType 2 rather than the user-intent flow/,
        );
    });

    it("fails when the payload names a commissioning flow other than the standard one", async () => {
        const cx = contextWithParser();

        // The plan's own example payload, which carries the custom flow
        await expect(recordPayloadOffering(cx, PLAN_PAYLOAD, "onIpNetwork")).rejectedWith(
            CertCheckFailedError,
            /flowType 2 rather than the standard flow/,
        );
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

/**
 * Drives {@link recordUnpair}/{@link recordBackInCommissioningMode} against a hand-fed TH log and a
 * {@link CertNodeApi} that answers the two identifier reads, recording the order it was asked in.
 */
class UnpairFixture {
    readonly checks = new Array<CheckRecord>();
    readonly calls = new Array<string>();
    readonly cx: CertStepContext;
    readonly commissioned = new CommissionedRefs();
    readonly #source = new LineQueue();
    readonly #log: LogFollower;

    constructor(
        flavor: DeviceFlavor,
        options: {
            fabricIndex?: number;
            backchannel?: () => void;
            onDecommission?: () => void;
            commission?: () => Promise<CertNodeRef>;
        } = {},
    ) {
        const { fabricIndex = 1, backchannel = () => {}, onDecommission = () => {} } = options;
        const log = new LogFollower(this.#source, "th");
        this.#log = log;
        const unused = () => Promise.reject(new InternalError("not used by these tests"));

        const node: CertNodeApi = {
            invoke: unused,
            invokeBatch: unused,
            readAttributes: unused,
            writeAttribute: unused,
            writeAttributes: unused,
            subscribe: unused,
            readEvents: unused,
            subscribeEvents: unused,
            openCommissioningWindow: unused,
            readAttribute: async () => {
                this.calls.push("readFabricIndex");
                return fabricIndex;
            },
            operationalMdnsInstanceName: unused,
            decommission: async () => {
                this.calls.push("decommission");
                onDecommission();
            },
        };

        const device: CertDevice = {
            id: "th",
            app: "all-clusters",
            commissioning: { kind: "on-network", passcode: 20202021, discriminator: 3840, qrPairingCode: "" },
            pics: new PicsFile([]),
            async initialize() {},
            async start() {},
            async stop() {},
            async close() {},
            async snapshot() {
                return {};
            },
            async restore() {},
            backchannel: async () => {
                this.calls.push("backchannel");
                backchannel();
            },
            flavor,
            log,
            exit: new Promise<DeviceExitInfo>(() => {}),
        };

        const controller: ControllerAdapter = {
            id: "dut",
            log,
            async start() {},
            async close() {},
            commission: options.commission ?? unused,
            parseQrPayload: unused,
            parseManualPairingCode: unused,
            node: () => node,
        };

        this.cx = {
            devices: { th: device },
            controllers: { dut: controller },
            recorder: {
                beginStep: () => {},
                check: record => void this.checks.push(record),
                endStep: () => [],
                flush: async () => "",
            },
        };
        this.commissioned.set("dut", "peer1" as CertNodeRef);
    }

    push(...lines: string[]): void {
        for (const line of lines) {
            this.#source.push(line);
        }
    }

    /** Ends the log, which is what makes a check for a line the TH never printed fail promptly. */
    close(): void {
        this.#source.close();
    }

    async markTransition(): Promise<TransitionMark> {
        return this.#log.markSettled();
    }

    /** Lets the follower's pump ingest what was pushed, so a later `mark()` is past it. */
    async drain(): Promise<void> {
        await new Promise(resolve => setImmediate(resolve));
    }
}

const CHIP_FABRIC_REMOVED = "[1787433103.742] [23362:73430237:chip] [ZCL] OpCreds: RemoveFabric successful";
const CHIP_SESSIONS_EXPIRED = "[1787433103.742] [23362:73430237:chip] [IN] Expiring all sessions for fabric 0x1!!";
const CHIP_SETUP_QR_CODE = "[1787433105.001] [23362:73430237:chip] [SVR] SetupQRCode: [MT:-24J042C00KA0648G00]";
const CHIP_ADVERTISING_COMMISSIONABLE =
    "[1787433105.010] [23362:73430237:chip] [DIS] mDNS service published: _matterc._udp; instance name: 245375FD9D5602FE";
const MATTERJS_ADVERTISING_COMMISSIONABLE =
    "2026-08-27 13:05:44.123 INFO MdnsAdvertisement Publishing kind: commissionable service: mdns:036341AECBC96116._matterc._udp.local";

describe("recordUnpair", () => {
    it("records the removal and the ended sessions, and gives up the ref", async () => {
        const fixture = new UnpairFixture("chip-local", {
            onDecommission: () => fixture.push(CHIP_FABRIC_REMOVED, CHIP_SESSIONS_EXPIRED),
        });

        await recordUnpair(fixture.cx, fixture.commissioned);

        expect(fixture.commissioned.get("dut")).equal(undefined);
        expect(fixture.checks.map(check => `${check.type}:${check.verdict}`)).deep.equal([
            "response:pass",
            "device-log:pass",
            "device-log:pass",
        ]);
    });

    // The in-process controller drops the peer as the device announces the removal, so the index the
    // device assigned this controller cannot be read once the fabric is gone
    it("reads the fabric index before removing the fabric", async () => {
        const fixture = new UnpairFixture("chip-local", {
            onDecommission: () => fixture.push(CHIP_FABRIC_REMOVED, CHIP_SESSIONS_EXPIRED),
        });

        await recordUnpair(fixture.cx, fixture.commissioned);

        expect(fixture.calls).deep.equal(["readFabricIndex", "decommission"]);
    });

    it("judges both lines against the fabric index the device assigned", async () => {
        const fixture = new UnpairFixture("chip-local", {
            fabricIndex: 2,
            onDecommission: () => {
                fixture.push(CHIP_FABRIC_REMOVED, CHIP_SESSIONS_EXPIRED);
                fixture.close();
            },
        });

        await expect(recordUnpair(fixture.cx, fixture.commissioned)).rejectedWith(CertCheckFailedError);

        // The removal line names no fabric on chip, so only the session line can tell fabric 2 from 1
        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass", "pass", "fail"]);
    });

    // matter.js closes the removed fabric's sessions before it answers the invoke, so a search
    // starting where the removal matched would never reach them
    it("finds a session end the TH logged before the removal it answered", async () => {
        const fixture = new UnpairFixture("matterjs", {
            onDecommission: () =>
                fixture.push(
                    "2026-08-22 21:48:06.401 INFO Session @1:1946ee4c0f86d574•c677 Session ended",
                    "2026-08-22 21:48:06.406 INFO ProtocolService Invoke » binford-6100.operationalCredentials." +
                        "removeFabric @1:9a52bb47a4ee167d•c675⇵68ce✉09f1964b statusCode: 0 fabricIndex: 1",
                ),
        });

        await recordUnpair(fixture.cx, fixture.commissioned);

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass", "pass", "pass"]);
    });

    // The contract TC-DD-3.20's steps 4 and 5 rest on: the mark predates the removal, so a check
    // anchored on it sees what the TH did in response
    it("returns a mark taken before the fabric came off", async () => {
        const fixture = new UnpairFixture("chip-local", {
            onDecommission: () => fixture.push(CHIP_FABRIC_REMOVED, CHIP_SESSIONS_EXPIRED),
        });

        const mark = await recordUnpair(fixture.cx, fixture.commissioned);

        // Both lines the TH printed because of the removal are at or after it
        const lines = fixture.cx.devices.th.log.lines;
        expect(lines.length).greaterThan(mark);
        expect(lines.slice(mark).map(line => line.text)).deep.equal([CHIP_FABRIC_REMOVED, CHIP_SESSIONS_EXPIRED]);
    });

    it("fails, but still gives up the ref, when the TH never logs the removal", async () => {
        const fixture = new UnpairFixture("chip-local");
        fixture.close();

        await expect(recordUnpair(fixture.cx, fixture.commissioned)).rejectedWith(CertCheckFailedError);

        // The fabric is off the TH whatever the log said, so cleanup must not try to remove it again
        expect(fixture.commissioned.get("dut")).equal(undefined);
    });

    it("records both outcomes before failing on the first bad one", async () => {
        const fixture = new UnpairFixture("chip-local", {
            onDecommission: () => {
                fixture.push(CHIP_FABRIC_REMOVED);
                fixture.close();
            },
        });

        await expect(recordUnpair(fixture.cx, fixture.commissioned)).rejectedWith(CertCheckFailedError);

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass", "pass", "fail"]);
    });

    // The bundle must carry the session-end outcome even though the removal check ahead of it is what
    // fails the step: recording the two in sequence would throw on the first and drop the second
    it("records the session-end outcome even when the removal check is the one that failed", async () => {
        const fixture = new UnpairFixture("chip-local", {
            onDecommission: () => {
                fixture.push(CHIP_SESSIONS_EXPIRED);
                fixture.close();
            },
        });

        await expect(recordUnpair(fixture.cx, fixture.commissioned)).rejectedWith(CertCheckFailedError);

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass", "fail", "pass"]);
    });
});

describe("restoreCommissioningMode, through recordVendorOutcome", () => {
    // The composed path every pre-existing caller uses: an earlier attempt onboarded the TH, so the
    // next one has to put it back into commissioning mode first.
    it("resets the TH and gives up the ref before the next attempt", async () => {
        const fixture = new UnpairFixture("chip-local", {
            backchannel: () => fixture.push(CHIP_SETUP_QR_CODE, CHIP_ADVERTISING_COMMISSIONABLE),
            commission: () => Promise.reject(new DiscoveryError("No commissionable device was discovered")),
        });
        const probed = new Array<string>();

        await recordVendorOutcome(
            fixture.cx,
            "34970112332",
            fixture.commissioned,
            new CommissioningRefusals({ refusalTimeout: Millis(50), settleTimeout: Millis(50) }),
            "vendor outcome",
            Millis(50),
            { vendorId: 0xfff2, thVendorId: 0xfff1 },
            async (_cx, what) => void probed.push(what),
        );

        expect(fixture.calls).deep.equal(["decommission", "backchannel"]);
        expect(fixture.commissioned.get("dut")).equal(undefined);

        // The restore's own probe, and no second one: a restore that ran has already proven the TH
        // is there, so the attempt does not probe again
        expect(probed).deep.equal(["TH advertising as commissionable again"]);
    });

    // The fabric is off the TH once decommission() resolves, whatever the reset that follows does, so
    // a ref surrendered only on success would have the finalizer remove a fabric that is gone
    it("gives up the ref even when the reset that follows never completes", async () => {
        const fixture = new UnpairFixture("chip-local", { backchannel: () => fixture.close() });

        await expect(
            recordVendorOutcome(
                fixture.cx,
                "34970112332",
                fixture.commissioned,
                new CommissioningRefusals({ refusalTimeout: Millis(50), settleTimeout: Millis(50) }),
                "vendor outcome",
                Millis(50),
                { vendorId: 0xfff2, thVendorId: 0xfff1 },
                async () => {},
            ),
        ).rejectedWith(CertCheckFailedError);

        expect(fixture.commissioned.get("dut")).equal(undefined);
    });
});

describe("commissionByQr's own causal boundary", () => {
    const completion = (fabric: string) =>
        `2026-08-27 19:31:27.056 NOTICE GeneralCommissioningClusterHandler Commissioned fabric: ${fabric} (#1) node: 1`;

    // The mark this takes has to sit behind a completion the TH had already written, or the check
    // matches that one and reports a commissioning this call never performed. The markSettled tests
    // above prove the primitive; this one proves the call site actually uses it.
    it("matches the completion its own commissioning caused, not one already in flight", async () => {
        const fixture = new UnpairFixture("matterjs", {
            commission: async () => {
                fixture.push(completion("bbbbbbbbbbbbbbbb"));
                return "peer1" as CertNodeRef;
            },
        });

        // Written before the call and deliberately left undrained, which is exactly the state a plain
        // mark() cannot distinguish from a line this commissioning caused
        fixture.push(completion("aaaaaaaaaaaaaaaa"));

        await commissionByQr(fixture.cx, "MT:-24J042C00KA0648G00", new CommissionedRefs());

        const matched = fixture.checks.find(check => check.type === "device-log")?.matched ?? "";
        expect(matched).contains("bbbbbbbbbbbbbbbb");
        expect(matched).not.contains("aaaaaaaaaaaaaaaa");
    });
});

describe("recordNotCommissioned", () => {
    const CHIP_COMMISSIONED = "[1787433110.001] [23362:73430237:chip] [SVR] Commissioning completed successfully";
    const MATTERJS_COMMISSIONED =
        "2026-08-27 19:31:27.056 NOTICE GeneralCommissioningClusterHandler Commissioned fabric: 6ad0fe468a5d1880 (#1) node: 1";

    // A negative check passes on a run where nothing happened whether or not it looks in the right
    // place, so the case that proves it is the one where the device DID commission
    it("fails when the device completed a commissioning after the mark", async () => {
        const fixture = new UnpairFixture("chip-local");
        const from = await fixture.markTransition();
        // Deliberately not drained: the helper has to settle the log itself, or it counts a buffer
        // the completion has not reached yet and reports the device idle
        fixture.push(CHIP_COMMISSIONED);

        await expect(
            recordNotCommissioned(fixture.cx, fixture.cx.devices.th, from, "TH2 was not commissioned"),
        ).rejectedWith(CertCheckFailedError);

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["fail"]);
        expect(fixture.checks[0].detail).contains("completed 1 commissioning");
    });

    it("ignores a commissioning the device completed before the mark", async () => {
        const fixture = new UnpairFixture("chip-local");
        fixture.push(CHIP_COMMISSIONED);
        const from = await fixture.markTransition();

        await recordNotCommissioned(fixture.cx, fixture.cx.devices.th, from, "TH2 was not commissioned");

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass"]);
    });

    it("reads the matterjs device's own form of the line", async () => {
        const fixture = new UnpairFixture("matterjs");
        const from = await fixture.markTransition();
        fixture.push(MATTERJS_COMMISSIONED);

        await expect(
            recordNotCommissioned(fixture.cx, fixture.cx.devices.th, from, "TH1 was not commissioned again"),
        ).rejectedWith(CertCheckFailedError);

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["fail"]);
    });

    it("counts every commissioning in the window, not just the first", async () => {
        const fixture = new UnpairFixture("chip-local");
        const from = await fixture.markTransition();
        fixture.push(CHIP_COMMISSIONED, CHIP_COMMISSIONED);

        await expect(
            recordNotCommissioned(fixture.cx, fixture.cx.devices.th, from, "TH2 was not commissioned"),
        ).rejectedWith(CertCheckFailedError);

        expect(fixture.checks[0].detail).contains("completed 2 commissioning");
    });
});

describe("recordBackInCommissioningMode", () => {
    it("factory-resets a chip TH and waits for the restarted app's own payload", async () => {
        const fixture = new UnpairFixture("chip-local", {
            backchannel: () => fixture.push(CHIP_SETUP_QR_CODE, CHIP_ADVERTISING_COMMISSIONABLE),
        });
        const probed = new Array<string>();

        await recordBackInCommissioningMode(fixture.cx, {
            what: "TH advertising again",
            probeCommissionable: async (_cx, what) => void probed.push(what),
        });

        expect(fixture.calls).deep.equal(["backchannel"]);
        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass", "pass"]);
        expect(probed).deep.equal(["TH advertising again"]);
    });

    // A matter.js device returns to commissioning mode when its last fabric goes, so erasing it would
    // restart a TH that needs nothing
    it("does not reset a matterjs TH, and takes its own announcement instead", async () => {
        const fixture = new UnpairFixture("matterjs");
        const probed = new Array<string>();

        // The announcement has to land after the helper's own settled mark, which costs a couple of
        // event-loop turns; the delay is what keeps that ordering out of the scheduler's hands
        const pending = recordBackInCommissioningMode(fixture.cx, {
            what: "TH advertising again",
            probeCommissionable: async (_cx, what) => void probed.push(what),
        });
        setTimeout(() => fixture.push(MATTERJS_ADVERTISING_COMMISSIONABLE), 25);
        await pending;

        expect(fixture.calls).deep.equal([]);
        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass"]);
        expect(probed).deep.equal(["TH advertising again"]);
    });

    // The probe alone passes off a record cached before the TH was ever commissioned, so the device
    // saying so is what carries the claim — and a TH that never returns must not reach the probe
    it("fails, without probing, when a matterjs TH never announces the advertisement", async () => {
        const fixture = new UnpairFixture("matterjs");
        fixture.close();
        const probed = new Array<string>();

        await expect(
            recordBackInCommissioningMode(fixture.cx, {
                what: "TH advertising again",
                probeCommissionable: async (_cx, what) => void probed.push(what),
            }),
        ).rejectedWith(CertCheckFailedError);

        expect(probed).deep.equal([]);
    });

    it("searches the announcement from the caller's mark, not from its own entry", async () => {
        const fixture = new UnpairFixture("matterjs");
        const before = await fixture.markTransition();
        // A TH that returned to commissioning mode before this helper was entered, which is the
        // ordinary case: the decommission that caused it happened in the caller
        fixture.push(MATTERJS_ADVERTISING_COMMISSIONABLE);
        await fixture.drain();

        await recordBackInCommissioningMode(fixture.cx, {
            since: before,
            probeCommissionable: async () => {},
        });

        expect(fixture.checks.map(check => check.verdict)).deep.equal(["pass"]);
    });

    it("fails, without probing, when the restarted chip TH never prints its payload", async () => {
        const fixture = new UnpairFixture("chip-local", { backchannel: () => fixture.close() });
        const probed = new Array<string>();

        await expect(
            recordBackInCommissioningMode(fixture.cx, {
                what: "TH advertising again",
                probeCommissionable: async (_cx, what) => void probed.push(what),
            }),
        ).rejectedWith(CertCheckFailedError);

        expect(probed).deep.equal([]);
    });
});
