/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Status } from "@matter/main/types";
import type { CertStepContext, CheckRecord } from "@matter/testing";
import { certTest, resolveControllerImplementation } from "@matter/testing";
import {
    aclAdmitsGroupStep,
    addGroupStep,
    GROUP,
    GROUPS,
    GROUPS_ENDPOINT,
    groupKeyMapStep,
    groupMulticastAddress,
    ipv6Bytes,
    PRIVILEGE_MANAGE,
    keyMaterialStep,
    keySetWriteStep,
} from "./tc-group-support.js";
import {
    CertCheckFailedError,
    CommissionedRefs,
    describeValue,
    expectSequence,
    LOG_TIMEOUT,
    recordAll,
} from "./tc-support.js";

const commissioned = new CommissionedRefs();

/** The group the plan's step 5 adds *through* the group the steps before it established. */
const SECOND_GROUP = { id: 2, name: "GroupTwo" };

/**
 * The TH dispatching the AddGroup this groupcast carried, named the way each flavor names it. A group
 * command's own path is endpoint-wildcarded on the wire, so what identifies the dispatch is the
 * endpoint it *reached*: matter.js names the endpoint, cluster, command and fields on one line, and
 * chip prints the resolved path of the command it is about to run.
 */
const DISPATCH_LINES = {
    matterjs: [
        new RegExp(
            `ProtocolService Invoke « \\S+\\.ep${GROUPS_ENDPOINT}\\.groups\\.addGroup •group#[0-9a-f]+⇵[0-9a-f]+✉[0-9a-f]+ ` +
                `groupId: ${SECOND_GROUP.id}(?!\\d) groupName: ${SECOND_GROUP.name}(?=$|\\s\\w+:)`,
        ),
    ],
    // chip says more than matter.js here: it names the group the message carried, read off the packet
    // rather than off the session it used
    chip: {
        ordered: [
            new RegExp(`Received Groupcast Message with GroupId 0x${GROUP.id.toString(16).padStart(4, "0")} `),
            new RegExp(
                `Processing group command for Endpoint=${GROUPS_ENDPOINT} Cluster=0x0000_0004 ` +
                    `Command=0x0000_0000(?![0-9a-f])`,
            ),
        ],
    },
};

/**
 * The plan's step 5: an AddGroup sent as a group command over GroupID 1.
 *
 * A groupcast is unacknowledged and answered by nobody, so nothing comes back to check. Three things
 * stand in for a response, and the first is what makes the last one mean anything:
 *
 * - the TH does *not* hold group 2 beforehand, so its presence afterwards cannot predate the message;
 * - the TH's own log shows it dispatched this AddGroup, with the group and name the message carried —
 *   which is also what tells the step the message has been processed, since an unacknowledged
 *   multicast orders nothing against the unicast read that follows;
 * - and the TH then answers `ViewGroup(2)` with the group and the name.
 */
async function addGroupOverGroupcast(cx: CertStepContext) {
    const dut = cx.controllers.dut;
    const th = cx.devices.th;
    const node = dut.node(commissioned.require("dut"));

    // The window opens before the step acts at all: a device's own log reaches the follower on its own
    // schedule, and the lines this step looks for name the group and command it sends, so nothing else
    // in the step's span can satisfy them
    const thFrom = th.log.mark();

    const before = await node.invoke(GROUPS.name, "viewGroup", { groupId: SECOND_GROUP.id }, GROUPS_ENDPOINT);
    const absent = Number(statusOf(before)) === Status.NotFound;

    const from = await dut.log.markSettled();

    await dut
        .group(GROUP.id)
        .invoke(GROUPS.name, "addGroup", { groupId: SECOND_GROUP.id, groupName: SECOND_GROUP.name });

    const sent = await groupcastSentCheck(cx, from);
    const dispatched = await expectSequence(
        th.log,
        th.flavor,
        `the TH dispatching AddGroup(${SECOND_GROUP.id}, "${SECOND_GROUP.name}")`,
        DISPATCH_LINES,
        thFrom,
        LOG_TIMEOUT,
    );

    const response = await node.invoke(GROUPS.name, "viewGroup", { groupId: SECOND_GROUP.id }, GROUPS_ENDPOINT);
    const { status, groupId, groupName } =
        typeof response === "object" && response !== null
            ? (response as { status?: unknown; groupId?: unknown; groupName?: unknown })
            : {};
    const arrived =
        Number(status) === Status.Success && Number(groupId) === SECOND_GROUP.id && groupName === SECOND_GROUP.name;

    await recordAll(cx, [
        {
            check: () => ({
                type: "response",
                verdict: absent ? "pass" : "fail",
                detail: `before the groupcast the TH answers ViewGroup(${SECOND_GROUP.id}) with ${describeValue(before)}`,
            }),
            what: "the group the groupcast will add is not on the TH already",
        },
        { check: () => sent, what: "the DUT sent the command to the group's own multicast address" },
        { check: () => dispatched, what: "the TH dispatched the AddGroup the groupcast carried" },
        {
            check: () => ({
                type: "response",
                verdict: arrived ? "pass" : "fail",
                detail: `after the groupcast the TH answers ViewGroup(${SECOND_GROUP.id}) with ${describeValue(response)}`,
            }),
            what: "the group the groupcast asked the TH to add is on the TH, under the name it carried",
        },
    ]);

    if (!absent || !arrived) {
        throw new CertCheckFailedError(
            `group ${SECOND_GROUP.id} was ${absent ? "not added by" : "already on the TH before"} the groupcast`,
        );
    }
}

/** The status a `ViewGroupResponse` carries, or undefined for an answer that is not one. */
function statusOf(response: unknown): unknown {
    return typeof response === "object" && response !== null ? (response as { status?: unknown }).status : undefined;
}

/**
 * The sender's line for installing its own operational certificate, which names the fabric the group address is
 * derived from.
 */
const FABRIC_LINE = /Installing operational certificate nodeId: \S+ fabricId: (\d+)/;

/** The port group traffic goes to, which the plan's step 5 asks to see (Matter Core § 4.15.3). */
const MATTER_PORT = 5540;

/**
 * matter.js's line for a group invoke: the session tag says the session is a group one, and `dest:` names where
 * the message went, address and port together in the usual IPv6 form.
 */
const GROUP_INVOKE_LINE = new RegExp(
    `ClientInteraction Invoke » •group#[0-9a-f]+⇵[0-9a-f]+ dest: \\[([0-9a-f:]+)\\]:${MATTER_PORT} `,
);

/**
 * Confirms the message went where a group message must go: to the multicast address this fabric uses for this
 * group, on a session the sender itself renders as a group one.
 *
 * The address is not shape-matched. It is recomputed from the sender's fabric id and the group id and compared byte
 * for byte with the destination the invoke names — which is what the plan's "FF35:0040:FD<Fabric ID>00:<Group ID>"
 * asks for, and what also establishes the destination is GroupID 1 rather than some other group.
 */
async function groupcastSentCheck(cx: CertStepContext, from: number): Promise<CheckRecord> {
    const dut = cx.controllers.dut;

    if (resolveControllerImplementation() !== "matterjs") {
        // chip-tool names the group it sends to and nothing else — no destination address, no port —
        // so what it can show is the group, and the step's other check is what shows the message
        // arrived
        const sent = await expectSequence(
            dut.log,
            "chip",
            `a group send to group ${GROUP.id}`,
            { chip: [new RegExp(`Sending command to group 0x${GROUP.id.toString(16)}(?![0-9a-f])`)] },
            from,
            LOG_TIMEOUT,
        );
        return sent.verdict === "pass"
            ? {
                  ...sent,
                  verdict: "unverified",
                  accepted:
                      "chip-tool logs the group it sent to but not the destination address or port, so the " +
                      "address format and the port cannot be read from this controller's own output",
              }
            : sent;
    }

    const fabricLine = await expectSequence(
        dut.log,
        "matterjs",
        "the DUT's operational certificate install",
        { matterjs: [FABRIC_LINE] },
        0,
        LOG_TIMEOUT,
    );
    if (fabricLine.verdict !== "pass" || fabricLine.matched === undefined) {
        return fabricLine;
    }
    const [, fabric] = FABRIC_LINE.exec(fabricLine.matched) ?? [];
    if (fabric === undefined) {
        return { type: "device-log", verdict: "fail", detail: `unreadable certificate line: ${fabricLine.matched}` };
    }

    const invoke = await expectSequence(
        dut.log,
        "matterjs",
        `a group invoke on port ${MATTER_PORT}`,
        { matterjs: [GROUP_INVOKE_LINE] },
        from,
        LOG_TIMEOUT,
    );
    if (invoke.verdict !== "pass" || invoke.matched === undefined) {
        return invoke;
    }
    const [, address] = GROUP_INVOKE_LINE.exec(invoke.matched) ?? [];

    const expected = groupMulticastAddress(BigInt(fabric), GROUP.id);
    const actual = address === undefined ? undefined : ipv6Bytes(address);
    if (actual === undefined || Bytes.toHex(actual) !== Bytes.toHex(expected)) {
        return {
            type: "device-log",
            verdict: "fail",
            detail:
                `the DUT sent group ${GROUP.id} on fabric ${fabric} to ${address}, and § 4.15.3 makes it ` +
                `${Bytes.toHex(expected)}`,
            matched: invoke.matched,
            logLine: invoke.logLine,
        };
    }

    return invoke;
}

certTest("TC-SC-5.3", {
    plan: "group_communication.adoc",
    pics: ["MCORE.ROLE.COMMISSIONER", "GRPKEY.C"],
    app: "all-clusters",

    // Binds a group key through GroupKeyMap, which an all-clusters build with Groupcast on refuses once Groups
    // reaches cluster revision 5.  Only this project's own build offers the variant with Groupcast off; the released
    // binaries predate the change and run the ordinary app.  A chip-docker image runs its own binary and can offer
    // neither, so it is left out
    appVariant: { matterjs: "nogroupcast" },
    flavors: ["chip-local", "matterjs"],
})
    .step(
        "1a",
        "TH should have the ACL entry with the AuthMode as Group by DUT",
        aclAdmitsGroupStep(commissioned, PRIVILEGE_MANAGE),
        {
            expected:
                "The TH's ACL carries an entry whose AuthMode is Group and whose subjects name the group, alongside " +
                "the administer entry the DUT itself uses.",
        },
    )
    .step("1b", "DUT generates a random key and EpochKey0 assigned to GroupKeySetID 1", keyMaterialStep(), {
        expected:
            "The DUT holds a key set the next step can write. This step produces the artifact in-process, so it is " +
            "not evidence about the TH.",
    })
    .step(
        2,
        "DUT sends KeySetWrite command to GroupKeyManagement cluster to TH on EP0",
        keySetWriteStep(commissioned, true),
        {
            pics: "GRPKEY.C.C00.Tx",
            expected: "Test Harness receives the KeySetWrite command from the DUT.",
        },
    )
    .step(
        3,
        "DUT binds GroupId with GroupKeySetID in the GroupKeyMap attribute list on GroupKeyManagement cluster",
        // Both groups: the group the message travels on, and the one its AddGroup names, which the TH
        // would otherwise refuse for want of a key set
        groupKeyMapStep(commissioned, [GROUP.id, SECOND_GROUP.id]),
        {
            pics: "GRPKEY.C.A0000",
            expected: "Test Harness receives the binding of GroupKeySetID with the GroupID from DUT.",
        },
    )
    .step(
        4,
        // The plan writes EP0 here, but Groups is not a root-node cluster: on both THs it lives on the
        // on/off light, so that is the endpoint the step exercises and the endpoint the report names
        'DUT sends AddGroup Command to TH on EP1 with GroupID 1 and GroupName "GroupOne"',
        addGroupStep(commissioned),
        {
            pics: "G.C.C00.Tx",
            expected: "Test Harness receives the AddGroup command from the DUT.",
        },
    )
    .step(
        5,
        "DUT sends a AddGroup Command to the Groups cluster with the GroupID field set to 2 and the GroupName set " +
            'to "GroupTwo". The command is sent as a group command using GroupID 1',
        addGroupOverGroupcast,
        {
            pics: "G.C.C00.Tx",
            expected:
                "The group message goes to the multicast address for this fabric and group on port 5540, sent on a " +
                "group session — which is what DSIZ names on the wire — and the TH holds the group it carried.",
        },
    )
    .step(6, "DUT sends the Groupcast JoinGroup command on the TH on EP0", async () => {}, {
        notApplicable:
            "The plan skips this where the TH's root endpoint has no Groupcast cluster, and neither TH has one.",
    })
    .step(7, "DUT sends a command to the TH as a group command over the Groupcast address", async () => {}, {
        notApplicable: "Sends through the membership step 6 would have established, which neither TH has.",
    })
    .finalize(cx => commissioned.decommissionAll(cx));
