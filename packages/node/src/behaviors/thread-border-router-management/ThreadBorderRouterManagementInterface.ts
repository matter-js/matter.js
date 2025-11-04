/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ThreadBorderRouterManagement } from "#clusters/thread-border-router-management";

export namespace ThreadBorderRouterManagementInterface {
    export interface Base {
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
        getActiveDatasetRequest(): MaybePromise<ThreadBorderRouterManagement.DatasetResponse>;

        /**
         * This command shall be used to request the pending dataset of the Thread network to which the border router is
         * connected.
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
        getPendingDatasetRequest(): MaybePromise<ThreadBorderRouterManagement.DatasetResponse>;

        /**
         * This command shall be used to set the active Dataset of the Thread network to which the Border Router is
         * connected, when there is no active dataset already.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.4
         */
        setActiveDatasetRequest(request: ThreadBorderRouterManagement.SetActiveDatasetRequest): MaybePromise;
    }

    export interface PanChange {
        /**
         * This command shall be used to set or update the pending Dataset of the Thread network to which the Border
         * Router is connected, if the Border Router supports PAN Change.
         *
         * If the command is not executed via a CASE session, the command shall fail with a status code of
         * UNSUPPORTED_ACCESS.
         *
         * This PendingDataset field shall contain the pending dataset to which the Thread network should be updated.
         * The format of the data shall be an octet string containing the raw Thread TLV value of the pending dataset,
         * as defined in the Thread specification.
         *
         * If any of the parameters in the PendingDataset is invalid, the command shall fail with a status of
         * INVALID_COMMAND.
         *
         * Otherwise, this command shall configure the pending dataset of the Thread network to which the Border Router
         * is connected, with the value given in the PendingDataset parameter. The Border Router will manage activation
         * of the pending dataset as defined in the Thread specification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 10.3.6.5
         */
        setPendingDatasetRequest(request: ThreadBorderRouterManagement.SetPendingDatasetRequest): MaybePromise;
    }
}

export type ThreadBorderRouterManagementInterface = {
    components: [
        { flags: {}, methods: ThreadBorderRouterManagementInterface.Base },
        { flags: { panChange: true }, methods: ThreadBorderRouterManagementInterface.PanChange }
    ]
};
