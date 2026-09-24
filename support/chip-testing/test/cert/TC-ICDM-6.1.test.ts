/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertIcdRegistration } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    CommissionedRefs,
    describeError,
    expectCommandInvoke,
    icdRegisterClientFields,
    LOG_TIMEOUT,
    record,
    requireId,
} from "./tc-support.js";

const ICD_MANAGEMENT = Matter.clusters.require("IcdManagement");
const ICD_MANAGEMENT_ID = requireId(ICD_MANAGEMENT.id, "IcdManagement cluster");
const REGISTER_CLIENT_ID = requireId(ICD_MANAGEMENT.commands.require("registerClient").id, "RegisterClient");
const UNREGISTER_CLIENT_ID = requireId(ICD_MANAGEMENT.commands.require("unregisterClient").id, "UnregisterClient");
const STAY_ACTIVE_REQUEST_ID = requireId(ICD_MANAGEMENT.commands.require("stayActiveRequest").id, "StayActiveRequest");

const ROOT_ENDPOINT = 0;

const STAY_ACTIVE_DURATION_MS = 10_000;

const commissioned = new CommissionedRefs<"dut">();

let registration: CertIcdRegistration | undefined;

certTest("TC-ICDM-6.1", {
    plan: "icdmanagement.adoc",
    pics: ["ICDM.C"],
    app: "lit-icd",

    // The variant TC-ICDB-1.3 needs is the only lit-icd binary this project's image carries; this case does not
    // depend on how it handles subscriptions
    appVariant: { matterjs: "nopersist" },
    chipBinsSources: ["matterjs"],
    flavors: ["chip-local", "matterjs"],
})
    .step(
        "0",
        "Commission TH to DUT.",
        async cx => {
            const th = cx.devices.th;
            commissioned.set(
                "dut",
                await cx.controllers.dut.commission({
                    passcode: th.commissioning.passcode,
                    discriminator: th.commissioning.discriminator,
                }),
            );
        },
        { pics: "ICDM.C", expected: "TH is on the DUT's fabric." },
    )
    .step(
        1,
        "DUT issues a RegisterClient command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const from = th.log.mark();

            try {
                registration = await cx.controllers.dut.node(ref).icdClient().register();
            } catch (e) {
                record(cx, { type: "response", verdict: "fail", detail: describeError(e) }, "RegisterClient response");
                return;
            }
            record(
                cx,
                { type: "response", verdict: "pass", detail: `ICDCounter=${registration.icdCounter}` },
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
            record(cx, invoke, "CommandDataIB log for RegisterClient with CheckInNodeID, MonitoredSubject, Key");
        }),
        {
            pics: "ICDM.C.C00.Tx",
            expected:
                "TH receives RegisterClient with CheckInNodeID and MonitoredSubject as the DUT's node id, a Key " +
                "and ClientType.",
        },
    )
    .step(
        2,
        "DUT issues an UnregisterClient command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            if (registration === undefined) {
                throw new InternalError("step 1 did not register the DUT");
            }
            const th = cx.devices.th;
            const from = th.log.mark();

            const { nodeId, key } = registration;
            try {
                await cx.controllers.dut.node(ref).icdClient().unregister();
            } catch (e) {
                record(
                    cx,
                    { type: "response", verdict: "fail", detail: describeError(e) },
                    "UnregisterClient response",
                );
                return;
            }
            record(cx, { type: "response", verdict: "pass", detail: "status=Success" }, "UnregisterClient response");

            const invoke = await expectCommandInvoke(
                th.log,
                th.flavor,
                ROOT_ENDPOINT,
                ICD_MANAGEMENT_ID,
                UNREGISTER_CLIENT_ID,
                [
                    { id: 0, value: nodeId },
                    { id: 1, value: key },
                ],
                from,
                LOG_TIMEOUT,
            );
            record(cx, invoke, "CommandDataIB log for UnregisterClient with CheckInNodeID, VerificationKey");
        }),
        {
            pics: "ICDM.C.C02.Tx",
            expected:
                "TH receives UnregisterClient with CheckInNodeID as the DUT's node id and, as VerificationKey, the " +
                "key the DUT registered in step 1.",
        },
    )
    .step(
        3,
        "DUT issues a StayActiveRequest command to the Test Harness.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const from = th.log.mark();

            try {
                const promised = await cx.controllers.dut.node(ref).icdClient().stayActive(STAY_ACTIVE_DURATION_MS);
                record(
                    cx,
                    { type: "response", verdict: "pass", detail: `PromisedActiveDuration=${promised}` },
                    "StayActiveResponse",
                );
            } catch (e) {
                record(cx, { type: "response", verdict: "fail", detail: describeError(e) }, "StayActiveResponse");
                return;
            }

            const invoke = await expectCommandInvoke(
                th.log,
                th.flavor,
                ROOT_ENDPOINT,
                ICD_MANAGEMENT_ID,
                STAY_ACTIVE_REQUEST_ID,
                [{ id: 0, value: STAY_ACTIVE_DURATION_MS }],
                from,
                LOG_TIMEOUT,
            );
            record(cx, invoke, "CommandDataIB log for StayActiveRequest with StayActiveDuration");
        }),
        {
            pics: "ICDM.C.C03.Tx",
            expected: "TH receives StayActiveRequest with the StayActiveDuration the DUT asked for, as uint32.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
