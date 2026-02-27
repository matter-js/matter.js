/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, TlvNoResponse, FabricScopedAttribute, FixedAttribute, Attribute, Event } from "../cluster/Cluster.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvGroupId } from "../datatype/GroupId.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvUInt16, TlvEnum, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvFabricIndex, FabricIndex } from "../datatype/FabricIndex.js";
import { TlvByteString } from "../tlv/TlvString.js";
import { Priority } from "../globals/Priority.js";
import { TlvClusterId } from "../datatype/ClusterId.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Groupcast {
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

    /**
     * Input to the Groupcast configureAuxiliaryAcl command
     */
    export const TlvConfigureAuxiliaryAclRequest = TlvObject({
        groupId: TlvField(0, TlvGroupId),
        useAuxiliaryAcl: TlvField(1, TlvBoolean)
    });

    /**
     * Input to the Groupcast configureAuxiliaryAcl command
     */
    export interface ConfigureAuxiliaryAclRequest extends TypeFromSchema<typeof TlvConfigureAuxiliaryAclRequest> {}

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

    export const TlvMembership = TlvObject({
        groupId: TlvField(0, TlvGroupId),
        endpoints: TlvOptionalField(1, TlvArray(TlvEndpointNumber, { maxLength: 255 })),
        keySetId: TlvField(2, TlvUInt16),
        hasAuxiliaryAcl: TlvOptionalField(3, TlvBoolean),
        mcastAddrPolicy: TlvField(4, TlvEnum<MulticastAddrPolicy>()),
        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    export interface Membership extends TypeFromSchema<typeof TlvMembership> {}

    /**
     * Input to the Groupcast joinGroup command
     */
    export const TlvJoinGroupRequest = TlvObject({
        groupId: TlvField(0, TlvGroupId),
        endpoints: TlvField(1, TlvArray(TlvEndpointNumber)),
        keySetId: TlvField(2, TlvUInt16),
        key: TlvOptionalField(3, TlvByteString.bound({ length: 16 })),
        useAuxiliaryAcl: TlvOptionalField(4, TlvBoolean),
        replaceEndpoints: TlvOptionalField(5, TlvBoolean),
        mcastAddrPolicy: TlvOptionalField(6, TlvEnum<MulticastAddrPolicy>())
    });

    /**
     * Input to the Groupcast joinGroup command
     */
    export interface JoinGroupRequest extends TypeFromSchema<typeof TlvJoinGroupRequest> {}

    /**
     * Input to the Groupcast leaveGroup command
     */
    export const TlvLeaveGroupRequest = TlvObject({
        groupId: TlvField(0, TlvGroupId),
        endpoints: TlvOptionalField(1, TlvArray(TlvEndpointNumber, { minLength: 1, maxLength: 20 }))
    });

    /**
     * Input to the Groupcast leaveGroup command
     */
    export interface LeaveGroupRequest extends TypeFromSchema<typeof TlvLeaveGroupRequest> {}

    export const TlvLeaveGroupResponse = TlvObject({
        groupId: TlvField(0, TlvGroupId),
        endpoints: TlvField(1, TlvArray(TlvEndpointNumber, { maxLength: 20 }))
    });
    export interface LeaveGroupResponse extends TypeFromSchema<typeof TlvLeaveGroupResponse> {}

    /**
     * Input to the Groupcast updateGroupKey command
     */
    export const TlvUpdateGroupKeyRequest = TlvObject({
        groupId: TlvField(0, TlvGroupId),
        keySetId: TlvField(1, TlvUInt16),
        key: TlvOptionalField(2, TlvByteString.bound({ length: 16 }))
    });

    /**
     * Input to the Groupcast updateGroupKey command
     */
    export interface UpdateGroupKeyRequest extends TypeFromSchema<typeof TlvUpdateGroupKeyRequest> {}

    export enum GroupcastTesting {
        DisableTesting = 0,
        EnableListenerTesting = 1,
        EnableSenderTesting = 2
    }

    /**
     * Input to the Groupcast groupcastTesting command
     */
    export const TlvGroupcastTestingRequest = TlvObject({
        testOperation: TlvField(0, TlvEnum<GroupcastTesting>()),
        durationSeconds: TlvOptionalField(1, TlvUInt16.bound({ min: 10, max: 1200 }))
    });

    /**
     * Input to the Groupcast groupcastTesting command
     */
    export interface GroupcastTestingRequest extends TypeFromSchema<typeof TlvGroupcastTestingRequest> {}

    export enum GroupcastTestResult {
        Success = 0,
        GeneralError = 1,
        MessageReplay = 2,
        FailedAuth = 3,
        NoAvailableKey = 4,
        SendFailure = 5
    }

    /**
     * Body of the Groupcast groupcastTesting event
     */
    export const TlvGroupcastTestingEvent = TlvObject({
        sourceIpAddress: TlvOptionalField(0, TlvByteString.bound({ length: 16 })),
        destinationIpAddress: TlvOptionalField(1, TlvByteString.bound({ length: 16 })),
        groupId: TlvOptionalField(2, TlvGroupId),
        endpointId: TlvOptionalField(3, TlvEndpointNumber),
        clusterId: TlvOptionalField(4, TlvClusterId),
        elementId: TlvOptionalField(5, TlvUInt32),
        accessAllowed: TlvOptionalField(6, TlvBoolean),
        groupcastTestResult: TlvField(7, TlvEnum<GroupcastTestResult>()),
        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * Body of the Groupcast groupcastTesting event
     */
    export interface GroupcastTestingEvent extends TypeFromSchema<typeof TlvGroupcastTestingEvent> {}

    /**
     * A GroupcastCluster supports these elements if it supports feature Listener.
     */
    export const ListenerComponent = MutableCluster.Component({
        commands: {
            configureAuxiliaryAcl: Command(
                0x4,
                TlvConfigureAuxiliaryAclRequest,
                0x4,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        }
    });

    /**
     * These elements and properties are present in all Groupcast clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x65,
        name: "Groupcast",
        revision: 1,

        features: {
            /**
             * Supports joining a multicast group of nodes as a listener.
             */
            listener: BitFlag(0),

            /**
             * Supports sending multicast message to a targeted group of nodes.
             */
            sender: BitFlag(1),

            /**
             * Supports PerGroup multicast addresses.
             */
            perGroup: BitFlag(2)
        },

        attributes: {
            membership: FabricScopedAttribute(0x0, TlvArray(TlvMembership), { persistent: true, default: [] }),
            maxMembershipCount: FixedAttribute(0x1, TlvUInt16.bound({ min: 10 })),
            maxMcastAddrCount: FixedAttribute(0x2, TlvUInt16.bound({ min: 1 })),
            usedMcastAddrCount: FixedAttribute(0x3, TlvUInt16),
            fabricUnderTest: Attribute(0x4, TlvFabricIndex, { default: FabricIndex(0) })
        },

        commands: {
            joinGroup: Command(0x0, TlvJoinGroupRequest, 0x0, TlvNoResponse, { invokeAcl: AccessLevel.Manage }),

            leaveGroup: Command(
                0x1,
                TlvLeaveGroupRequest,
                0x2,
                TlvLeaveGroupResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            updateGroupKey: Command(
                0x3,
                TlvUpdateGroupKeyRequest,
                0x3,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            groupcastTesting: Command(
                0x5,
                TlvGroupcastTestingRequest,
                0x5,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Administer }
            )
        },

        events: {
            groupcastTesting: Event(0x0, Priority.Info, TlvGroupcastTestingEvent, { readAcl: AccessLevel.Administer })
        },

        /**
         * This metadata controls which GroupcastCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { listener: true }, component: ListenerComponent },
            { flags: { listener: false, sender: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * Per the Matter specification you cannot use {@link GroupcastCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const LN = { listener: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,
        attributes: Base.attributes,

        commands: {
            ...Base.commands,
            configureAuxiliaryAcl: MutableCluster.AsConditional(
                ListenerComponent.commands.configureAuxiliaryAcl,
                { mandatoryIf: [LN] }
            )
        },

        events: Base.events
    });

    /**
     * This cluster supports all Groupcast features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type GroupcastCluster = Groupcast.Cluster;
export const GroupcastCluster = Groupcast.Cluster;
ClusterRegistry.register(Groupcast.Complete);
