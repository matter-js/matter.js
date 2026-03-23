/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status as GlobalStatus } from "../globals/Status.js";

/**
 * Definitions for the TargetNavigator cluster.
 *
 * This cluster provides an interface for UX navigation within a set of targets on a device or endpoint.
 *
 * This cluster would be supported on Video Player devices or devices with navigable user interfaces. This cluster would
 * also be supported on endpoints with navigable user interfaces such as a Content App. It supports listing a set of
 * navigation targets, tracking and changing the current target.
 *
 * The cluster server for Target Navigator is implemented by endpoints on a device that support UX navigation.
 *
 * When this cluster is implemented for a Content App endpoint, the Video Player device containing the endpoint shall
 * launch the Content App when a client invokes the NavigateTarget command.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 6.11
 */
export declare namespace TargetNavigator {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0505;

    /**
     * Textual cluster identifier.
     */
    export const name: "TargetNavigator";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the TargetNavigator cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TargetNavigator} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates a list of targets that can be navigated to within the experience presented to the user by the
         * Endpoint (Video Player or Content App). The list shall NOT contain any entries with the same Identifier in
         * the TargetInfoStruct object.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.1
         */
        targetList: TargetInfo[];

        /**
         * Indicates the Identifier for the target which is currently in foreground on the corresponding Endpoint (Video
         * Player or Content App), or 0xFF to indicate that no target is in the foreground.
         *
         * When not 0xFF, the CurrentTarget shall be an Identifier value contained within one of the TargetInfoStruct
         * objects in the TargetList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.2
         */
        currentTarget?: number;
    }

    /**
     * Attributes that may appear in {@link TargetNavigator}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Attributes {
        /**
         * Indicates a list of targets that can be navigated to within the experience presented to the user by the
         * Endpoint (Video Player or Content App). The list shall NOT contain any entries with the same Identifier in
         * the TargetInfoStruct object.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.1
         */
        targetList: TargetInfo[];

        /**
         * Indicates the Identifier for the target which is currently in foreground on the corresponding Endpoint (Video
         * Player or Content App), or 0xFF to indicate that no target is in the foreground.
         *
         * When not 0xFF, the CurrentTarget shall be an Identifier value contained within one of the TargetInfoStruct
         * objects in the TargetList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.5.2
         */
        currentTarget: number;
    }

    /**
     * {@link TargetNavigator} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this shall navigation the UX to the target identified.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
         */
        navigateTarget(request: NavigateTargetRequest): MaybePromise<NavigateTargetResponse>;
    }

    /**
     * Commands that may appear in {@link TargetNavigator}.
     */
    export interface Commands extends BaseCommands {}

    /**
     * {@link TargetNavigator} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when there is a change in either the active target or the list of available
         * targets or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.7.1
         */
        targetUpdated?: TargetUpdatedEvent;
    }

    /**
     * Events that may appear in {@link TargetNavigator}.
     *
     * Some properties may be optional if device support is not mandatory.
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

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents }];

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
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.NotAllowed}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.11.4.1
     */
    export class NotAllowedError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterNamespace.EventObjects<Events>;

    /**
     * @deprecated Use {@link TargetNavigator}.
     */
    export const Cluster: typeof TargetNavigator;

    /**
     * @deprecated Use {@link TargetNavigator}.
     */
    export const Complete: typeof TargetNavigator;

    export const Typing: TargetNavigator;
}

/**
 * @deprecated Use {@link TargetNavigator}.
 */
export declare const TargetNavigatorCluster: typeof TargetNavigator;

export interface TargetNavigator extends ClusterTyping {
    Attributes: TargetNavigator.Attributes;
    Commands: TargetNavigator.Commands;
    Events: TargetNavigator.Events;
    Components: TargetNavigator.Components;
}
