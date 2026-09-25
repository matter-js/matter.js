/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertIcdClientApi, CertIcdRegistration, CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import type { CommandFieldValue, RecordedCheck } from "./tc-support.js";
import {
    attempt,
    CommissionedRefs,
    expectCommandInvoke,
    icdRegisterClientFields,
    LOG_TIMEOUT,
    recordAll,
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

/**
 * Has the DUT send one IcdManagement command, and records its response and the TH's log of the command before
 * failing the step. `fields` as a function depends on what the DUT sent, so a failed send leaves the log unchecked.
 */
async function sendAndCheck<T>(
    cx: CertStepContext,
    ref: CertNodeRef,
    options: {
        command: string;
        commandId: number;
        what: string;
        send: (icd: CertIcdClientApi) => Promise<T>;
        describe: (value: T) => string;
        fields: CommandFieldValue[] | ((value: T) => CommandFieldValue[]);
    },
) {
    const { command, commandId, what, send, describe, fields } = options;
    const th = cx.devices.th;
    const from = th.log.mark();

    const response = await attempt(() => send(cx.controllers.dut.node(ref).icdClient()), describe);
    const checks: RecordedCheck[] = [{ what: `${command} response`, check: () => response.check }];

    const expected = Array.isArray(fields) ? fields : response.ok ? fields(response.value) : undefined;
    if (expected !== undefined) {
        const invoke = await expectCommandInvoke(
            th.log,
            th.flavor,
            ROOT_ENDPOINT,
            ICD_MANAGEMENT_ID,
            commandId,
            expected,
            from,
            LOG_TIMEOUT,
        );
        checks.push({ what: `CommandDataIB log for ${command} with ${what}`, check: () => invoke });
    }

    await recordAll(cx, checks);
}

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
        commissioned.withRef("dut", (cx, ref) =>
            sendAndCheck(cx, ref, {
                command: "RegisterClient",
                commandId: REGISTER_CLIENT_ID,
                what: "CheckInNodeID, MonitoredSubject, Key, ClientType",
                send: async icd => (registration = await icd.register()),
                describe: ({ icdCounter }) => `ICDCounter=${icdCounter}`,
                fields: ({ nodeId, key }) => icdRegisterClientFields(nodeId, key),
            }),
        ),
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
            const { nodeId, key } = registration;
            await sendAndCheck(cx, ref, {
                command: "UnregisterClient",
                commandId: UNREGISTER_CLIENT_ID,
                what: "CheckInNodeID, VerificationKey",
                fields: [
                    { id: 0, value: nodeId },
                    { id: 1, value: key },
                ],
                send: icd => icd.unregister(),
                describe: () => "status=Success",
            });
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
        commissioned.withRef("dut", (cx, ref) =>
            sendAndCheck(cx, ref, {
                command: "StayActiveRequest",
                commandId: STAY_ACTIVE_REQUEST_ID,
                what: "StayActiveDuration",
                fields: [{ id: 0, value: STAY_ACTIVE_DURATION_MS }],
                send: icd => icd.stayActive(STAY_ACTIVE_DURATION_MS),
                describe: promised => `PromisedActiveDuration=${promised}`,
            }),
        ),
        {
            pics: "ICDM.C.C03.Tx",
            expected: "TH receives StayActiveRequest with the StayActiveDuration the DUT asked for, as uint32.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
