/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type { AttributePathSpec } from "@matter/testing";
import { certTest } from "@matter/testing";
import { MAX_INTERVAL_CEILING_SECONDS, MIN_INTERVAL_FLOOR_SECONDS, subscribeAndModify } from "./tc-idm-4.1-support.js";
import {
    CommissionedRefs,
    expectMessageWithPath,
    expectReportAck,
    expectSequence,
    expectSubscriptionId,
    LOG_TIMEOUT,
    record,
    requireId,
    SUBSCRIBE_REQUEST_MESSAGE,
} from "./tc-support.js";

const ON_OFF = Matter.clusters.require("OnOff");
const BASIC_INFORMATION = Matter.clusters.require("BasicInformation");
const LEVEL_CONTROL = Matter.clusters.require("LevelControl");

const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const BASIC_INFORMATION_ID = requireId(BASIC_INFORMATION.id, "BasicInformation cluster");
const LEVEL_CONTROL_ID = requireId(LEVEL_CONTROL.id, "LevelControl cluster");

const ON_OFF_ATTRIBUTE = requireId(ON_OFF.attributes.require("onOff").id, "OnOff.onOff");
const LOCAL_CONFIG_DISABLED = requireId(
    BASIC_INFORMATION.attributes.require("localConfigDisabled").id,
    "BasicInformation.localConfigDisabled",
);
const NODE_LABEL = requireId(BASIC_INFORMATION.attributes.require("nodeLabel").id, "BasicInformation.nodeLabel");
const ON_OFF_TRANSITION_TIME = requireId(
    LEVEL_CONTROL.attributes.require("onOffTransitionTime").id,
    "LevelControl.onOffTransitionTime",
);

const ENDPOINT_0 = 0;
const ENDPOINT_1 = 1;

// chip's own decode dump for the request's top-level fields, verified against Test_TC_IDM_4_1.yaml's
// step-1 capture (--keepSubscriptions true). Both intervals are pinned to the exact values this test
// requests: PhysicalDeviceProperties.subscriptionIntervalBoundsFor (packages/protocol/src/peer/)
// jitters only a ceiling it derived itself, so a caller-supplied one reaches the wire unchanged —
// pinning it here is what keeps that guarantee under test.
const SUBSCRIBE_ENVELOPE_SEQUENCE = [
    SUBSCRIBE_REQUEST_MESSAGE,
    /\{\s*$/,
    /KeepSubscriptions = true,\s*$/,
    new RegExp(`MinIntervalFloorSeconds = 0x${MIN_INTERVAL_FLOOR_SECONDS.toString(16)},\\s*$`),
    new RegExp(`MaxIntervalCeilingSeconds = 0x${MAX_INTERVAL_CEILING_SECONDS.toString(16)},\\s*$`),
    /AttributePathIBs =\s*$/,
];

// chip's own field label for the spec's AttributeRequests (see Test_TC_IDM_4_1.yaml)
const SUBSCRIBE_ENVELOPE_LABEL =
    "SubscribeRequestMessage envelope (KeepSubscriptions, MinIntervalFloorSeconds, MaxIntervalCeilingSeconds, AttributePathIBs)";

const commissioned = new CommissionedRefs();

certTest("TC-IDM-4.1", {
    plan: "interactiondatamodel.adoc",
    pics: ["MCORE.IDM.C.SubscribeRequest"],
    app: "all-clusters",
})
    .step(
        1,
        "DUT sends a subscription request message to the target node/reference device for a single attribute " +
            "of any data type supported.",
        async cx => {
            const dut = cx.controllers.dut;
            const th = cx.devices.th;

            const ref = await dut.commission({
                passcode: th.commissioning.passcode,
                discriminator: th.commissioning.discriminator,
            });
            commissioned.set("dut", ref);

            const from = th.log.mark();
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: ON_OFF_ID,
                attribute: ON_OFF_ATTRIBUTE,
            };
            await dut.node(ref).subscribe(path, {
                minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
                maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: `subscribe() resolved for ${JSON.stringify(path)}`,
            });

            const pathCheck = await expectMessageWithPath(
                th.log,
                th.flavor,
                SUBSCRIBE_REQUEST_MESSAGE,
                path,
                from,
                LOG_TIMEOUT,
            );
            record(cx, pathCheck, "SubscribeRequestMessage log");

            const envelopeCheck = await expectSequence(
                th.log,
                th.flavor,
                SUBSCRIBE_ENVELOPE_LABEL,
                SUBSCRIBE_ENVELOPE_SEQUENCE,
                from,
                LOG_TIMEOUT,
            );
            record(cx, envelopeCheck, "SubscribeRequestMessage envelope");
        },
        {
            pics: "MCORE.IDM.C.SubscribeRequest",
            expected:
                "On the TH verify the subscription message received has KeepSubscriptions (bool), MinIntervalFloor " +
                "(uint16), MaxIntervalCeiling (uint16) and AttributeRequests (list of attribute paths).",
        },
    )
    .step(
        2,
        "DUT sends the subscription request message to TH. TH sends a report data. DUT sends the status " +
            "response back to TH.",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const from = th.log.mark();
            const path: AttributePathSpec = { endpoint: ENDPOINT_1, cluster: ON_OFF_ID, attribute: ON_OFF_ATTRIBUTE };

            await cx.controllers.dut.node(ref).subscribe(path, {
                minIntervalFloorSeconds: MIN_INTERVAL_FLOOR_SECONDS,
                maxIntervalCeilingSeconds: MAX_INTERVAL_CEILING_SECONDS,
            });
            cx.recorder.check({
                type: "response",
                verdict: "pass",
                detail: "subscribe() resolved after receiving and acking the priming report",
            });

            const requestCheck = await expectMessageWithPath(
                th.log,
                th.flavor,
                SUBSCRIBE_REQUEST_MESSAGE,
                path,
                from,
                LOG_TIMEOUT,
            );
            record(cx, requestCheck, "SubscribeRequestMessage log");

            // Steps 1 and 2 subscribe to the same path, so only the request line tells their
            // SubscribeResponses apart (see subscribeAndModify).
            const established = requestCheck.logLine !== undefined ? requestCheck.logLine + 1 : from;

            const idLookup = await expectSubscriptionId(th.log, th.flavor, established, LOG_TIMEOUT);
            record(cx, idLookup.check, "Subscription-id lookup");

            const logCheck = await expectReportAck(
                th.log,
                th.flavor,
                idLookup.subscriptionId,
                established,
                LOG_TIMEOUT,
            );
            record(cx, logCheck, "Priming-report status");
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest",
            expected: 'Verify on the TH that the status response received from the DUT is "Success".',
        },
    )
    .step(
        3,
        "Activate the subscription between the DUT and the TH for an attribute of data type boolean. Modify " +
            "that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        commissioned.withRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: LOCAL_CONFIG_DISABLED,
            };
            return subscribeAndModify(cx, ref, 3, path, [true, false, true]);
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest.Attribute.DataType_Bool",
            expected:
                'Verify on the TH that the status response received from the DUT for every report data sent is a "Success".',
        },
    )
    .step(
        4,
        "Activate the subscription between the DUT and the TH for an attribute of data type string. Modify " +
            "that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        commissioned.withRef("dut", (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_0,
                cluster: BASIC_INFORMATION_ID,
                attribute: NODE_LABEL,
            };
            return subscribeAndModify(cx, ref, 4, path, ["tc-idm-4-1-a", "tc-idm-4-1-b", "tc-idm-4-1-c"]);
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest.Attribute.DataType_String",
            expected:
                'Verify on the TH that the status response received from the DUT for every report data sent is a "Success".',
        },
    )
    .step(
        5,
        "Activate the subscription between the DUT and the TH for an attribute of data type unsigned integer. " +
            "Modify that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        commissioned.withRef("dut", async (cx, ref) => {
            const path: AttributePathSpec = {
                endpoint: ENDPOINT_1,
                cluster: LEVEL_CONTROL_ID,
                attribute: ON_OFF_TRANSITION_TIME,
            };
            await subscribeAndModify(cx, ref, 5, path, [1, 2, 3]);
        }),
        {
            pics: "MCORE.IDM.C.SubscribeRequest.Attribute.DataType_UnsignedInteger",
            expected:
                'Verify on the TH that the status response received from the DUT for every report data sent is a "Success".',
        },
    )
    .step(
        6,
        "Activate the subscription between the DUT and the TH for an attribute of data type signed integer. " +
            "Modify that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        async () => {},
        { notApplicable: "CHIP's certification harness names no signed-integer attribute for this step" },
    )
    .step(
        7,
        "Activate the subscription between the DUT and the TH for an attribute of data type Floating Point. " +
            "Modify that attribute on the TH. TH should send the modified data to the DUT. Modify the attribute " +
            "multiple times (3 times).",
        async () => {},
        { notApplicable: "CHIP's certification harness names no floating-point attribute for this step" },
    )
    .step(
        8,
        "Activate the subscription between the DUT and the TH for an attribute of data type list. Modify that " +
            "attribute on the TH. TH should send the modified data to the DUT. Modify the attribute multiple " +
            "times (3 times).",
        async () => {},
        { notApplicable: "CHIP's certification harness names no list attribute for this step" },
    )
    .step(
        9,
        "Activate the subscription between the DUT and the TH for an attribute. Force the TH to not send any " +
            "report data for the duration of the maximum interval. After the maximum interval, TH sends a " +
            "report data with the subscription id created during the subscription activation.",
        async () => {},
        {
            notApplicable:
                "Not verifiable/Out of scope in CHIP's certification harness: forcing the TH to withhold reports " +
                "and replay an expired subscription id has no defined mechanism",
        },
    )
    .step(
        10,
        "DUT sends a subscription request message to the target node/reference device for multiple attributes " +
            "(>1 attributes).",
        async () => {},
        {
            notApplicable:
                "CertNodeApi.subscribe accepts a single AttributePathSpec and SubscribeOptions.onUpdate has no " +
                "per-path attribution — one subscription cannot carry the three concrete paths this step needs " +
                "without an adapter API change (see AGENTS.md)",
        },
    )
    .finalize(cx => commissioned.decommissionAll(cx));
