/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import { CommissioningMode } from "@matter/main/protocol";
import { VendorId } from "@matter/main/types";
import type { CertStepContext } from "@matter/testing";
import { certTest, resolveControllerImplementation } from "@matter/testing";
import { advertiseCommissionableAlias, cachedTxtValue, type CommissionableAlias } from "../../src/cert/mdns-alias.js";
import { discoverCommissionable } from "../../src/cert/mdns-check.js";
import {
    COMMISSIONED,
    COMMISSIONING_LOG_TIMEOUT,
    CommissioningRefusals,
    MDNS_TIMEOUT,
    qrPayloadFields,
    qrPayloadWith,
    recordDiscriminatorHonored,
    thQrPayload,
} from "./tc-dd-support.js";
import { attempt, CommissionedRefs, expectSequence, record, runCleanups, withChecks } from "./tc-support.js";

/** The plan's own example of an unknown key/value pair. */
const UNKNOWN_KEY = "AB";
const UNKNOWN_VALUE = "12345";

const commissioned = new CommissionedRefs();
const refusals = new CommissioningRefusals();
let alias: { record: CommissionableAlias; discriminator: number } | undefined;

/**
 * The discriminator the alias advertises: no other record carries it, so a DUT that uses the code's
 * discriminator (step 0) can only reach the TH through the record that carries the unknown key. It is not
 * the inverted value step 0 offers, which nothing may answer.
 */
function aliasDiscriminator(cx: CertStepContext) {
    const discriminator = cx.devices.th.commissioning.discriminator ^ 0xaaa;
    const owner = Object.entries(cx.devices).find(([, device]) => device.commissioning.discriminator === discriminator);
    if (owner !== undefined) {
        throw new InternalError(`Alias discriminator ${discriminator} is device ${owner[0]}'s own`);
    }
    return discriminator;
}

function publishedAlias() {
    if (alias === undefined) {
        throw new InternalError("Step ran before the TH's advertisement carried the unknown key");
    }
    return alias;
}

certTest("TC-SC-4.2", {
    plan: "securechannel.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER"],
    app: "all-clusters",
})
    .step(
        "0",
        "Precondition: the DUT is a commissioner that uses the discriminator its onboarding code names.",
        cx => recordDiscriminatorHonored(cx, refusals),
        {
            expected:
                "DUT does not commission the TH from a code naming a discriminator no device advertises. " +
                "Step 2's claim that the DUT used the record carrying the unknown key rests on this.",
        },
    )
    .step(
        1,
        "By any means, TH adds an unknown key/value pair in the advertised data(e.g. AB=12345) and is in " +
            "Commissioning Mode",
        async cx => {
            const th = cx.devices.th;
            // The shared cache can still hold a record an earlier device left for the same discriminator
            const { vendorId, productId } = qrPayloadFields(await thQrPayload(th));
            const own = await discoverCommissionable(
                th.commissioning.discriminator,
                MDNS_TIMEOUT,
                device => device.VP === `${vendorId}+${productId}`,
            );
            const port = own?.addresses.flatMap(address => ("port" in address ? [address.port] : []))[0];
            record(
                cx,
                {
                    type: "network",
                    verdict:
                        own !== undefined && port !== undefined && own.CM !== CommissioningMode.NotCommissioning
                            ? "pass"
                            : "fail",
                    detail:
                        own === undefined
                            ? `no commissionable record for discriminator ${th.commissioning.discriminator}`
                            : `TH advertises discriminator ${own.D} CM=${own.CM} on UDP port ${port}`,
                },
                "TH in commissioning mode",
            );
            if (own === undefined || port === undefined) {
                return;
            }

            const discriminator = aliasDiscriminator(cx);
            alias = {
                discriminator,
                record: await advertiseCommissionableAlias(
                    {
                        kind: "commissionable",
                        mode:
                            own.CM === CommissioningMode.Enhanced
                                ? CommissioningMode.Enhanced
                                : CommissioningMode.Basic,
                        discriminator,
                        name: own.DN ?? "",
                        deviceType: own.DT ?? 0,
                        vendorId: VendorId(vendorId),
                        productId,
                        port,
                        idleInterval: own.SII,
                        activeInterval: own.SAI,
                        activeThreshold: own.SAT,
                    },
                    { [UNKNOWN_KEY]: UNKNOWN_VALUE },
                ),
            };

            const value = await cachedTxtValue(alias.record.qname, UNKNOWN_KEY, MDNS_TIMEOUT);
            record(
                cx,
                {
                    type: "network",
                    verdict: value === UNKNOWN_VALUE ? "pass" : "fail",
                    detail:
                        `${alias.record.qname} (discriminator ${discriminator}, port ${port}) carries ` +
                        `${UNKNOWN_KEY}=${value ?? "<absent>"}`,
                },
                "TH advertises the unknown key",
            );
        },
        { expected: "TH must advertise with new data added" },
    )
    .step(
        2,
        "DUT attempts to commission TH",
        async cx => {
            const th = cx.devices.th;
            const { discriminator } = publishedAlias();
            const code = qrPayloadWith(await thQrPayload(th), { discriminator });

            const dut = cx.controllers.dut;
            const [from, dutFrom] = await Promise.all([th.log.markSettled(), dut.log.markSettled()]);

            await withChecks(cx, async checks => {
                const commissioning = await attempt(
                    () => dut.commission({ qrPairingCode: code }),
                    ref =>
                        `commissioned as node ${ref} from ${code}, which only the record carrying ${UNKNOWN_KEY} matches`,
                );
                if (commissioning.ok) {
                    commissioned.set("dut", commissioning.value);
                }
                checks.push({ what: "DUT commissioned the TH", check: () => commissioning.check });

                const completed = await expectSequence(
                    th.log,
                    th.flavor,
                    "commissioning complete",
                    { chip: [COMMISSIONED.chip], matterjs: [COMMISSIONED.matterjs] },
                    from,
                    COMMISSIONING_LOG_TIMEOUT,
                );
                checks.push({ what: "TH commissioning", check: () => completed });

                // Step 0 shows the DUT uses a code's discriminator; this shows it used the alias's
                const discovered = await expectSequence(
                    dut.log,
                    resolveControllerImplementation() === "chip-tool" ? "chip" : "matterjs",
                    `the DUT discovering by discriminator ${discriminator}`,
                    {
                        chip: [new RegExp(`Discovered device with discriminator ${discriminator} matches`)],
                        matterjs: [
                            new RegExp(`Initiating discovery of node with discriminator ${discriminator}(?!\\d)`),
                        ],
                    },
                    dutFrom,
                    COMMISSIONING_LOG_TIMEOUT,
                );
                checks.push({ what: "DUT used the alias's discriminator", check: () => discovered });
            });
        },
        {
            expected:
                "DUT successfully commissions TH and the unknown key/value pair added at step 1 must be silently " +
                "discarded",
        },
    )
    .finalize(cx => {
        const published = alias;
        alias = undefined;
        // The alias's goodbye expires address records of the host name this process shares, which an
        // in-process TH also announces under, so it goes only after the DUT no longer needs the TH
        return runCleanups(
            () => refusals.settle(cx),
            () => commissioned.decommissionAll(cx),
            async () => {
                await published?.record.close();
            },
        );
    });
