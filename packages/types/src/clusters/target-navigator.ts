/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute, Command, OptionalEvent } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvUInt8, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace TargetNavigator {
    /**
     * This indicates an object describing the navigable target.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2
     */
    export const TlvTargetInfo = TlvObject({
        /**
         * This field shall contain an unique id within the TargetList.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2.1
         */
        identifier: TlvField(0, TlvUInt8.bound({ max: 254 })),

        /**
         * This field shall contain a name string for the TargetInfoStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2.2
         */
        name: TlvField(1, TlvString)
    });

    /**
     * This indicates an object describing the navigable target.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2
     */
    export interface TargetInfo extends TypeFromSchema<typeof TlvTargetInfo> {}

    /**
     * Input to the TargetNavigator navigateTarget command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
     */
    export const TlvNavigateTargetRequest = TlvObject({
        /**
         * This field shall indicate the Identifier for the target for UX navigation. The Target shall be an Identifier
         * value contained within one of the TargetInfoStruct objects in the TargetList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1.1
         */
        target: TlvField(0, TlvUInt8),

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1.2
         */
        data: TlvOptionalField(1, TlvString)
    });

    /**
     * Input to the TargetNavigator navigateTarget command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
     */
    export interface NavigateTargetRequest extends TypeFromSchema<typeof TlvNavigateTargetRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.1
     */
    export enum Status {
        /**
         * Command succeeded
         */
        Success = 0,

        /**
         * Requested target was not found in the TargetList
         */
        TargetNotFound = 1,

        /**
         * Target request is not allowed in current state.
         */
        NotAllowed = 2
    }

    /**
     * Thrown for cluster status code {@link Status.TargetNotFound}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.1
     */
    export class TargetNotFoundError extends StatusResponseError {
        constructor(
            message = "Requested target was not found in the TargetList",
            code = GlobalStatus.Failure,
            clusterCode = Status.TargetNotFound
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.NotAllowed}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.1
     */
    export class NotAllowedError extends StatusResponseError {
        constructor(
            message = "Target request is not allowed in current state",
            code = GlobalStatus.Failure,
            clusterCode = Status.NotAllowed
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * This command shall be generated in response to NavigateTarget command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2
     */
    export const TlvNavigateTargetResponse = TlvObject({
        /**
         * This field shall indicate the of the command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2.2
         */
        data: TlvOptionalField(1, TlvString)
    });

    /**
     * This command shall be generated in response to NavigateTarget command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2
     */
    export interface NavigateTargetResponse extends TypeFromSchema<typeof TlvNavigateTargetResponse> {}

    /**
     * Body of the TargetNavigator targetUpdated event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
     */
    export const TlvTargetUpdatedEvent = TlvObject({
        targetList: TlvOptionalField(0, TlvArray(TlvTargetInfo)),
        currentTarget: TlvOptionalField(1, TlvUInt8),
        data: TlvOptionalField(2, TlvByteString.bound({ maxLength: 900 }))
    });

    /**
     * Body of the TargetNavigator targetUpdated event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
     */
    export interface TargetUpdatedEvent extends TypeFromSchema<typeof TlvTargetUpdatedEvent> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x505,
        name: "TargetNavigator",
        revision: 2,

        attributes: {
            /**
             * Indicates a list of targets that can be navigated to within the experience presented to the user by the
             * Endpoint (Video Player or Content App). The list shall NOT contain any entries with the same Identifier
             * in the TargetInfoStruct object.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.1
             */
            targetList: Attribute(0x0, TlvArray(TlvTargetInfo), { default: [] }),

            /**
             * Indicates the Identifier for the target which is currently in foreground on the corresponding Endpoint
             * (Video Player or Content App), or 0xFF to indicate that no target is in the foreground.
             *
             * When not 0xFF, the CurrentTarget shall be an Identifier value contained within one of the
             * TargetInfoStruct objects in the TargetList attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.2
             */
            currentTarget: OptionalAttribute(0x1, TlvUInt8, { default: 255 })
        },

        commands: {
            /**
             * Upon receipt, this shall navigation the UX to the target identified.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
             */
            navigateTarget: Command(0x0, TlvNavigateTargetRequest, 0x1, TlvNavigateTargetResponse)
        },

        events: {
            /**
             * This event shall be generated when there is a change in either the active target or the list of available
             * targets or both.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
             */
            targetUpdated: OptionalEvent(0x0, Priority.Info, TlvTargetUpdatedEvent)
        }
    });

    /**
     * This cluster provides an interface for UX navigation within a set of targets on a device or endpoint.
     *
     * This cluster would be supported on Video Player devices or devices with navigable user interfaces. This cluster
     * would also be supported on endpoints with navigable user interfaces such as a Content App. It supports listing a
     * set of navigation targets, tracking and changing the current target.
     *
     * The cluster server for Target Navigator is implemented by endpoints on a device that support UX navigation.
     *
     * When this cluster is implemented for a Content App endpoint, the Video Player device containing the endpoint
     * shall launch the Content App when a client invokes the NavigateTarget command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type TargetNavigatorCluster = TargetNavigator.Cluster;
export const TargetNavigatorCluster = TargetNavigator.Cluster;
ClusterRegistry.register(TargetNavigator.Complete);
