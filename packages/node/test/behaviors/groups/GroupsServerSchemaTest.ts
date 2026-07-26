/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupsServer } from "#behaviors/groups";
import { CommandModel } from "@matter/model";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    Status,
    TlvField,
    TlvInvokeResponseData,
    TlvObject,
    TlvString,
    TlvUInt16,
    TypeFromSchema,
} from "@matter/types";
import { Groups } from "@matter/types/clusters/groups";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";

const TlvAddGroupRequest = TlvObject({
    groupId: TlvField(0, TlvUInt16),
    groupName: TlvField(1, TlvString),
});

const TlvAddGroupResponse = TlvObject({
    status: TlvField(0, TlvUInt16),
    groupId: TlvField(1, TlvUInt16),
});

const AN_OVERLONG_NAME = "X".repeat(17); // base GroupName constraint is "max 16"

// Invoke AddGroup on the default device (OnOffLightDevice on endpoint 1 includes GroupsServer).
async function invokeAddGroup(fields: { groupId: number; groupName: string }) {
    const node = await MockServerNode.createOnline();
    try {
        const fabric = await node.addFabric();
        let response: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
        await interaction.invoke(
            node,
            fabric,
            {
                commandPath: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(Groups.id),
                    commandId: CommandId(Groups.schema.commands.require("AddGroup").id!),
                },
                commandFields: TlvAddGroupRequest.encodeTlv(fields),
            },
            r => {
                response = r;
            },
        );
        return response;
    } finally {
        await node.close();
    }
}

describe("GroupsServer schema relaxation", () => {
    it("relaxes AddGroup GroupId/GroupName constraints relative to the base cluster", () => {
        const baseAddGroup = Groups.schema.commands.require("AddGroup");
        expect(baseAddGroup.fields.require("GroupId").constraint.min).equals(1);
        expect(baseAddGroup.fields.require("GroupName").constraint.max).equals(16);

        const serverAddGroup = GroupsServer.schema.get(CommandModel, "AddGroup");
        expect(serverAddGroup).not.undefined;
        expect(serverAddGroup!.fields.require("GroupId").constraint.min).undefined;
        expect(serverAddGroup!.fields.require("GroupName").constraint.max).undefined;
    });

    // A relaxed field lets an out-of-constraint value reach the handler (which returns a ConstraintError command
    // payload) instead of the interaction layer rejecting it with a bare ConstraintError status.

    it("accepts an over-long GroupName and returns a command response from the handler", async () => {
        const response = await invokeAddGroup({ groupId: 1, groupName: AN_OVERLONG_NAME });

        expect(response?.command).not.undefined;
        expect(response?.status).undefined;

        const { status, groupId } = TlvAddGroupResponse.decodeTlv(response!.command!.commandFields!);
        expect(status).equals(Status.ConstraintError);
        expect(groupId).equals(1);
    });

    it("accepts an out-of-range GroupId and returns a command response from the handler", async () => {
        const response = await invokeAddGroup({ groupId: 0, groupName: "grp" });

        expect(response?.command).not.undefined;
        expect(response?.status).undefined;

        const { status, groupId } = TlvAddGroupResponse.decodeTlv(response!.command!.commandFields!);
        expect(status).equals(Status.ConstraintError);
        expect(groupId).equals(0);
    });
});
