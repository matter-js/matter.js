/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError, Seconds } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertIcdEvent, CertIcdRegistration, CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { RecordedCheck } from "./tc-support.js";
import {
    attempt,
    CommissionedRefs,
    describeValue,
    expectCommandInvoke,
    expectDeviceLog,
    icdRegisterClientFields,
    LOG_TIMEOUT,
    recordAll,
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

/**
 * TH2 sends `TestEventTrigger` to TH1, judged by the response and the TH's log of the key and trigger it carried.
 * `sentAt` marks the TH's log right after the response.
 */
async function sendTestEventTrigger(cx: CertStepContext, ref: CertNodeRef, eventTrigger: bigint, label: string) {
    const th = cx.devices.th;
    const from = th.log.mark();

    const response = await attempt(
        () =>
            cx.controllers.th2
                .node(ref)
                .invoke(
                    "GeneralDiagnostics",
                    "testEventTrigger",
                    { enableKey: ENABLE_KEY, eventTrigger },
                    ROOT_ENDPOINT,
                ),
        () => "status=Success",
    );
    const sentAt = th.log.mark();

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

    const checks: RecordedCheck[] = [
        { what: `${label} response`, check: () => response.check },
        { what: `CommandDataIB log for ${label}, EnableKey and EventTrigger`, check: () => invoke },
    ];
    return { checks, sentAt };
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
            const response = await attempt(
                () => icd.register({ allowMultiAdmin: true }),
                ({ icdCounter }) => `ICDCounter1=${icdCounter}`,
            );
            registration = response.ok ? response.value : undefined;
            const checks: RecordedCheck[] = [{ what: "RegisterClient response", check: () => response.check }];
            if (registration === undefined) {
                return recordAll(cx, checks);
            }
            const { nodeId, key, icdCounter } = registration;

            const invoke = await expectCommandInvoke(
                th.log,
                th.flavor,
                ROOT_ENDPOINT,
                ICD_MANAGEMENT_ID,
                REGISTER_CLIENT_ID,
                icdRegisterClientFields(nodeId, key),
                from,
                LOG_TIMEOUT,
            );

            // An ICD sends Check-Ins only to a client without an active subscription (Core § 9.15), and the DUT
            // subscribed when it commissioned TH1. The first Check-In shows the ones the later steps rely on arrive
            const checkIn = await attempt(
                async () => {
                    await icd.stopSubscription();
                    return (await icd.waitFor("checkIn", 0, CHECK_IN_TIMEOUT)).event;
                },
                ({ counter }) => `DUT accepted a Check-In, counter ${counter}, offset ${offsetOf(counter, icdCounter)}`,
            );

            // Read by TH2, so fabric-filtered to TH2's own registrations
            const th2Clients = await attempt(
                () =>
                    cx.controllers.th2.node(commissioned.require("th2")).readAttribute({
                        endpoint: ROOT_ENDPOINT,
                        cluster: ICD_MANAGEMENT_ID,
                        attribute: REGISTERED_CLIENTS_ID,
                    }),
                clients => `TH2's RegisteredClients on TH1: ${describeValue(clients)}`,
            );
            const th2IsClient = !th2Clients.ok || !Array.isArray(th2Clients.value) || th2Clients.value.length !== 0;

            await recordAll(cx, [
                ...checks,
                {
                    what: "CommandDataIB log for RegisterClient with CheckInNodeID, MonitoredSubject, Key1, ClientType",
                    check: () => invoke,
                },
                { what: "DUT ended its subscription and accepted a Check-In", check: () => checkIn.check },
                {
                    what: "TH2 is not a Check-In client of TH1",
                    check: () => (th2IsClient ? { ...th2Clients.check, verdict: "fail" } : th2Clients.check),
                },
            ]);
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
            const { checks } = await sendTestEventTrigger(
                cx,
                ref,
                INVALIDATE_HALF_COUNTER_VALUES,
                "TestEventTrigger (half counter)",
            );
            await recordAll(cx, checks);
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
            const start = refreshFrom;
            const th = cx.devices.th;
            const icd = cx.controllers.dut.node(ref).icdClient();

            const refresh = await attempt(
                () => icd.waitFor("keyRefresh", start.events, CHECK_IN_TIMEOUT),
                ({ event }) => `DUT refreshed its key, new starting counter ${event.counterStart}`,
            );
            const checks: RecordedCheck[] = [{ what: "key refresh", check: () => refresh.check }];
            if (!refresh.ok) {
                return recordAll(cx, checks);
            }
            const { event: refreshed, index: refreshAt } = refresh.value;

            const trigger = icd
                .events()
                .slice(start.events, refreshAt)
                .find(
                    (event): event is Extract<CertIcdEvent, { kind: "checkIn" }> =>
                        event.kind === "checkIn" && offsetOf(event.counter, icdCounter1) >= KEY_REFRESH_OFFSET,
                );

            const invoke = await expectCommandInvoke(
                th.log,
                th.flavor,
                ROOT_ENDPOINT,
                ICD_MANAGEMENT_ID,
                REGISTER_CLIENT_ID,
                icdRegisterClientFields(nodeId, refreshed.key, key1),
                start.thLog,
                LOG_TIMEOUT,
            );

            await recordAll(cx, [
                ...checks,
                {
                    what: "Check-In showing 2^31 counter values used",
                    check: () => ({
                        type: "response",
                        verdict: trigger === undefined ? "fail" : "pass",
                        detail:
                            trigger === undefined
                                ? "no Check-In with an offset of 2^31 or more preceded the key refresh"
                                : `ICDCounter2=${trigger.counter}, offset ${offsetOf(trigger.counter, icdCounter1)}`,
                    }),
                },
                {
                    what: "DUT re-registered with a new key",
                    check: () => ({
                        type: "response",
                        verdict: Bytes.areEqual(refreshed.key, key1) ? "fail" : "pass",
                        detail: `Key2=${Bytes.toHex(refreshed.key)}`,
                    }),
                },
                {
                    what: "CommandDataIB log for the refreshing RegisterClient with Key2, VerificationKey Key1",
                    check: () => invoke,
                },
            ]);
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

            const { checks, sentAt } = await sendTestEventTrigger(
                cx,
                ref,
                INVALIDATE_ALL_COUNTER_VALUES,
                "TestEventTrigger (all counter values)",
            );

            const sent = await expectDeviceLog(
                th.log,
                th.flavor,
                { chip: /Msg TX .* Type 0000:50 /, matterjs: /Message » for: SC\/IcdCheckInMessage / },
                sentAt,
                CHECK_IN_TIMEOUT,
            );

            const dropped = await expectDeviceLog(
                dut.log,
                "matterjs",
                { matterjs: /Dropping replayed check-in from peer/ },
                dutLog,
                CHECK_IN_TIMEOUT,
            );

            // ICDCounter3 repeats the last counter TH1 sent. The trigger's own exchange may wake TH1 into a Check-In
            // that is still valid, so what the DUT must not have done is accept any counter twice
            const counters = icd
                .events()
                .filter(event => event.kind === "checkIn")
                .map(event => event.counter);
            const repeated = counters.filter((counter, index) => counters.indexOf(counter) !== index);

            await recordAll(cx, [
                ...checks,
                { what: "TH1 sent a Check-In after the trigger", check: () => sent.check },
                { what: "DUT dropped the Check-In as an invalid counter", check: () => dropped.check },
                {
                    what: "DUT accepted no Check-In with ICDCounter3",
                    check: () => ({
                        type: "response",
                        verdict: repeated.length === 0 ? "pass" : "fail",
                        detail:
                            repeated.length === 0
                                ? `no counter accepted twice among ${counters.length} Check-Ins`
                                : `accepted counter(s) ${repeated.join(", ")} twice`,
                    }),
                },
            ]);
        }),
        {
            pics: "ICDB.C",
            expected:
                "TH1 answers SUCCESS and sends a Check-In whose counter repeats an earlier one. The DUT drops it " +
                "silently, logging that it did, and accepts no Check-In until the next valid one.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
