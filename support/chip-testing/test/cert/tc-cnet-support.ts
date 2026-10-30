/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertNodeRef, CertStepContext, CheckRecord } from "@matter/testing";
import { certTest } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import type { RecordedCheck } from "./tc-support.js";
import { CommissionedRefs, describeValue, invokeCommand, recordAll, requireId, runCleanups } from "./tc-support.js";

const NETWORK_COMMISSIONING = Matter.clusters.require("NetworkCommissioning");
const GENERAL_COMMISSIONING = Matter.clusters.require("GeneralCommissioning");

/** `PIXIT.CNET.ENDPOINT_WIFI` and `PIXIT.CNET.ENDPOINT_THREAD`: both THs configure their network on the root. */
const ROOT_ENDPOINT = 0;

/** The fail-safe step 2 arms, as CHIP's worked chip-tool command for that step sets it. */
const FAIL_SAFE_SECONDS = 60;

/** The Wi-Fi network TC-CNET-4.20 adds; the SSID is also its NetworkID. */
export const WIFI_SSID = Bytes.fromString("matter-th-ap");
export const WIFI_CREDENTIALS = Bytes.fromString("matter-th-passphrase");

/**
 * The Thread network TC-CNET-4.21 adds: `PIXIT.TBRM.THREAD_ACTIVE_DATASET` from CHIP's TBRM cases. Its Extended PAN
 * ID, `2ad51c02fe8f64f2`, is its NetworkID.
 */
export const THREAD_DATASET = Bytes.fromHex(
    "0e080000000000010000000300001235060004001fffe002082ad51c02fe8f64f20708fddb8af85255f93a051083e2b9b2cc609b" +
        "00125adbf823ea2ab20102c4d904100a133626c411d7de02a570ca3c3d80470c0402a0f7f8031054687265616441637469766554" +
        "657374",
);
export const THREAD_NETWORK_ID = Bytes.fromHex("2ad51c02fe8f64f2");

/** What differs between the Wi-Fi and the Thread case. */
export interface CnetClientCase {
    id: "TC-CNET-4.20" | "TC-CNET-4.21";
    featurePics: "CNET.C.F00" | "CNET.C.F01";
    app: "wifi-network" | "thread-network";

    /** The NetworkID that step 3 adds and steps 4 to 6 name. */
    networkId: Bytes;

    /** Step 3: the command that adds the network, its arguments without the Breadcrumb, and its PICS. */
    add: {
        name: "AddOrUpdateWiFiNetwork" | "AddOrUpdateThreadNetwork";
        command: "addOrUpdateWiFiNetwork" | "addOrUpdateThreadNetwork";
        pics: "CNET.C.C02.Tx" | "CNET.C.C03.Tx";
        args: Record<string, Bytes>;
    };
}

/** The id of `command`'s field whose property name is `name`. */
function fieldId(command: string, name: string) {
    const model = NETWORK_COMMISSIONING.commands.require(command);
    const field = model.children.find(({ propertyName }) => propertyName === name);
    return requireId(field?.id, `NetworkCommissioning.${command}.${name}`);
}

/**
 * Has the DUT invoke `command` on the TH's Network Commissioning cluster and checks that the TH received it with
 * `args`, and that its answer reports Success.
 *
 * Each step sends its own number as Breadcrumb, so the TH's log line of every command differs from the others even
 * where two commands name the same network.
 */
async function sendNetworkCommand(
    cx: CertStepContext,
    ref: CertNodeRef,
    command: string,
    step: number,
    args: Record<string, Bytes | number>,
) {
    const sentArgs = { ...args, breadcrumb: step };
    const sent = await invokeCommand(cx, ref, {
        cluster: NETWORK_COMMISSIONING,
        endpoint: ROOT_ENDPOINT,
        command,
        args: sentArgs,
        fields: Object.entries(sentArgs).map(([name, value]) => ({ id: fieldId(command, name), value })),
    });
    const checks: RecordedCheck[] = [...sent.checks];
    if (sent.response.ok) {
        checks.push(networkingStatusCheck(command, sent.response.value));
    }
    await recordAll(cx, checks);
}

/** The NetworkingStatus a Network Commissioning response carries, or `undefined` where it carries none. */
function networkingStatusOf(response: unknown): number | undefined {
    if (typeof response !== "object" || response === null || !("networkingStatus" in response)) {
        return undefined;
    }
    return typeof response.networkingStatus === "number" ? response.networkingStatus : undefined;
}

function networkingStatusCheck(command: string, response: unknown): RecordedCheck {
    const status = networkingStatusOf(response);
    const check: CheckRecord = {
        type: "response",
        verdict: status === 0 ? "pass" : "fail",
        detail:
            status === undefined
                ? `${command} answered ${describeValue(response)}, which carries no NetworkingStatus`
                : `${command} NetworkingStatus=${status}`,
    };
    return { what: `NetworkCommissioning.${command} NetworkingStatus`, check: () => check };
}

/** The ErrorCode a GeneralCommissioning response carries, or `undefined` where it carries none. */
function errorCodeOf(response: unknown): number | undefined {
    if (typeof response !== "object" || response === null || !("errorCode" in response)) {
        return undefined;
    }
    return typeof response.errorCode === "number" ? response.errorCode : undefined;
}

/**
 * Registers one of the Network Commissioning DUT-client cases. Both send the same commands but for the one that adds
 * the network.
 *
 * chip's apps in the harness image are built without Wi-Fi and Thread, so only matter.js provides the TH. Its server
 * answers like chip's: ScanNetworks needs no fail-safe, although Matter 1.6.1 § 11.9.7.1 requires one and the plan
 * sends ScanNetworks before ArmFailSafe.
 *
 * The plan leaves the fail-safe from step 2 armed. The cleanup sends CommissioningComplete before it decommissions the
 * TH, so the TH keeps no armed fail-safe for a fabric that is gone.
 */
export function cnetClientCase({ id, featurePics, app, networkId, add }: CnetClientCase) {
    const commissioned = new CommissionedRefs();

    return certTest(id, {
        plan: "network_commissioning.adoc",
        pics: [featurePics],
        app,

        // chip's apps in the harness image have no Wi-Fi or Thread Network Commissioning cluster
        flavors: ["matterjs"],
    })
        .step("0", "Preconditions: the DUT commissions the TH.", commissionThStep(commissioned), {
            expected: "The TH is commissioned onto the DUT's fabric, so the steps below run over CASE.",
        })
        .step(
            1,
            "DUT sends the ScanNetwork command to the TH",
            commissioned.withRef("dut", (cx, ref) => sendNetworkCommand(cx, ref, "scanNetworks", 1, {})),
            { pics: "CNET.C.C00.Tx", expected: "TH receives the ScanNetwork command from the DUT" },
        )
        .step(
            2,
            "DUT sends the ArmFailSafe command to the TH",
            commissioned.withRef("dut", async (cx, ref) => {
                const sent = await invokeCommand(cx, ref, {
                    cluster: GENERAL_COMMISSIONING,
                    endpoint: ROOT_ENDPOINT,
                    command: "armFailSafe",
                    args: { expiryLengthSeconds: FAIL_SAFE_SECONDS, breadcrumb: 2 },
                    fields: [
                        { id: 0, value: FAIL_SAFE_SECONDS },
                        { id: 1, value: 2 },
                    ],
                });
                const checks: RecordedCheck[] = [...sent.checks];
                if (sent.response.ok) {
                    const errorCode = errorCodeOf(sent.response.value);
                    const armed: CheckRecord = {
                        type: "response",
                        verdict: errorCode === 0 ? "pass" : "fail",
                        detail:
                            errorCode === undefined
                                ? `armFailSafe answered ${describeValue(sent.response.value)}, which carries no ErrorCode`
                                : `armFailSafe ErrorCode=${errorCode}`,
                    };
                    checks.push({ what: "GeneralCommissioning.armFailSafe ErrorCode", check: () => armed });
                }
                await recordAll(cx, checks);
            }),
            {
                expected: "TH receives the ArmFailSafe command from the DUT and answers with ArmFailSafeResponse",
            },
        )
        .step(
            3,
            `DUT sends the ${add.name} command to the TH`,
            commissioned.withRef("dut", (cx, ref) => sendNetworkCommand(cx, ref, add.command, 3, add.args)),
            { pics: add.pics, expected: `TH receives the ${add.name} command from the DUT` },
        )
        .step(
            4,
            "DUT sends the ConnectNetwork command to the TH",
            commissioned.withRef("dut", (cx, ref) => sendNetworkCommand(cx, ref, "connectNetwork", 4, { networkId })),
            { pics: "CNET.C.C06.Tx", expected: "TH receives the ConnectNetwork command from the DUT" },
        )
        .step(
            5,
            "DUT sends the ReorderNetwork command to the TH",
            commissioned.withRef("dut", (cx, ref) =>
                sendNetworkCommand(cx, ref, "reorderNetwork", 5, { networkId, networkIndex: 0 }),
            ),
            { pics: "CNET.C.C08.Tx", expected: "TH receives the ReorderNetwork command from the DUT" },
        )
        .step(
            6,
            "DUT sends the RemoveNetwork command to the TH",
            commissioned.withRef("dut", (cx, ref) => sendNetworkCommand(cx, ref, "removeNetwork", 6, { networkId })),
            { pics: "CNET.C.C04.Tx", expected: "TH receives the RemoveNetwork command from the DUT" },
        )
        .finalize(cx => {
            const ref = commissioned.get("dut");
            return runCleanups(
                async () => {
                    if (ref !== undefined) {
                        await cx.controllers.dut
                            .node(ref)
                            .invoke("GeneralCommissioning", "commissioningComplete", {}, ROOT_ENDPOINT);
                    }
                },
                () => commissioned.decommissionAll(cx),
            );
        });
}
