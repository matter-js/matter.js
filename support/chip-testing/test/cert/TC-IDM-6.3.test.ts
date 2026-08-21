/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { EventPathSpec } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    CertCheckFailedError,
    CommissionedRefs,
    EVENT_PATH_IBS_SEQUENCE,
    eventPathIBSequence,
    expectSequence,
    fabricFilteredPattern,
    LOG_TIMEOUT,
    READ_REQUEST_MESSAGE,
    record,
    requireId,
} from "./tc-support.js";

const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const START_UP_EVENT = requireId(BASIC_INFORMATION.events.require("startUp").id, "BasicInformation.startUp");

const ENDPOINT_0 = 0;

// Test_TC_IDM_6_3.yaml's own capture reads every event of every cluster, whose EventPathIB is empty
// and so carries nothing to verify field by field. This is the concrete path Test_TC_IDM_6_4.yaml
// names for the same TH app, which the plan's "for a supported event" wording asks for and which the
// log check below can confirm one field at a time.
const EVENT_PATH: EventPathSpec = { endpoint: ENDPOINT_0, cluster: BASIC_INFORMATION_ID, event: START_UP_EVENT };

const READ_EVENT_SEQUENCE = [
    READ_REQUEST_MESSAGE,
    /\{\s*$/,
    ...EVENT_PATH_IBS_SEQUENCE,
    ...eventPathIBSequence(EVENT_PATH),
];

const commissioned = new CommissionedRefs();

certTest("TC-IDM-6.3", {
    plan: "interactiondatamodel.adoc",
    pics: ["MCORE.IDM.C", "MCORE.IDM.C.ReadRequest", "MCORE.IDM.C.ReadEvent"],
    app: "all-clusters",
})
    .step(
        1,
        "DUT sends Read Request Message to the TH for a supported event.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const from = th.log.mark();
            const events = await dut.node(ref).readEvents([EVENT_PATH]);

            // A node holding no record for the path answers with neither data nor a status, so the
            // request completing is what this step proves; every event that did arrive must be the
            // one asked for.
            const foreign = events.filter(
                event =>
                    event.endpoint !== EVENT_PATH.endpoint ||
                    event.cluster !== EVENT_PATH.cluster ||
                    event.event !== EVENT_PATH.event,
            );
            cx.recorder.check({
                type: "response",
                verdict: foreign.length ? "fail" : "pass",
                detail: foreign.length
                    ? `readEvents returned ${foreign.length} event(s) outside the requested path: ${JSON.stringify(foreign)}`
                    : `readEvents ${JSON.stringify(EVENT_PATH)} resolved with ${events.length} event(s)`,
            });
            if (foreign.length) {
                throw new CertCheckFailedError(
                    `readEvents returned events outside the requested path: ${JSON.stringify(foreign)}`,
                );
            }

            const pathCheck = await expectSequence(
                th.log,
                th.flavor,
                `ReadRequestMessage EventPathIBs ${JSON.stringify(EVENT_PATH)}`,
                READ_EVENT_SEQUENCE,
                from,
                LOG_TIMEOUT,
            );
            record(cx, pathCheck, "ReadRequestMessage event path");

            // The plan's expected outcome names FabricFiltered alongside EventRequests; it sits after
            // the path list in the same message, separated from it by the list's own closing lines.
            const fabricFilteredCheck = await expectSequence(
                th.log,
                th.flavor,
                "ReadRequestMessage isFabricFiltered",
                [fabricFilteredPattern(true)],
                pathCheck.logLine === undefined ? from : pathCheck.logLine + 1,
                LOG_TIMEOUT,
            );
            record(cx, fabricFilteredCheck, "ReadRequestMessage isFabricFiltered");
        },
        {
            expected:
                "Verify on the TH that the Read Request Message received has these fields " +
                "EventRequests - list of request paths to cluster events. Should be a valid EventPathIB from the " +
                "Valid Event Paths table and not target a group. " +
                "EventFilters - list of minimum event numbers per specific node. (Optional) " +
                "FabricFiltered which is of type bool.",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
