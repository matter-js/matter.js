/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { IdentifyBehavior } from "#behaviors/identify";
import { ScenesManagementServer } from "#behaviors/scenes-management";
import { Endpoint } from "#endpoint/Endpoint.js";
import { RootEndpoint } from "#endpoints/root";
import { InternalError, Logger } from "@matter/general";
import { assertRemoteActor, Fabric } from "@matter/protocol";
import { StatusCode, StatusResponseError } from "@matter/types";
import { Groups } from "@matter/types/clusters/groups";
import { GroupsBehavior } from "./GroupsBehavior.js";

const logger = Logger.get("GroupsServer");

/**
 * Extend the Groups model to relax constraints on command request fields.  This prevents the interaction layer from
 * rejecting with ConstraintError so the behavior can validate and return proper Status responses.
 */
const { commands } = Groups.schema;
const addGroup = commands.require("AddGroup");
const addGroupIfIdentifying = commands.require("AddGroupIfIdentifying");

const GroupsSchema = Groups.schema.extend(
    undefined,
    addGroup.extend(undefined, addGroup.fields.extend("GroupName", { constraint: "none" })),
    addGroupIfIdentifying.extend(undefined, addGroupIfIdentifying.fields.extend("GroupName", { constraint: "none" })),
);

// We enable group names by default
const GroupsBase = GroupsBehavior.for(Groups, GroupsSchema).with(Groups.Feature.GroupNames);

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

    /* Provisional in Matter 1.6.0: Groups cluster rev 5 adoption checks deferred.
     * When active, management commands return INVALID_IN_STATE for Groupcast-adopted fabrics.
     *
    #isGroupcastAdopted(fabricIndex: FabricIndex): boolean {
        const groupcastAdoption = this.#rootEndpoint.stateOf(GroupKeyManagementServer).groupcastAdoption;
        if (!groupcastAdoption) {
            return false;
        }
        return groupcastAdoption.some(e => e.fabricIndex === fabricIndex && e.groupcastAdopted);
    }
    */

    override async addGroup({ groupId, groupName }: Groups.AddGroupRequest): Promise<Groups.AddGroupResponse> {
        assertRemoteActor(this.context);
        const fabric = this.context.session.associatedFabric;

        if (groupId < 1) {
            return { status: StatusCode.ConstraintError, groupId };
        }
        if (groupName.length > 16) {
            return { status: StatusCode.ConstraintError, groupId };
        }

        /* Provisional in Matter 1.6.0:
        if (this.#isGroupcastAdopted(fabric.fabricIndex)) {
            return { status: StatusCode.InvalidInState, groupId };
        }
        */

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

        /* Provisional in Matter 1.6.0:
        if (this.#isGroupcastAdopted(fabric.fabricIndex)) {
            return { status: StatusCode.InvalidInState, groupId, groupName: "" };
        }
        */

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

        /* Provisional in Matter 1.6.0:
        if (this.#isGroupcastAdopted(fabric.fabricIndex)) {
            throw new StatusResponseError("Groupcast adopted, use Groupcast cluster", StatusCode.InvalidInState);
        }
        */

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
        assertRemoteActor(this.context);
        /* Provisional in Matter 1.6.0:
        if (this.#isGroupcastAdopted(this.context.session.associatedFabric.fabricIndex)) {
            throw new StatusResponseError("Groupcast adopted, use Groupcast cluster", StatusCode.InvalidInState);
        }
        */
        if (this.endpoint.stateOf(IdentifyBehavior).identifyTime > 0) {
            // We identify ourselves currently
            const { status } = await this.addGroup({ groupId, groupName });
            if (status !== StatusCode.Success) {
                throw new StatusResponseError(`Failed to add group ${groupId}`, status);
            }
        }
    }
}
