/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext } from "@matter/testing";
import { certTest } from "@matter/testing";
import {
    commissionByQr,
    COMMISSIONING_LOG_TIMEOUT,
    CommissioningRefusals,
    recordCommissionable,
    recordDiscriminatorHonored,
    recordParse,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, expectCommandInvoke, record, requireId, runCleanups } from "./tc-support.js";

const DESCRIPTOR = Matter.clusters.require("Descriptor");
const DESCRIPTOR_ID = requireId(DESCRIPTOR.id, "Descriptor cluster");
const PARTS_LIST = requireId(DESCRIPTOR.attributes.require("partsList").id, "Descriptor.partsList");
const DEVICE_TYPE_LIST = requireId(DESCRIPTOR.attributes.require("deviceTypeList").id, "Descriptor.deviceTypeList");

const ON_OFF = Matter.clusters.require("OnOff");
const ON_OFF_ID = requireId(ON_OFF.id, "OnOff cluster");
const ON = requireId(ON_OFF.commands.require("on").id, "OnOff.on");
const ON_OFF_ATTRIBUTE = requireId(ON_OFF.attributes.require("onOff").id, "OnOff.onOff");

const ROOT_ENDPOINT = 0;

/** `MA-onofflight`, the device type the plan requires on at least two non-zero endpoints. */
const ON_OFF_LIGHT_DEVICE_TYPE = 0x0100;

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();

function isDeviceType(entry: unknown, deviceType: number): boolean {
    return typeof entry === "object" && entry !== null && "deviceType" in entry && entry.deviceType === deviceType;
}

/**
 * The TH's own endpoints implementing the On/Off light device type, read off its descriptors rather
 * than assumed: the plan states the topology as a requirement on the TH, and this TC's two device
 * flavors are separate implementations of it.
 */
async function onOffLightEndpoints(cx: CertStepContext, ref: CertNodeRef): Promise<number[]> {
    const node = cx.controllers.dut.node(ref);

    const parts = await node.readAttribute({
        endpoint: ROOT_ENDPOINT,
        cluster: DESCRIPTOR_ID,
        attribute: PARTS_LIST,
    });
    if (!Array.isArray(parts)) {
        throw new InternalError(`TH reported a parts list that is not a list: ${JSON.stringify(parts)}`);
    }

    const endpoints = new Array<number>();
    for (const part of parts) {
        if (typeof part !== "number") {
            throw new InternalError(`TH reported a parts list entry that is not an endpoint: ${JSON.stringify(part)}`);
        }
        const deviceTypes = await node.readAttribute({
            endpoint: part,
            cluster: DESCRIPTOR_ID,
            attribute: DEVICE_TYPE_LIST,
        });
        if (!Array.isArray(deviceTypes)) {
            throw new InternalError(
                `TH endpoint ${part} reported a device type list that is not a list: ${JSON.stringify(deviceTypes)}`,
            );
        }
        if (deviceTypes.some(entry => isDeviceType(entry, ON_OFF_LIGHT_DEVICE_TYPE))) {
            endpoints.push(part);
        }
    }
    return endpoints;
}

certTest("TC-DD-3.21", {
    plan: "devicediscovery.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "MCORE.DD.QR_COMMISSIONING"],
    app: "all-clusters",
})
    .step(
        "0",
        "Precondition: the DUT is a commissioner that uses the discriminator its onboarding code names.",
        cx => recordDiscriminatorHonored(cx, refusals),
        {
            expected:
                "DUT does not commission the TH from a code naming a discriminator no device advertises. " +
                "Every later step's commissioning rests on this.",
        },
    )
    .step(
        1,
        "Place TH into commissioning mode using the TH manufacturer's means to be discovered by the DUT Commissioner",
        recordCommissionable,
        { expected: "Verify that the TH is advertising and able to be discovered by the DUT commissioner." },
    )
    .step(
        "2.a",
        "Scan TH's QR code using the DUT Commissioner.",
        async cx => {
            await recordParse(cx, await thQrPayload(cx.devices.th));
        },
        { pics: "MCORE.DD.SCAN_QR_CODE", expected: "Verify the QR code has been scanned successfully." },
    )
    .step(
        "2.b",
        "DUT parses TH's QR code. Follow any steps needed for the Commissioner/Commissionee to complete the " +
            "commissioning process over the TH Commissionee's method of device discovery",
        async cx => {
            const payload = await thQrPayload(cx.devices.th);
            await commissionByQr(cx, payload, commissioned);
        },
        {
            expected:
                "DUT parses TH's QR code and DUT commissions TH to the Matter network. Verify that the TH has " +
                "been commissioned onto the Matter network.",
        },
    )
    .step(
        3,
        "For each TH Endpoint that implements the On/Off light device, verify that the DUT acknowledges the " +
            "existence of the Endpoint through DUT issuing an On command to the respective Endpoint",
        commissioned.withRef("dut", async (cx, ref) => {
            const th = cx.devices.th;
            const endpoints = await onOffLightEndpoints(cx, ref);

            record(
                cx,
                {
                    type: "response",
                    verdict: endpoints.length >= 2 ? "pass" : "fail",
                    detail: `TH implements the On/Off light device type on endpoints ${JSON.stringify(endpoints)}`,
                },
                "TH endpoint topology",
            );

            for (const endpoint of endpoints) {
                const from = th.log.mark();
                await cx.controllers.dut.node(ref).invoke("OnOff", "on", {}, endpoint);
                record(
                    cx,
                    await expectCommandInvoke(
                        th.log,
                        th.flavor,
                        endpoint,
                        ON_OFF_ID,
                        ON,
                        [],
                        from,
                        COMMISSIONING_LOG_TIMEOUT,
                    ),
                    `OnOff.on reached endpoint ${endpoint}`,
                );

                const onOff = await cx.controllers.dut
                    .node(ref)
                    .readAttribute({ endpoint, cluster: ON_OFF_ID, attribute: ON_OFF_ATTRIBUTE });
                record(
                    cx,
                    {
                        type: "response",
                        verdict: onOff === true ? "pass" : "fail",
                        detail: `endpoint ${endpoint} reports OnOff.onOff = ${JSON.stringify(onOff)} after the command`,
                    },
                    `Endpoint ${endpoint} turned on`,
                );
            }
        }),
        {
            expected:
                "TH verifies that the DUT has successfully sent the On command to each of the endpoints which " +
                "expose an On/Off light device type.",
        },
    )
    .finalize(cx =>
        runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
        ),
    );
