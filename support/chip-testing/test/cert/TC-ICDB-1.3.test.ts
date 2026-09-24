/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertIcdEvent, CertIcdRegistration, CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    CommissionedRefs,
    describeError,
    describeValue,
    expectCommandInvoke,
    expectDeviceLog,
    icdRegisterClientFields,
    LOG_TIMEOUT,
    record,
    requireId,
} from "./tc-support.js";

const ICD_MANAGEMENT = Matter.clusters.require("IcdManagement");
const ICD_MANAGEMENT_ID = requireId(ICD_MANAGEMENT.id, "IcdManagement cluster");
const REGISTER_CLIENT_ID = requireId(ICD_MANAGEMENT.commands.require("registerClient").id, "RegisterClient");
const REGISTERED_CLIENTS_ID = requireId(
    ICD_MANAGEMENT.attributes.require("registeredClients").id,
    "IcdManagement.registeredClients",
);

const GENERAL_DIAGNOSTICS = Matter.clusters.require("GeneralDiagnostics");
const GENERAL_DIAGNOSTICS_ID = requireId(GENERAL_DIAGNOSTICS.id, "GeneralDiagnostics cluster");
const TEST_EVENT_TRIGGER_ID = requireId(
    GENERAL_DIAGNOSTICS.commands.require("testEventTrigger").id,
    "GeneralDiagnostics.testEventTrigger",
);

const ROOT_ENDPOINT = 0;

/** `PIXIT.ICDB.S.TEST_EVENT_TRIGGER_KEY`, which the TH is started with. */
const ENABLE_KEY = Bytes.fromHex("00112233445566778899aabbccddeeff");

/**
 * CHIP's ICD test event triggers (`ICDTestEventTriggerEvent` in `src/app/icd/server/ICDManager.cpp`). The first
 * advances the TH's ICDCounter by 2^31 − 1, so its next Check-In shows half the counter range used; the second by
 * 2^32 − 1, so its next Check-In repeats the counter of the one before.
 */
const INVALIDATE_HALF_COUNTER_VALUES = 0x0046_0000_0000_0003n;
const INVALIDATE_ALL_COUNTER_VALUES = 0x0046_0000_0000_0004n;

/** An idle period of seconds, not the app's hour, so each step waits for one Check-In cycle rather than the next. */
const TH_ARGS = [
    "--icdIdleModeDuration",
    "5",
    "--icdActiveModeDurationMs",
    "1000",
    "--enable-key",
    Bytes.toHex(ENABLE_KEY),
];

/** Several Check-In cycles of the TH above, plus the address resolution each one starts with. */
const CHECK_IN_TIMEOUT = Seconds(90);

/** The offset from the registered counter at and beyond which the client must refresh its key (Core § 4.22.3.4.1). */
const KEY_REFRESH_OFFSET = 2 ** 31;

type Role = "dut" | "th2";

const commissioned = new CommissionedRefs<Role>();

/** Carried from the step that established it to the ones that check against it. */
let registration: CertIcdRegistration | undefined;
let refreshFrom: { thLog: number; events: number } | undefined;

function requireRegistration() {
    if (registration === undefined) {
        throw new InternalError("step 1 did not register the DUT");
    }
    return registration;
}

/** TH2 sends `TestEventTrigger` to TH1 and the TH's log shows the key and trigger it carried. */
async function sendTestEventTrigger(cx: CertStepContext, ref: CertNodeRef, eventTrigger: bigint, label: string) {
    const th = cx.devices.th;
    const from = th.log.mark();

    try {
        await cx.controllers.th2
            .node(ref)
            .invoke("GeneralDiagnostics", "testEventTrigger", { enableKey: ENABLE_KEY, eventTrigger }, ROOT_ENDPOINT);
    } catch (e) {
        record(cx, { type: "response", verdict: "fail", detail: describeError(e) }, `${label} response`);
        return;
    }
    record(cx, { type: "response", verdict: "pass", detail: "status=Success" }, `${label} response`);

    const invoke = await expectCommandInvoke(
        th.log,
        th.flavor,
        ROOT_ENDPOINT,
        GENERAL_DIAGNOSTICS_ID,
        TEST_EVENT_TRIGGER_ID,
        [
            { id: 0, value: ENABLE_KEY },
            { id: 1, value: eventTrigger },
        ],
        from,
        LOG_TIMEOUT,
    );
    record(cx, invoke, `CommandDataIB log for ${label}, EnableKey and EventTrigger`);
}

function offsetOf(counter: number, counterStart: number) {
    return (counter - counterStart) >>> 0;
}

certTest("TC-ICDB-1.3", {
    plan: "icdbehavior.adoc",
    pics: ["ICDB.C"],
    app: "lit-icd",
    controllers: { dut: "dut", th2: "helper" },
    appArgs: { th: TH_ARGS },

    // A TH that persists subscriptions sends no Check-In to a client with a persisted one, and the DUT holds a
    // subscription before it registers. Only this project's own image carries the chip variant without persistence,
    // and chip-docker runs no variant
    appVariant: { matterjs: "nopersist" },
    chipBinsSources: ["matterjs"],
    flavors: ["chip-local", "matterjs"],
})
    .step(
        "0",
        "Preconditions: commission TH1 to the DUT, and to TH2 through a window the DUT opens.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const dutRef = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", dutRef);

            const { manualPairingCode } = await dut
                .node(dutRef)
                .openCommissioningWindow({ timeout: 180, enhanced: true });
            if (manualPairingCode === undefined) {
                throw new InternalError("openCommissioningWindow({enhanced: true}) returned no manualPairingCode");
            }
            const th2Ref = await cx.controllers.th2.commission({ manualPairingCode });
            commissioned.set("th2", th2Ref);

            // TH2 only sends test event triggers. Unsubscribed while TH1 is still SIT, it never registers itself once
            // TH1 turns LIT, so TH1's only Check-In client is the DUT
            await cx.controllers.th2.node(th2Ref).icdClient().stopSubscription();
        },
        {
            pics: "ICDB.C",
            expected:
                "TH1 is on the DUT's fabric and on TH2's, so TH2 can send it test event triggers. TH2 ends its own " +
                "subscription, so it does not register as a Check-In client once TH1 turns LIT (checked in step 1).",
        },
    )
    .step(
        1,
        "DUT sends RegisterClient command with CheckInNodeID, MonitoredSubject and Key1.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const icd = cx.controllers.dut.node(ref).icdClient();
            const from = th.log.mark();

            // TH1 has a second administrator, TH2, which is the plan's own topology
            registration = await icd.register({ allowMultiAdmin: true });
            record(
                cx,
                { type: "response", verdict: "pass", detail: `ICDCounter1=${registration.icdCounter}` },
                "RegisterClient response",
            );

            const invoke = await expectCommandInvoke(
                th.log,
                th.flavor,
                ROOT_ENDPOINT,
                ICD_MANAGEMENT_ID,
                REGISTER_CLIENT_ID,
                icdRegisterClientFields(registration.nodeId, registration.key),
                from,
                LOG_TIMEOUT,
            );
            record(
                cx,
                invoke,
                "CommandDataIB log for RegisterClient with CheckInNodeID, MonitoredSubject, Key1, ClientType",
            );

            // An ICD sends Check-Ins only to a client without an active subscription (Core § 9.15), and the DUT
            // subscribed when it commissioned TH1. The first Check-In shows the ones the later steps rely on arrive
            await icd.stopSubscription();
            const checkIn = (await waitForEvent(cx, "checkIn", 0, "first Check-In after registration"))?.event;
            // Read by TH2, so fabric-filtered to TH2's own registrations
            const th2Clients = await cx.controllers.th2.node(commissioned.require("th2")).readAttribute({
                endpoint: ROOT_ENDPOINT,
                cluster: ICD_MANAGEMENT_ID,
                attribute: REGISTERED_CLIENTS_ID,
            });
            record(
                cx,
                {
                    type: "response",
                    verdict: Array.isArray(th2Clients) && th2Clients.length === 0 ? "pass" : "fail",
                    detail: `TH2's RegisteredClients on TH1: ${describeValue(th2Clients)}`,
                },
                "TH2 is not a Check-In client of TH1",
            );

            if (checkIn !== undefined) {
                cx.recorder.check({
                    type: "response",
                    verdict: "pass",
                    detail: `DUT accepted a Check-In, counter ${checkIn.counter}, offset ${offsetOf(checkIn.counter, registration.icdCounter)}`,
                });
            }
        }),
        {
            pics: "ICDB.C",
            expected:
                "TH1 answers SUCCESS with ICDCounter1, and its log shows the RegisterClient carrying Key1. Beyond " +
                "the plan, the DUT then accepts TH1's next Check-In, which the later steps depend on.",
        },
    )
    .step(
        "2a",
        "TH2 sends TestEventTrigger to TH1 for the Invalidate ICD half counter values event.",
        commissioned.withRef("th2", async (cx, ref) => {
            const icd = cx.controllers.dut.node(commissioned.require("dut")).icdClient();
            refreshFrom = { thLog: cx.devices.th.log.mark(), events: icd.events().length };
            await sendTestEventTrigger(cx, ref, INVALIDATE_HALF_COUNTER_VALUES, "TestEventTrigger (half counter)");
        }),
        {
            pics: "ICDB.C",
            expected: "TH1 answers SUCCESS.",
        },
    )
    .step(
        "2b",
        "When DUT receives a Check-In message with ICDCounter2 indicating that 2^31 counter values have been used, " +
            "it refreshes its entry with Key2 via RegisterClient.",
        commissioned.withRef("dut", async (cx, ref) => {
            const { key: key1, nodeId, icdCounter: icdCounter1 } = requireRegistration();
            if (refreshFrom === undefined) {
                throw new InternalError("step 2a did not record where the refresh starts");
            }
            const th = cx.devices.th;
            const icd = cx.controllers.dut.node(ref).icdClient();

            const found = await waitForEvent(cx, "keyRefresh", refreshFrom.events, "key refresh");
            if (found === undefined) {
                return;
            }
            const { event: refresh, index: refreshAt } = found;

            const trigger = icd
                .events()
                .slice(refreshFrom.events, refreshAt)
                .find(
                    (event): event is Extract<CertIcdEvent, { kind: "checkIn" }> =>
                        event.kind === "checkIn" && offsetOf(event.counter, icdCounter1) >= KEY_REFRESH_OFFSET,
                );
            record(
                cx,
                {
                    type: "response",
                    verdict: trigger === undefined ? "fail" : "pass",
                    detail:
                        trigger === undefined
                            ? "no Check-In with an offset of 2^31 or more preceded the key refresh"
                            : `ICDCounter2=${trigger.counter}, offset ${offsetOf(trigger.counter, icdCounter1)}`,
                },
                "Check-In showing 2^31 counter values used",
            );
            record(
                cx,
                {
                    type: "response",
                    verdict: Bytes.areEqual(refresh.key, key1) ? "fail" : "pass",
                    detail: `Key2=${Bytes.toHex(refresh.key)}, new starting counter ${refresh.counterStart}`,
                },
                "DUT re-registered with a new key",
            );

            const invoke = await expectCommandInvoke(
                th.log,
                th.flavor,
                ROOT_ENDPOINT,
                ICD_MANAGEMENT_ID,
                REGISTER_CLIENT_ID,
                icdRegisterClientFields(nodeId, refresh.key, key1),
                refreshFrom.thLog,
                LOG_TIMEOUT,
            );
            record(cx, invoke, "CommandDataIB log for the refreshing RegisterClient with Key2, VerificationKey Key1");
        }),
        {
            pics: "ICDB.C",
            expected:
                "The DUT sends RegisterClient to TH1 with CheckInNodeID, MonitoredSubject and a new Key2. Beyond the " +
                "plan, the re-registration carries Key1 as VerificationKey (Core § 9.16).",
        },
    )
    .step(
        3,
        "TH2 sends TestEventTrigger to TH1 to increase the ICD counter to an invalid value ICDCounter3.",
        commissioned.withRef("th2", async (cx, ref) => {
            const th = cx.devices.th;
            const dut = cx.controllers.dut;
            const icd = dut.node(commissioned.require("dut")).icdClient();
            const dutLog = dut.log.mark();

            await sendTestEventTrigger(cx, ref, INVALIDATE_ALL_COUNTER_VALUES, "TestEventTrigger (all counter values)");

            const thFrom = th.log.mark();

            const sent = await expectDeviceLog(
                th.log,
                th.flavor,
                { chip: /Msg TX .* Type 0000:50 /, matterjs: /Message » for: SC\/IcdCheckInMessage / },
                thFrom,
                CHECK_IN_TIMEOUT,
            );
            record(cx, sent.check, "TH1 sent a Check-In after the trigger");

            const dropped = await expectDeviceLog(
                dut.log,
                "matterjs",
                { matterjs: /Dropping replayed check-in from peer/ },
                dutLog,
                CHECK_IN_TIMEOUT,
            );
            record(cx, dropped.check, "DUT dropped the Check-In as an invalid counter");

            // ICDCounter3 repeats the last counter TH1 sent. The trigger's own exchange may wake TH1 into a Check-In
            // that is still valid, so what the DUT must not have done is accept any counter twice
            const counters = icd
                .events()
                .filter(event => event.kind === "checkIn")
                .map(event => event.counter);
            const repeated = counters.filter((counter, index) => counters.indexOf(counter) !== index);
            record(
                cx,
                {
                    type: "response",
                    verdict: repeated.length === 0 ? "pass" : "fail",
                    detail:
                        repeated.length === 0
                            ? `no counter accepted twice among ${counters.length} Check-Ins`
                            : `accepted counter(s) ${repeated.join(", ")} twice`,
                },
                "DUT accepted no Check-In with ICDCounter3",
            );
        }),
        {
            pics: "ICDB.C",
            expected:
                "TH1 answers SUCCESS and sends a Check-In whose counter repeats an earlier one. The DUT drops it " +
                "silently, logging that it did, and accepts no Check-In until the next valid one.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));

/** Waits for an ICD event and records a failure instead of throwing, so the step's evidence carries it. */
async function waitForEvent<K extends CertIcdEvent["kind"]>(
    cx: CertStepContext,
    kind: K,
    from: number,
    what: string,
): Promise<{ event: Extract<CertIcdEvent, { kind: K }>; index: number } | undefined> {
    const icd = cx.controllers.dut.node(commissioned.require("dut")).icdClient();
    try {
        return await icd.waitFor(kind, from, CHECK_IN_TIMEOUT);
    } catch (e) {
        record(cx, { type: "response", verdict: "fail", detail: describeError(e) }, what);
        return undefined;
    }
}
