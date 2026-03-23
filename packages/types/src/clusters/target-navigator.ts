/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise, Bytes } from "@matter/general";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { TargetNavigator as TargetNavigatorModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the TargetNavigator cluster.
 */
export namespace TargetNavigator {
    /**
     * {@link TargetNavigator} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates a list of targets that can be navigated to within the experience presented to the user by the
             * Endpoint (Video Player or Content App). The list shall NOT contain any entries with the same Identifier
             * in the TargetInfoStruct object.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.1
             */
            readonly targetList: TargetInfo[];

            /**
             * Indicates the Identifier for the target which is currently in foreground on the corresponding Endpoint
             * (Video Player or Content App), or 0xFF to indicate that no target is in the foreground.
             *
             * When not 0xFF, the CurrentTarget shall be an Identifier value contained within one of the
             * TargetInfoStruct objects in the TargetList attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.2
             */
            readonly currentTarget?: number;
        }

        export interface Commands {
            /**
             * Upon receipt, this shall navigation the UX to the target identified.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
             */
            navigateTarget(request: NavigateTargetRequest): MaybePromise<NavigateTargetResponse>;
        }

        export interface Events {
            /**
             * This event shall be generated when there is a change in either the active target or the list of available
             * targets or both.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
             */
            targetUpdated?: TargetUpdatedEvent;
        }
    }

    /**
     * Attributes that may appear in {@link TargetNavigator}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * Indicates a list of targets that can be navigated to within the experience presented to the user by the
         * Endpoint (Video Player or Content App). The list shall NOT contain any entries with the same Identifier in
         * the TargetInfoStruct object.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.1
         */
        readonly targetList: TargetInfo[];

        /**
         * Indicates the Identifier for the target which is currently in foreground on the corresponding Endpoint (Video
         * Player or Content App), or 0xFF to indicate that no target is in the foreground.
         *
         * When not 0xFF, the CurrentTarget shall be an Identifier value contained within one of the TargetInfoStruct
         * objects in the TargetList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.2
         */
        readonly currentTarget: number;
    }

    export interface Commands extends Base.Commands {}

    /**
     * Events that may appear in {@link TargetNavigator}.
     *
     * Devices may not support all of these events.
     */
    export interface Events {
        /**
         * This event shall be generated when there is a change in either the active target or the list of available
         * targets or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
         */
        targetUpdated: TargetUpdatedEvent;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes, commands: Base.Commands, events: Base.Events }];

    /**
     * This indicates an object describing the navigable target.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2
     */
    export interface TargetInfo {
        /**
         * This field shall contain an unique id within the TargetList.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2.1
         */
        identifier: number;

        /**
         * This field shall contain a name string for the TargetInfoStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.2.2
         */
        name: string;
    }

    /**
     * Upon receipt, this shall navigation the UX to the target identified.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
     */
    export interface NavigateTargetRequest {
        /**
         * This field shall indicate the Identifier for the target for UX navigation. The Target shall be an Identifier
         * value contained within one of the TargetInfoStruct objects in the TargetList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1.1
         */
        target: number;

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1.2
         */
        data?: string;
    }

    /**
     * This command shall be generated in response to NavigateTarget command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2
     */
    export interface NavigateTargetResponse {
        /**
         * This field shall indicate the of the command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2.1
         */
        status: Status;

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.2.2
         */
        data?: string;
    }

    /**
     * This event shall be generated when there is a change in either the active target or the list of available targets
     * or both.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
     */
    export interface TargetUpdatedEvent {
        targetList?: TargetInfo[];
        currentTarget?: number;
        data?: Bytes;
    }

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

    export const id = ClusterId(0x505);
    export const name = "TargetNavigator" as const;
    export const revision = 2;
    export const schema = TargetNavigatorModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export type Cluster = typeof TargetNavigator;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `TargetNavigator` instead of `TargetNavigator.Complete`)
     */
    export type Complete = typeof TargetNavigator;

    export declare const Complete: Complete;
    export declare const Typing: TargetNavigator;
}

ClusterNamespace.define(TargetNavigator);
export type TargetNavigatorCluster = TargetNavigator.Cluster;
export const TargetNavigatorCluster = TargetNavigator.Cluster;
export interface TargetNavigator extends ClusterTyping { Attributes: TargetNavigator.Attributes; Commands: TargetNavigator.Commands; Events: TargetNavigator.Events; Components: TargetNavigator.Components }
