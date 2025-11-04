/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Groups } from "#clusters/groups";

export namespace GroupsInterface {
    export interface Base {
        /**
         * The AddGroup command allows a client to add group membership in a particular group for the server endpoint.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.1
         */
        addGroup(request: Groups.AddGroupRequest): MaybePromise<Groups.AddGroupResponse>;

        /**
         * The ViewGroup command allows a client to request that the server responds with a ViewGroupResponse command
         * containing the name string for a particular group.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.2
         */
        viewGroup(request: Groups.ViewGroupRequest): MaybePromise<Groups.ViewGroupResponse>;

        /**
         * The GetGroupMembership command allows a client to inquire about the group membership of the server endpoint,
         * in a number of ways.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.3
         */
        getGroupMembership(request: Groups.GetGroupMembershipRequest): MaybePromise<Groups.GetGroupMembershipResponse>;

        /**
         * The RemoveGroup command allows a client to request that the server removes the membership for the server
         * endpoint, if any, in a particular group.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.3.7.4
         */
        removeGroup(request: Groups.RemoveGroupRequest): MaybePromise<Groups.RemoveGroupResponse>;

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
        addGroupIfIdentifying(request: Groups.AddGroupIfIdentifyingRequest): MaybePromise;
    }
}

export type GroupsInterface = { components: [{ flags: {}, methods: GroupsInterface.Base }] };
