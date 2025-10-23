/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { FixedAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvUInt8, TlvBitmap, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvGroupId } from "../datatype/GroupId.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Status } from "../globals/Status.js";
import { AccessLevel } from "#model";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Groups {
    /**
     * These are optional features supported by GroupsCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.4
     */
    export enum Feature {
        /**
         * GroupNames (GN)
         *
         * The Group Names feature indicates the ability to store a name for a group when a group is added.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.4.1
         */
        GroupNames = "GroupNames"
    }

    /**
     * The value of the Groups nameSupport attribute
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.6.1
     */
    export const NameSupportAttribute = { groupNames: BitFlag(7) };

    /**
     * Input to the Groups addGroup command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.1
     */
    export const TlvAddGroupRequest = TlvObject({
        /**
         * This field shall be used to identify the group and any associated key material to which the server endpoint
         * is to be added.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.1.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field may be set to a human-readable name for the group. If the client has no name for the group, the
         * GroupName field shall be set to the empty string.
         *
         * Support of group names is optional and is indicated by the FeatureMap and NameSupport attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.1.2
         */
        groupName: TlvField(1, TlvString.bound({ maxLength: 16 }))
    });

    /**
     * Input to the Groups addGroup command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.1
     */
    export interface AddGroupRequest extends TypeFromSchema<typeof TlvAddGroupRequest> {}

    /**
     * The AddGroupResponse is sent by the Groups cluster server in response to an AddGroup command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.7
     */
    export const TlvAddGroupResponse = TlvObject({
        /**
         * This field is set according to the Effect on Receipt section of the AddGroup command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.7.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field is set to the GroupID field of the received AddGroup command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.7.2
         */
        groupId: TlvField(1, TlvGroupId)
    });

    /**
     * The AddGroupResponse is sent by the Groups cluster server in response to an AddGroup command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.7
     */
    export interface AddGroupResponse extends TypeFromSchema<typeof TlvAddGroupResponse> {}

    /**
     * Input to the Groups viewGroup command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.2
     */
    export const TlvViewGroupRequest = TlvObject({ groupId: TlvField(0, TlvGroupId) });

    /**
     * Input to the Groups viewGroup command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.2
     */
    export interface ViewGroupRequest extends TypeFromSchema<typeof TlvViewGroupRequest> {}

    /**
     * The ViewGroupResponse command is sent by the Groups cluster server in response to a ViewGroup command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.8
     */
    export const TlvViewGroupResponse = TlvObject({
        /**
         * This field is according to the Effect on Receipt section of the ViewGroup command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.8.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field is set to the GroupID field of the received ViewGroup command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.8.2
         */
        groupId: TlvField(1, TlvGroupId),

        /**
         * If the status is SUCCESS, and group names are supported, this field is set to the group name associated with
         * that group in the Group Table; otherwise it is set to the empty string.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.8.3
         */
        groupName: TlvField(2, TlvString.bound({ maxLength: 16 }))
    });

    /**
     * The ViewGroupResponse command is sent by the Groups cluster server in response to a ViewGroup command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.8
     */
    export interface ViewGroupResponse extends TypeFromSchema<typeof TlvViewGroupResponse> {}

    /**
     * Input to the Groups getGroupMembership command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.3
     */
    export const TlvGetGroupMembershipRequest = TlvObject({ groupList: TlvField(0, TlvArray(TlvGroupId)) });

    /**
     * Input to the Groups getGroupMembership command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.3
     */
    export interface GetGroupMembershipRequest extends TypeFromSchema<typeof TlvGetGroupMembershipRequest> {}

    /**
     * The GetGroupMembershipResponse command is sent by the Groups cluster server in response to a GetGroupMembership
     * command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.9
     */
    export const TlvGetGroupMembershipResponse = TlvObject({
        /**
         * This field shall contain the remaining capacity of the Group Table of the node. The following values apply:
         *
         *   • 0 - No further groups may be added.
         *
         *   • 0 < Capacity < 0xFE - Capacity holds the number of groups that may be added.
         *
         *   • 0xFE - At least 1 further group may be added (exact number is unknown).
         *
         *   • null - It is unknown if any further groups may be added.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.9.1
         */
        capacity: TlvField(0, TlvNullable(TlvUInt8)),

        /**
         * The GroupList field shall contain either the group IDs of all the groups in the Group Table for which the
         * server endpoint is a member of the group (in the case where the GroupList field of the received
         * GetGroupMembership command was empty), or the group IDs of all the groups in the Group Table for which the
         * server endpoint is a member of the group and for which the group ID was included in the the GroupList field
         * of the received GetGroupMembership command (in the case where the GroupList field of the received
         * GetGroupMembership command was not empty).
         *
         * Zigbee: If the total number of groups will cause the maximum payload length of a frame to be exceeded, then
         * the GroupList field shall contain only as many groups as will fit.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.9.2
         */
        groupList: TlvField(1, TlvArray(TlvGroupId))
    });

    /**
     * The GetGroupMembershipResponse command is sent by the Groups cluster server in response to a GetGroupMembership
     * command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.9
     */
    export interface GetGroupMembershipResponse extends TypeFromSchema<typeof TlvGetGroupMembershipResponse> {}

    /**
     * Input to the Groups removeGroup command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.4
     */
    export const TlvRemoveGroupRequest = TlvObject({ groupId: TlvField(0, TlvGroupId) });

    /**
     * Input to the Groups removeGroup command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.4
     */
    export interface RemoveGroupRequest extends TypeFromSchema<typeof TlvRemoveGroupRequest> {}

    /**
     * The RemoveGroupResponse command is generated by the server in response to the receipt of a RemoveGroup command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.10
     */
    export const TlvRemoveGroupResponse = TlvObject({
        /**
         * This field is according to the Effect on Receipt section of the RemoveGroup command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.10.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field is set to the GroupID field of the received RemoveGroup command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.10.2
         */
        groupId: TlvField(1, TlvGroupId)
    });

    /**
     * The RemoveGroupResponse command is generated by the server in response to the receipt of a RemoveGroup command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.10
     */
    export interface RemoveGroupResponse extends TypeFromSchema<typeof TlvRemoveGroupResponse> {}

    /**
     * Input to the Groups addGroupIfIdentifying command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.6
     */
    export const TlvAddGroupIfIdentifyingRequest = TlvObject({
        /**
         * This field shall be used to identify the group and any associated key material to which the server endpoint
         * is to be added.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.6.1
         */
        groupId: TlvField(0, TlvGroupId),

        /**
         * This field may be set to a human-readable name for the group. If the client has no name for the group, the
         * GroupName field shall be set to the empty string.
         *
         * Support of group names is optional and is indicated by the FeatureMap and NameSupport attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.6.2
         */
        groupName: TlvField(1, TlvString.bound({ maxLength: 16 }))
    });

    /**
     * Input to the Groups addGroupIfIdentifying command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.6
     */
    export interface AddGroupIfIdentifyingRequest extends TypeFromSchema<typeof TlvAddGroupIfIdentifyingRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.3.5.1
     */
    export const NameSupport = {
        /**
         * The ability to store a name for a group.
         */
        groupNames: BitFlag(7)
    };

    /**
     * These elements and properties are present in all Groups clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x4,
        name: "Groups",
        revision: 4,

        features: {
            /**
             * The Group Names feature indicates the ability to store a name for a group when a group is added.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.4.1
             */
            groupNames: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute provides legacy, read-only access to whether the Group Names feature is supported. The
             * most significant bit, bit 7 (GroupNames), shall be equal to bit 0 of the FeatureMap attribute (GN
             * Feature). All other bits shall be 0.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.6.1
             */
            nameSupport: FixedAttribute(0x0, TlvBitmap(TlvUInt8, NameSupportAttribute))
        },

        commands: {
            /**
             * The AddGroup command allows a client to add group membership in a particular group for the server
             * endpoint.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.1
             */
            addGroup: Command(0x0, TlvAddGroupRequest, 0x0, TlvAddGroupResponse, { invokeAcl: AccessLevel.Manage }),

            /**
             * The ViewGroup command allows a client to request that the server responds with a ViewGroupResponse
             * command containing the name string for a particular group.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.2
             */
            viewGroup: Command(0x1, TlvViewGroupRequest, 0x1, TlvViewGroupResponse),

            /**
             * The GetGroupMembership command allows a client to inquire about the group membership of the server
             * endpoint, in a number of ways.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.3
             */
            getGroupMembership: Command(0x2, TlvGetGroupMembershipRequest, 0x2, TlvGetGroupMembershipResponse),

            /**
             * The RemoveGroup command allows a client to request that the server removes the membership for the server
             * endpoint, if any, in a particular group.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.4
             */
            removeGroup: Command(
                0x3,
                TlvRemoveGroupRequest,
                0x3,
                TlvRemoveGroupResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * The RemoveAllGroups command allows a client to direct the server to remove all group associations for the
             * server endpoint.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.5
             */
            removeAllGroups: Command(0x4, TlvNoArguments, 0x4, TlvNoResponse, { invokeAcl: AccessLevel.Manage }),

            /**
             * The AddGroupIfIdentifying command allows a client to add group membership in a particular group for the
             * server endpoint, on condition that the endpoint is identifying itself. Identifying functionality is
             * controlled using the Identify cluster, (see Identify Cluster).
             *
             * For correct operation of the AddGroupIfIdentifying command, any endpoint that supports the Groups server
             * cluster shall also support the Identify server cluster.
             *
             * This command might be used to assist configuring group membership in the absence of a commissioning tool.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.3.7.6
             */
            addGroupIfIdentifying: Command(
                0x5,
                TlvAddGroupIfIdentifyingRequest,
                0x5,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        },

        /**
         * This metadata controls which GroupsCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions()
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({ ...Base, supportedFeatures: { groupNames: true } });

    /**
     * The Groups cluster manages, per endpoint, the content of the node-wide Group Table that is part of the underlying
     * interaction layer.
     *
     * In a network supporting fabrics, group IDs referenced by attributes or other elements of this cluster are scoped
     * to the accessing fabric.
     *
     * The Groups cluster is scoped to the endpoint. Groups cluster commands support discovering the endpoint membership
     * in a group, adding the endpoint to a group, removing the endpoint from a group, removing endpoint membership from
     * all groups. All commands defined in this cluster shall only affect groups scoped to the accessing fabric.
     *
     * When group names are supported, the server stores a name string, which is set by the client for each assigned
     * group and indicated in response to a client request.
     *
     * Note that configuration of group addresses for outgoing commands is achieved using the Message Layer mechanisms
     * where the Group Table is not involved. Hence this cluster does not play a part in that.
     *
     * GroupsCluster supports optional features that you can enable with the GroupsCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type GroupsCluster = Groups.Cluster;
export const GroupsCluster = Groups.Cluster;
ClusterRegistry.register(Groups.Complete);
