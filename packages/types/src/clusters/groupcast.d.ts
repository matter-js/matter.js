/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { FabricIndex } from "../datatype/FabricIndex.js";
import type { MaybePromise, Bytes } from "@matter/general";
import type { GroupId } from "../datatype/GroupId.js";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";

/**
 * Definitions for the Groupcast cluster.
 */
export declare namespace Groupcast {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0065;

    /**
     * Textual cluster identifier.
     */
    export const name: "Groupcast";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the Groupcast cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Groupcast} always supports these elements.
     */
    export interface BaseAttributes {
        membership: Membership[];
        maxMembershipCount: number;
        maxMcastAddrCount: number;
        usedMcastAddrCount: number;
        fabricUnderTest: FabricIndex;
    }

    /**
     * Attributes that may appear in {@link Groupcast}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        membership: Membership[];
        maxMembershipCount: number;
        maxMcastAddrCount: number;
        usedMcastAddrCount: number;
        fabricUnderTest: FabricIndex;
    }

    /**
     * {@link Groupcast} always supports these elements.
     */
    export interface BaseCommands {
        joinGroup(request: JoinGroupRequest): MaybePromise;
        leaveGroup(request: LeaveGroupRequest): MaybePromise<LeaveGroupResponse>;
        updateGroupKey(request: UpdateGroupKeyRequest): MaybePromise;
        groupcastTesting(request: GroupcastTestingRequest): MaybePromise;
    }

    /**
     * {@link Groupcast} supports these elements if it supports feature "Listener".
     */
    export interface ListenerCommands {
        configureAuxiliaryAcl(request: ConfigureAuxiliaryAclRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link Groupcast}.
     */
    export interface Commands extends
        BaseCommands,
        ListenerCommands
    {}

    /**
     * {@link Groupcast} always supports these elements.
     */
    export interface BaseEvents {
        groupcastTesting: GroupcastTestingEvent;
    }

    /**
     * Events that may appear in {@link Groupcast}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        groupcastTesting: GroupcastTestingEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { listener: true }, commands: ListenerCommands }
    ];
    export type Features = "Listener" | "Sender" | "PerGroup";

    /**
     * These are optional features supported by GroupcastCluster.
     */
    export enum Feature {
        /**
         * Listener (LN)
         *
         * Supports joining a multicast group of nodes as a listener.
         */
        Listener = "Listener",

        /**
         * Sender (SD)
         *
         * Supports sending multicast message to a targeted group of nodes.
         */
        Sender = "Sender",

        /**
         * PerGroup (PGA)
         *
         * Supports PerGroup multicast addresses.
         */
        PerGroup = "PerGroup"
    }

    export declare class Membership {
        constructor(values?: Partial<Membership>);
        groupId: GroupId;
        endpoints?: EndpointNumber[];
        keySetId: number;
        hasAuxiliaryAcl?: boolean;
        mcastAddrPolicy: MulticastAddrPolicy;
        fabricIndex: FabricIndex;
    };

    export declare class JoinGroupRequest {
        constructor(values?: Partial<JoinGroupRequest>);
        groupId: GroupId;
        endpoints: EndpointNumber[];
        keySetId: number;
        key?: Bytes;
        useAuxiliaryAcl?: boolean;
        replaceEndpoints?: boolean;
        mcastAddrPolicy?: MulticastAddrPolicy;
    };

    export declare class LeaveGroupRequest {
        constructor(values?: Partial<LeaveGroupRequest>);
        groupId: GroupId;
        endpoints?: EndpointNumber[];
    };
    export declare class LeaveGroupResponse {
        constructor(values?: Partial<LeaveGroupResponse>);
        groupId: GroupId;
        endpoints: EndpointNumber[];
    };

    export declare class UpdateGroupKeyRequest {
        constructor(values?: Partial<UpdateGroupKeyRequest>);
        groupId: GroupId;
        keySetId: number;
        key?: Bytes;
    };

    export declare class GroupcastTestingRequest {
        constructor(values?: Partial<GroupcastTestingRequest>);
        testOperation: GroupcastTesting;
        durationSeconds?: number;
    };
    export declare class ConfigureAuxiliaryAclRequest {
        constructor(values?: Partial<ConfigureAuxiliaryAclRequest>);
        groupId: GroupId;
        useAuxiliaryAcl: boolean;
    };

    export declare class GroupcastTestingEvent {
        constructor(values?: Partial<GroupcastTestingEvent>);
        sourceIpAddress?: Bytes;
        destinationIpAddress?: Bytes;
        groupId?: GroupId;
        endpointId?: EndpointNumber;
        clusterId?: ClusterId;
        elementId?: number;
        accessAllowed?: boolean;
        groupcastTestResult: GroupcastTestResult;
        fabricIndex: FabricIndex;
    };

    export enum MulticastAddrPolicy {
        /**
         * Group uses the IANA-assigned multicast address FF05::FA (default).
         */
        IanaAddr = 0,

        /**
         * Group uses multicast address scoped to Fabric ID and Group ID.
         */
        PerGroup = 1
    }

    export enum GroupcastTesting {
        DisableTesting = 0,
        EnableListenerTesting = 1,
        EnableSenderTesting = 2
    }

    export enum GroupcastTestResult {
        Success = 0,
        GeneralError = 1,
        MessageReplay = 2,
        FailedAuth = 3,
        NoAvailableKey = 4,
        SendFailure = 5
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link Groupcast}.
     */
    export const Cluster: ClusterType.WithCompat<typeof Groupcast, Groupcast>;

    /**
     * @deprecated Use {@link Groupcast}.
     */
    export const Complete: typeof Groupcast;

    export const Typing: Groupcast;
}

/**
 * @deprecated Use {@link Groupcast}.
 */
export declare const GroupcastCluster: typeof Groupcast;

export interface Groupcast extends ClusterTyping {
    Attributes: Groupcast.Attributes;
    Commands: Groupcast.Commands;
    Events: Groupcast.Events;
    Features: Groupcast.Features;
    Components: Groupcast.Components;
}
