/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { GroupId } from "../datatype/GroupId.js";
import { Status } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { Groups as GroupsModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the Groups cluster.
 */
export namespace Groups {
    /**
     * {@link Groups} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute provides legacy, read-only access to whether the Group Names feature is supported. The
             * most significant bit, bit 7 (GroupNames), shall be equal to bit 0 of the FeatureMap attribute (GN
             * Feature). All other bits shall be 0.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.6.1
             */
            readonly nameSupport: NameSupportAttribute;
        }

        export interface Commands {
            /**
             * The AddGroup command allows a client to add group membership in a particular group for the server
             * endpoint.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1
             */
            addGroup(request: AddGroupRequest): MaybePromise<AddGroupResponse>;

            /**
             * The ViewGroup command allows a client to request that the server responds with a ViewGroupResponse
             * command containing the name string for a particular group.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.2
             */
            viewGroup(request: ViewGroupRequest): MaybePromise<ViewGroupResponse>;

            /**
             * The GetGroupMembership command allows a client to inquire about the group membership of the server
             * endpoint, in a number of ways.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.3
             */
            getGroupMembership(request: GetGroupMembershipRequest): MaybePromise<GetGroupMembershipResponse>;

            /**
             * The RemoveGroup command allows a client to request that the server removes the membership for the server
             * endpoint, if any, in a particular group.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.4
             */
            removeGroup(request: RemoveGroupRequest): MaybePromise<RemoveGroupResponse>;

            /**
             * The RemoveAllGroups command allows a client to direct the server to remove all group associations for the
             * server endpoint.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.5
             */
            removeAllGroups(): MaybePromise;

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
             * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.6
             */
            addGroupIfIdentifying(request: AddGroupIfIdentifyingRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link Groups}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute provides legacy, read-only access to whether the Group Names feature is supported. The most
         * significant bit, bit 7 (GroupNames), shall be equal to bit 0 of the FeatureMap attribute (GN Feature). All
         * other bits shall be 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.6.1
         */
        readonly nameSupport: NameSupportAttribute;
    }

    export interface Commands extends Base.Commands {}
    export type Components = [{ flags: {}, attributes: Base.Attributes, commands: Base.Commands }];
    export type Features = "GroupNames";

    /**
     * These are optional features supported by GroupsCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.4
     */
    export enum Feature {
        /**
         * GroupNames (GN)
         *
         * The Group Names feature indicates the ability to store a name for a group when a group is added.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.4.1
         */
        GroupNames = "GroupNames"
    }

    /**
     * This attribute provides legacy, read-only access to whether the Group Names feature is supported. The most
     * significant bit, bit 7 (GroupNames), shall be equal to bit 0 of the FeatureMap attribute (GN Feature). All other
     * bits shall be 0.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.6.1
     */
    export interface NameSupportAttribute {
        groupNames?: boolean;
    }

    /**
     * The AddGroup command allows a client to add group membership in a particular group for the server endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1
     */
    export interface AddGroupRequest {
        /**
         * This field shall be used to identify the group and any associated key material to which the server endpoint
         * is to be added.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1.1
         */
        groupId: GroupId;

        /**
         * This field may be set to a human-readable name for the group. If the client has no name for the group, the
         * GroupName field shall be set to the empty string.
         *
         * Support of group names is optional and is indicated by the FeatureMap and NameSupport attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1.2
         */
        groupName: string;
    }

    /**
     * The AddGroupResponse is sent by the Groups cluster server in response to an AddGroup command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.7
     */
    export interface AddGroupResponse {
        /**
         * This field is set according to the Effect on Receipt section of the AddGroup command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.7.1
         */
        status: Status;

        /**
         * This field is set to the GroupID field of the received AddGroup command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.7.2
         */
        groupId: GroupId;
    }

    /**
     * The ViewGroup command allows a client to request that the server responds with a ViewGroupResponse command
     * containing the name string for a particular group.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.2
     */
    export interface ViewGroupRequest {
        groupId: GroupId;
    }

    /**
     * The ViewGroupResponse command is sent by the Groups cluster server in response to a ViewGroup command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.8
     */
    export interface ViewGroupResponse {
        /**
         * This field is according to the Effect on Receipt section of the ViewGroup command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.8.1
         */
        status: Status;

        /**
         * This field is set to the GroupID field of the received ViewGroup command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.8.2
         */
        groupId: GroupId;

        /**
         * If the status is SUCCESS, and group names are supported, this field is set to the group name associated with
         * that group in the Group Table; otherwise it is set to the empty string.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.8.3
         */
        groupName: string;
    }

    /**
     * The GetGroupMembership command allows a client to inquire about the group membership of the server endpoint, in a
     * number of ways.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.3
     */
    export interface GetGroupMembershipRequest {
        groupList: GroupId[];
    }

    /**
     * The GetGroupMembershipResponse command is sent by the Groups cluster server in response to a GetGroupMembership
     * command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.9
     */
    export interface GetGroupMembershipResponse {
        /**
         * This field shall contain the remaining capacity of the Group Table of the node. The following values apply:
         *
         *   - 0 - No further groups may be added.
         *
         *   - 0 < Capacity < 0xFE - Capacity holds the number of groups that may be added.
         *
         *   - 0xFE - At least 1 further group may be added (exact number is unknown).
         *
         *   - null - It is unknown if any further groups may be added.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.9.1
         */
        capacity: number | null;

        /**
         * The GroupList field shall contain either the group IDs of all the groups in the Group Table for which the
         * server endpoint is a member of the group (in the case where the GroupList field of the received
         * GetGroupMembership command was empty), or the group IDs of all the groups in the Group Table for which the
         * server endpoint is a member of the group and for which the group ID was included in the the GroupList field
         * of the received GetGroupMembership command (in the case where the GroupList field of the received
         * GetGroupMembership command was not empty). Zigbee: If the total number of groups will cause the maximum
         * payload length of a frame to be exceeded, then the GroupList field shall contain only as many groups as will
         * fit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.9.2
         */
        groupList: GroupId[];
    }

    /**
     * The RemoveGroup command allows a client to request that the server removes the membership for the server
     * endpoint, if any, in a particular group.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.4
     */
    export interface RemoveGroupRequest {
        groupId: GroupId;
    }

    /**
     * The RemoveGroupResponse command is generated by the server in response to the receipt of a RemoveGroup command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.10
     */
    export interface RemoveGroupResponse {
        /**
         * This field is according to the Effect on Receipt section of the RemoveGroup command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.10.1
         */
        status: Status;

        /**
         * This field is set to the GroupID field of the received RemoveGroup command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.10.2
         */
        groupId: GroupId;
    }

    /**
     * The AddGroupIfIdentifying command allows a client to add group membership in a particular group for the server
     * endpoint, on condition that the endpoint is identifying itself. Identifying functionality is controlled using the
     * Identify cluster, (see Identify Cluster).
     *
     * For correct operation of the AddGroupIfIdentifying command, any endpoint that supports the Groups server cluster
     * shall also support the Identify server cluster.
     *
     * This command might be used to assist configuring group membership in the absence of a commissioning tool.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.6
     */
    export interface AddGroupIfIdentifyingRequest {
        /**
         * This field shall be used to identify the group and any associated key material to which the server endpoint
         * is to be added.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.6.1
         */
        groupId: GroupId;

        /**
         * This field may be set to a human-readable name for the group. If the client has no name for the group, the
         * GroupName field shall be set to the empty string.
         *
         * Support of group names is optional and is indicated by the FeatureMap and NameSupport attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.6.2
         */
        groupName: string;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.5.1
     */
    export interface NameSupport {
        /**
         * The ability to store a name for a group.
         */
        groupNames?: boolean;
    }

    export const id = ClusterId(0x4);
    export const name = "Groups" as const;
    export const revision = 4;
    export const schema = GroupsModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof Groups;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `Groups` instead of `Groups.Complete`)
     */
    export type Complete = typeof Groups;

    export declare const Complete: Complete;
    export declare const Typing: Groups;
}

ClusterNamespace.define(Groups);
export type GroupsCluster = Groups.Cluster;
export const GroupsCluster = Groups.Cluster;
export interface Groups extends ClusterTyping { Attributes: Groups.Attributes; Commands: Groups.Commands; Features: Groups.Features; Components: Groups.Components }
