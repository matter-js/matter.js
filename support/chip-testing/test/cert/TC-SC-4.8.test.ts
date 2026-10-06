/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertDevice, CertStepContext, CheckRecord, LogExpectPatterns } from "@matter/testing";
import { certTest, forFlavor } from "@matter/testing";
import {
    commissionByQr,
    COMMISSIONING_LOG_TIMEOUT,
    markTransition,
    recordBackInCommissioningMode,
    recordUnpair,
    thQrPayload,
} from "./tc-dd-support.js";
import { CommissionedRefs, expectDeviceLog, record, runCleanups } from "./tc-support.js";

type Th = "th1" | "th2";

// One per device, since both are commissioned by the same controller (see commissionByQr)
const commissioned: Record<Th, CommissionedRefs> = { th1: new CommissionedRefs(), th2: new CommissionedRefs() };

/** What each TH advertised in steps 1 and 2; steps 3 and 4 compare against it. */
const firstAssigned = new Map<Th, string | undefined>();

const OPERATIONAL_INSTANCE = /^[0-9A-F]{16}-([0-9A-F]{16})\._matter\._tcp\.local$/;

/**
 * A device's announcement that it advertises `nodeId` on a fabric, capturing the compressed fabric id
 * it computed. chip prints both ids as fixed-width uppercase hex (`ChipLogFormatX64`), matter.js
 * prints the operational instance name it publishes.
 */
function operationalAdvertisement(nodeId: string): LogExpectPatterns {
    return {
        chip: new RegExp(`Advertise operational node ([0-9A-F]{16})-${nodeId}(?![0-9A-F])`),
        matterjs: new RegExp(
            `MdnsAdvertisement Publishing kind: operational service: mdns:([0-9A-F]{16})-${nodeId}\\.`,
        ),
    };
}

function device(cx: CertStepContext, th: Th): CertDevice {
    const subject = cx.devices[th];
    if (subject === undefined) {
        throw new InternalError(`TC-SC-4.8 requires device ${th}`);
    }
    return subject;
}

/**
 * Commissions `th` and returns the compressed fabric id the TH itself states it advertises for the node
 * id the DUT assigned it — the TH's own computation from the root certificate and fabric id the DUT
 * installed. `payloadFrom` is the log cursor a chip TH's onboarding payload is read at.
 *
 * Returns `undefined` where the TH's flavor has no pattern; the check is then recorded unverified.
 */
async function commissionAndExtract(cx: CertStepContext, th: Th, payloadFrom = 0): Promise<string | undefined> {
    const subject = device(cx, th);
    const who = th.toUpperCase();

    const from = await markTransition(cx, subject);
    await commissionByQr(cx, await thQrPayload(subject, payloadFrom), commissioned[th], subject);

    const instance = await cx.controllers.dut.node(commissioned[th].require("dut")).operationalMdnsInstanceName();
    const parts = OPERATIONAL_INSTANCE.exec(instance);
    if (parts === null) {
        throw new InternalError(`DUT names ${who}'s operational instance ${instance}, not <cfid>-<node-id>`);
    }
    const nodeId = parts[1];

    const patterns = operationalAdvertisement(nodeId);
    const advertised = await expectDeviceLog(subject.log, subject.flavor, patterns, from, COMMISSIONING_LOG_TIMEOUT);
    record(cx, advertised.check, `${who} advertised its operational node ${nodeId}`);
    if (advertised.check.verdict !== "pass") {
        return undefined;
    }

    const compressedFabricId = forFlavor(patterns, subject.flavor)?.exec(advertised.check.matched ?? "")?.[1];
    if (compressedFabricId === undefined) {
        throw new InternalError(`Matched an operational advertisement naming no fabric: ${advertised.check.matched}`);
    }
    return compressedFabricId;
}

function recordSame(cx: CertStepContext, actual: string | undefined, expected: string | undefined, what: string) {
    if (actual === undefined || expected === undefined) {
        const unknown: CheckRecord = {
            type: "response",
            verdict: "unverified",
            detail: `${what}: a compressed fabric id is unknown`,
        };
        record(cx, unknown, what);
        return;
    }
    record(
        cx,
        {
            type: "response",
            verdict: actual === expected ? "pass" : "fail",
            detail: `${what}: ${actual} against ${expected}`,
        },
        what,
    );
}

async function recommission(cx: CertStepContext, th: Th) {
    const who = th.toUpperCase();
    if (!firstAssigned.has(th)) {
        throw new InternalError(`Step ran before ${who} was first commissioned`);
    }
    const subject = device(cx, th);
    const since = await recordUnpair(cx, commissioned[th], subject);
    await recordBackInCommissioningMode(cx, { since, th: subject });

    const current = await commissionAndExtract(cx, th, since);
    recordSame(cx, current, firstAssigned.get(th), `${who} compressed fabric id unchanged`);
}

certTest("TC-SC-4.8", {
    plan: "securechannel.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER"],
    app: "all-clusters",
    devices: { th1: "all-clusters", th2: "all-clusters" },
})
    .step(
        1,
        "Commission TH1 to DUT's Fabric",
        async cx => {
            firstAssigned.clear();
            firstAssigned.set("th1", await commissionAndExtract(cx, "th1"));
        },
        { expected: "Extract the Compressed Fabric ID assigned from DUT to TH1 and save the value for future use" },
    )
    .step(
        2,
        "Commission TH2 to DUT's Fabric",
        async cx => {
            if (!firstAssigned.has("th1")) {
                throw new InternalError("Step ran before TH1 was commissioned");
            }
            const th2 = await commissionAndExtract(cx, "th2");
            firstAssigned.set("th2", th2);
            recordSame(cx, th2, firstAssigned.get("th1"), "TH2 and TH1 share a compressed fabric id");
        },
        {
            expected:
                "Extract the Compressed Fabric ID assigned from DUT to TH2 and save the value for future use. " +
                "Verify that the value obtained from TH1 and TH2 are same",
        },
    )
    .step(3, "Send RemoveFabric from DUT to TH1 and commission DUT to TH1 again", cx => recommission(cx, "th1"), {
        expected:
            "Extract the Compressed Fabric ID assigned from DUT to TH1 and verify it is same as the value " +
            "obtained in Step1",
    })
    .step(4, "Send RemoveFabric from DUT to TH2 and commission DUT to TH2 again", cx => recommission(cx, "th2"), {
        expected:
            "Extract the Compressed Fabric ID assigned from DUT to TH2 and verify it is same as the value " +
            "obtained in Step2",
    })
    .finalize(cx =>
        runCleanups(
            () => commissioned.th1.decommissionAll(cx),
            () => commissioned.th2.decommissionAll(cx),
        ),
    );
