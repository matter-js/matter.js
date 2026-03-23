/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { Bytes, MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ThreadBorderRouterManagement as ThreadBorderRouterManagementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ThreadBorderRouterManagement cluster.
 */
export declare namespace ThreadBorderRouterManagement {
    /**
     * {@link ThreadBorderRouterManagement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates a user-friendly name identifying the device model or product of the Border Router in MeshCOP
             * (DNS-SD service name) as defined in the Thread specification, and has the following recommended format:
             * <VendorName> <ProductName>._meshcop._udp. An example name would be ACME Border Router
             * (74be)._meshcop._udp.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.5.1
             */
            readonly borderRouterName: string;

            /**
             * Indicates a 16-byte globally unique ID for a Thread Border Router device. This ID is
             * manufacturer-specific, and it is created and managed by the border router’s implementation.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.5.2
             */
            readonly borderAgentId: Bytes;

            /**
             * Indicates the Thread version supported by the Thread interface configured by the cluster instance.
             *
             * The format shall match the value mapping defined in the "Version TLV" section of the Thread
             * specification. For example, Thread 1.3.0 would have ThreadVersion set to 4.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.5.3
             */
            readonly threadVersion: number;

            /**
             * Indicates whether the associated IEEE 802.15.4 Thread interface is enabled or disabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.5.4
             */
            readonly interfaceEnabled: boolean;

            /**
             * Null if the Thread Border Router has no dataset configured, otherwise it shall be the timestamp value
             * extracted from the Active Dataset value configured by the Thread Node to which the border router is
             * connected. This attribute shall be updated when a new Active dataset is configured on the Thread network
             * to which the border router is connected.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.5.5
             */
            readonly activeDatasetTimestamp: number | bigint | null;

            /**
             * Null if the Thread Border Router has no Pending dataset configured, otherwise it shall be the timestamp
             * value extracted from the Pending Dataset value configured by the Thread Node to which the border router
             * is connected. This attribute shall be updated when a new Pending dataset is configured on the Thread
             * network to which the border router is connected.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.5.6
             */
            readonly pendingDatasetTimestamp: number | bigint | null;
        }

        export interface Commands {
            /**
             * This command shall be used to request the active operational dataset of the Thread network to which the
             * border router is connected.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * If an internal error occurs, then this command shall fail with a FAILURE status code sent back to the
             * initiator.
             *
             * Otherwise, this shall generate a DatasetResponse command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.1
             */
            getActiveDatasetRequest(): MaybePromise<DatasetResponse>;

            /**
             * This command shall be used to request the pending dataset of the Thread network to which the border
             * router is connected.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * If an internal error occurs, then this command shall fail with a FAILURE status code sent back to the
             * initiator.
             *
             * Otherwise, this shall generate a DatasetResponse command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.2
             */
            getPendingDatasetRequest(): MaybePromise<DatasetResponse>;

            /**
             * This command shall be used to set the active Dataset of the Thread network to which the Border Router is
             * connected, when there is no active dataset already.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.4
             */
            setActiveDatasetRequest(request: SetActiveDatasetRequest): MaybePromise;
        }
    }

    /**
     * {@link ThreadBorderRouterManagement} supports these elements if it supports feature "PanChange".
     */
    export namespace PanChangeComponent {
        export interface Commands {
            /**
             * This command shall be used to set or update the pending Dataset of the Thread network to which the Border
             * Router is connected, if the Border Router supports PAN Change.
             *
             * If the command is not executed via a CASE session, the command shall fail with a status code of
             * UNSUPPORTED_ACCESS.
             *
             * This PendingDataset field shall contain the pending dataset to which the Thread network should be
             * updated. The format of the data shall be an octet string containing the raw Thread TLV value of the
             * pending dataset, as defined in the Thread specification.
             *
             * If any of the parameters in the PendingDataset is invalid, the command shall fail with a status of
             * INVALID_COMMAND.
             *
             * Otherwise, this command shall configure the pending dataset of the Thread network to which the Border
             * Router is connected, with the value given in the PendingDataset parameter. The Border Router will manage
             * activation of the pending dataset as defined in the Thread specification.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.5
             */
            setPendingDatasetRequest(request: SetPendingDatasetRequest): MaybePromise;
        }
    }

    export interface Attributes extends Base.Attributes {}
    export interface Commands extends Base.Commands, PanChangeComponent.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { panChange: true }, commands: PanChangeComponent.Commands }
    ];
    export type Features = "PanChange";

    /**
     * These are optional features supported by ThreadBorderRouterManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.3.4
     */
    export enum Feature {
        /**
         * PanChange (PC)
         *
         * This feature shall indicate the ability of the Border Router to change its already configured PAN to another,
         * by setting a pending dataset.
         *
         * > [!NOTE]
         *
         * > This feature flag can be used to protect an already-configured network from accidental configuration
         *   change, e.g. when the Thread Border Router serves non-Matter devices that do not support PAN change for an
         *   implementation-specific reason.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.3.4.1
         */
        PanChange = "PanChange"
    }

    /**
     * This command is sent in response to GetActiveDatasetRequest or GetPendingDatasetRequest command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.3
     */
    export interface DatasetResponse {
        /**
         * If no dataset (active or pending as requested) is configured, this field shall be set to empty.
         *
         * Otherwise, this field shall contain the active or pending dataset of the Thread network to which the Border
         * Router is connected as an octet string containing the raw Thread TLV value of the dataset, as defined in the
         * Thread specification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.3.1
         */
        dataset: Bytes;
    }

    /**
     * This command shall be used to set the active Dataset of the Thread network to which the Border Router is
     * connected, when there is no active dataset already.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.4
     */
    export interface SetActiveDatasetRequest {
        /**
         * This field shall contain the active dataset to set of the Thread network to configure in the Border Router as
         * an octet string containing the raw Thread TLV value of the dataset, as defined in the Thread specification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.4.1
         */
        activeDataset: Bytes;

        /**
         * See Breadcrumb Attribute section of General Commissioning Cluster in [MatterCore] for usage.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.4.2
         */
        breadcrumb?: number | bigint;
    }

    /**
     * This command shall be used to set or update the pending Dataset of the Thread network to which the Border Router
     * is connected, if the Border Router supports PAN Change.
     *
     * If the command is not executed via a CASE session, the command shall fail with a status code of
     * UNSUPPORTED_ACCESS.
     *
     * This PendingDataset field shall contain the pending dataset to which the Thread network should be updated. The
     * format of the data shall be an octet string containing the raw Thread TLV value of the pending dataset, as
     * defined in the Thread specification.
     *
     * If any of the parameters in the PendingDataset is invalid, the command shall fail with a status of
     * INVALID_COMMAND.
     *
     * Otherwise, this command shall configure the pending dataset of the Thread network to which the Border Router is
     * connected, with the value given in the PendingDataset parameter. The Border Router will manage activation of the
     * pending dataset as defined in the Thread specification.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.5
     */
    export interface SetPendingDatasetRequest {
        pendingDataset: Bytes;
    }

    export const id: ClusterId;
    export const name: "ThreadBorderRouterManagement";
    export const revision: 1;
    export const schema: typeof ThreadBorderRouterManagementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof ThreadBorderRouterManagement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ThreadBorderRouterManagement` instead of
     * `ThreadBorderRouterManagement.Complete`)
     */
    export const Complete: typeof ThreadBorderRouterManagement;

    export const Typing: ThreadBorderRouterManagement;
}

export declare const ThreadBorderRouterManagementCluster: typeof ThreadBorderRouterManagement;
export interface ThreadBorderRouterManagement extends ClusterTyping { Attributes: ThreadBorderRouterManagement.Attributes; Commands: ThreadBorderRouterManagement.Commands; Features: ThreadBorderRouterManagement.Features; Components: ThreadBorderRouterManagement.Components }
