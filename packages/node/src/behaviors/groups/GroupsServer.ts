/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { IdentifyBehavior } from "#behaviors/identify";
import { ScenesManagementServer } from "#behaviors/scenes-management";
import { Groups } from "#clusters/groups";
import { Endpoint } from "#endpoint/Endpoint.js";
import { RootEndpoint } from "#endpoints/root";
import { InternalError, Logger } from "#general";
import { AccessLevel } from "#model";
import { assertRemoteActor, Fabric } from "#protocol";
import {
    Command,
    StatusCode,
    StatusResponseError,
    TlvField,
    TlvGroupId,
    TlvNoResponse,
    TlvObject,
    TlvString,
} from "#types";
import { GroupsBehavior } from "./GroupsBehavior.js";

const logger = Logger.get("GroupsServer");

/**
 * Monkey patching Tlv Structure of addGroup* commands to prevent data validation of the groupName field to be
 * handled as ConstraintError because we need to return a special error.
 * We do this to leave the model in fact for other validations and only apply the change for our Schema-aware Tlv parsing.
 */
Groups.Cluster.commands = {
    ...Groups.Cluster.commands,
    addGroup: Command(
        0x0,
        TlvObject({
            groupId: TlvField(0, TlvGroupId),
            groupName: TlvField(1, TlvString),
        }),
        0x0,
        Groups.TlvAddGroupResponse,
        { invokeAcl: AccessLevel.Manage },
    ),
    addGroupIfIdentifying: Command(
        0x5,
        TlvObject({
            groupId: TlvField(0, TlvGroupId),
            groupName: TlvField(1, TlvString),
        }),
        0x5,
        TlvNoResponse,
        { invokeAcl: AccessLevel.Manage },
    ),
};

// We enable group names by default
const GroupsBase = GroupsBehavior.with(Groups.Feature.GroupNames);

/**
 * This is the default server implementation of {@link GroupsBehavior}.
 */
export class GroupsServer extends GroupsBase {
    override initialize() {
        this.state.nameSupport.groupNames = this.features.groupNames;
    }

    // We need to search the root here ourselves because we cannot include ServerNode because else we generate a
    // circular dependency
    get #rootEndpoint(): Endpoint<RootEndpoint> {
        const rootEndpoint = this.endpoint.ownerOfType(RootEndpoint);
        if (rootEndpoint === undefined) {
            throw new InternalError("RootEndpoint not found");
        }
        return rootEndpoint;
    }

    async #actOnGroupKeyManagement<T>(
        act: (fabric: Fabric, groupKeyManagement: GroupKeyManagementServer) => T,
    ): Promise<T> {
        assertRemoteActor(this.context);
        const agent = this.#rootEndpoint.agentFor(this.context);
        const gkm = agent.get(GroupKeyManagementServer);
        await agent.context.transaction.addResources(gkm);
        await agent.context.transaction.begin();
        return act(this.context.session.associatedFabric, gkm);
    }

    override async addGroup({ groupId, groupName }: Groups.AddGroupRequest): Promise<Groups.AddGroupResponse> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;

        if (groupId < 1) {
            return { status: StatusCode.ConstraintError, groupId };
        }
        if (groupName.length > 16) {
            return { status: StatusCode.ConstraintError, groupId };
        }

        if (!fabric.groups.groupKeyIdMap.has(groupId)) {
            return { status: StatusCode.UnsupportedAccess, groupId };
        }

        const endpointNumber = this.endpoint.number;

        try {
            await this.#actOnGroupKeyManagement((fabric, gkm) =>
                gkm.addEndpointForGroup(fabric, groupId, endpointNumber, groupName),
            );
        } catch (error) {
            logger.error(error);
            StatusResponseError.accept(error);
            return { status: error.code, groupId };
        }

        return { status: StatusCode.Success, groupId };
    }

    override viewGroup({ groupId }: Groups.ViewGroupRequest): Groups.ViewGroupResponse {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;

        if (groupId < 1) {
            return { status: StatusCode.ConstraintError, groupId, groupName: "" };
        }

        const fabricIndex = fabric.fabricIndex;
        const endpointNumber = this.endpoint.number;

        const { groupTable } = this.#rootEndpoint.stateOf(GroupKeyManagementServer);
        const groupEntry = groupTable.find(entry => entry.groupId === groupId && entry.fabricIndex === fabricIndex);
        if (groupEntry === undefined || !groupEntry.endpoints.includes(endpointNumber)) {
            return { status: StatusCode.NotFound, groupId, groupName: "" };
        }
        return { status: StatusCode.Success, groupId, groupName: groupEntry.groupName ?? "" };
    }

    override async getGroupMembership({
        groupList,
    }: Groups.GetGroupMembershipRequest): Promise<Groups.GetGroupMembershipResponse> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;
        const fabricIndex = fabric.fabricIndex;
        const endpointNumber = this.endpoint.number;

        const { groupTable } = this.#rootEndpoint.stateOf(GroupKeyManagementServer);
        const endpointGroups = groupTable.filter(
            entry => entry.endpoints.includes(endpointNumber) && entry.fabricIndex === fabricIndex,
        );
        const fabricGroupsList = endpointGroups.map(entry => entry.groupId);

        if (groupList.length === 0) {
            return { capacity: 0xfe - fabricGroupsList.length, groupList: fabricGroupsList };
        }

        const filteredGroupsList = groupList.filter(groupId => fabricGroupsList.includes(groupId));
        return { capacity: 0xfe - fabricGroupsList.length, groupList: filteredGroupsList };
    }

    override async removeGroup({ groupId }: Groups.RemoveGroupRequest): Promise<Groups.RemoveGroupResponse> {
        if (groupId < 1) {
            return { status: StatusCode.ConstraintError, groupId };
        }

        try {
            assertRemoteActor(this.context);
            if (
                await this.#actOnGroupKeyManagement((fabric, gkm) =>
                    gkm.removeEndpoint(fabric, this.endpoint.number, groupId),
                )
            ) {
                if (this.agent.has(ScenesManagementServer)) {
                    this.agent
                        .get(ScenesManagementServer)
                        .removeScenesForGroupOnFabric(this.context.session.associatedFabric.fabricIndex, groupId);
                }
                return { status: StatusCode.Success, groupId };
            }
            return { status: StatusCode.NotFound, groupId };
        } catch (error) {
            StatusResponseError.accept(error);
            return { status: error.code, groupId };
        }
    }

    override async removeAllGroups() {
        try {
            assertRemoteActor(this.context);
            await this.#actOnGroupKeyManagement((fabric, gkm) => gkm.removeEndpoint(fabric, this.endpoint.number));
            if (this.agent.has(ScenesManagementServer)) {
                this.agent
                    .get(ScenesManagementServer)
                    .removeScenesForAllGroupsForFabric(this.context.session.associatedFabric.fabricIndex);
            }
        } catch (error) {
            StatusResponseError.accept(error);
            throw error;
        }
    }

    override async addGroupIfIdentifying({ groupId, groupName }: Groups.AddGroupIfIdentifyingRequest) {
        if (this.endpoint.stateOf(IdentifyBehavior).identifyTime > 0) {
            // We identify ourselves currently
            const { status } = await this.addGroup({ groupId, groupName });
            if (status !== StatusCode.Success) {
                throw new StatusResponseError(`Failed to add group ${groupId}`, status);
            }
        }
    }
}
