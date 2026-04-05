/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";
import type { GroupId } from "../datatype/GroupId.js";
import type { Status } from "../globals/Status.js";

/**
 * Definitions for the Groups cluster.
 *
 * The Groups cluster manages, per endpoint, the content of the node-wide Group Table that is part of the underlying
 * interaction layer.
 *
 * In a network supporting fabrics, group IDs referenced by attributes or other elements of this cluster are scoped to
 * the accessing fabric.
 *
 * The Groups cluster is scoped to the endpoint. Groups cluster commands support discovering the endpoint membership in
 * a group, adding the endpoint to a group, removing the endpoint from a group, removing endpoint membership from all
 * groups. All commands defined in this cluster shall only affect groups scoped to the accessing fabric.
 *
 * When group names are supported, the server stores a name string, which is set by the client for each assigned group
 * and indicated in response to a client request.
 *
 * Note that configuration of group addresses for outgoing commands is achieved using the Message Layer mechanisms where
 * the Group Table is not involved. Hence this cluster does not play a part in that.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.3
 */
export declare namespace Groups {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0004;

    /**
     * Textual cluster identifier.
     */
    export const name: "Groups";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the Groups cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Groups} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute provides legacy, read-only access to whether the Group Names feature is supported. The most
         * significant bit, bit 7 (GroupNames), shall be equal to bit 0 of the FeatureMap attribute (GN Feature). All
         * other bits shall be 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.6.1
         */
        nameSupport: NameSupportAttribute;
    }

    /**
     * Attributes that may appear in {@link Groups}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute provides legacy, read-only access to whether the Group Names feature is supported. The most
         * significant bit, bit 7 (GroupNames), shall be equal to bit 0 of the FeatureMap attribute (GN Feature). All
         * other bits shall be 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.6.1
         */
        nameSupport: NameSupportAttribute;
    }

    /**
     * {@link Groups} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * The AddGroup command allows a client to add group membership in a particular group for the server endpoint.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1
         */
        addGroup(request: AddGroupRequest): MaybePromise<AddGroupResponse>;

        /**
         * The ViewGroup command allows a client to request that the server responds with a ViewGroupResponse command
         * containing the name string for a particular group.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.2
         */
        viewGroup(request: ViewGroupRequest): MaybePromise<ViewGroupResponse>;

        /**
         * The GetGroupMembership command allows a client to inquire about the group membership of the server endpoint,
         * in a number of ways.
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

    /**
     * Commands that may appear in {@link Groups}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands }];
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
    export declare class NameSupportAttribute {
        constructor(values?: Partial<NameSupportAttribute> | number);
        groupNames?: boolean;
    };

    /**
     * The AddGroup command allows a client to add group membership in a particular group for the server endpoint.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1
     */
    export declare class AddGroupRequest {
        constructor(values?: Partial<AddGroupRequest>);

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
    };

    /**
     * The AddGroupResponse is sent by the Groups cluster server in response to an AddGroup command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.7
     */
    export declare class AddGroupResponse {
        constructor(values?: Partial<AddGroupResponse>);

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
    };

    /**
     * The ViewGroup command allows a client to request that the server responds with a ViewGroupResponse command
     * containing the name string for a particular group.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.2
     */
    export declare class ViewGroupRequest {
        constructor(values?: Partial<ViewGroupRequest>);
        groupId: GroupId;
    };

    /**
     * The ViewGroupResponse command is sent by the Groups cluster server in response to a ViewGroup command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.8
     */
    export declare class ViewGroupResponse {
        constructor(values?: Partial<ViewGroupResponse>);

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
    };

    /**
     * The GetGroupMembership command allows a client to inquire about the group membership of the server endpoint, in a
     * number of ways.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.3
     */
    export declare class GetGroupMembershipRequest {
        constructor(values?: Partial<GetGroupMembershipRequest>);
        groupList: GroupId[];
    };

    /**
     * The GetGroupMembershipResponse command is sent by the Groups cluster server in response to a GetGroupMembership
     * command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.9
     */
    export declare class GetGroupMembershipResponse {
        constructor(values?: Partial<GetGroupMembershipResponse>);

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
    };

    /**
     * The RemoveGroup command allows a client to request that the server removes the membership for the server
     * endpoint, if any, in a particular group.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.4
     */
    export declare class RemoveGroupRequest {
        constructor(values?: Partial<RemoveGroupRequest>);
        groupId: GroupId;
    };

    /**
     * The RemoveGroupResponse command is generated by the server in response to the receipt of a RemoveGroup command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.10
     */
    export declare class RemoveGroupResponse {
        constructor(values?: Partial<RemoveGroupResponse>);

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
    };

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
    export declare class AddGroupIfIdentifyingRequest {
        constructor(values?: Partial<AddGroupIfIdentifyingRequest>);

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
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.3.5.1
     */
    export declare class NameSupport {
        constructor(values?: Partial<NameSupport> | number);

        /**
         * The ability to store a name for a group.
         */
        groupNames?: boolean;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link Groups}.
     */
    export const Cluster: typeof Groups;

    /**
     * @deprecated Use {@link Groups}.
     */
    export const Complete: typeof Groups;

    export const Typing: Groups;
}

/**
 * @deprecated Use {@link Groups}.
 */
export declare const GroupsCluster: typeof Groups;

export interface Groups extends ClusterTyping {
    Attributes: Groups.Attributes;
    Commands: Groups.Commands;
    Features: Groups.Features;
    Components: Groups.Components;
}
