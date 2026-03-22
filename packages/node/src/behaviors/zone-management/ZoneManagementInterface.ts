/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ZoneManagement } from "@matter/types/clusters/zone-management";

export namespace ZoneManagementInterface {
    export interface Base {
        /**
         * This command is used to create or update a Trigger for the specified motion Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.5
         */
        createOrUpdateTrigger(request: ZoneManagement.CreateOrUpdateTriggerRequest): MaybePromise;

        /**
         * This command shall remove the Trigger for the provided ZoneID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.6
         */
        removeTrigger(request: ZoneManagement.RemoveTriggerRequest): MaybePromise;
    }

    export interface UserDefined {
        /**
         * This command shall remove the user-defined Zone indicated by ZoneID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.4
         */
        removeZone(request: ZoneManagement.RemoveZoneRequest): MaybePromise;
    }

    export interface TwoDimensionalCartesianZoneAndUserDefined {
        /**
         * This command shall create and store a TwoD Cartesian Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.1
         */
        createTwoDCartesianZone(request: ZoneManagement.CreateTwoDCartesianZoneRequest): MaybePromise<ZoneManagement.CreateTwoDCartesianZoneResponse>;

        /**
         * The UpdateTwoDCartesianZone shall update a stored TwoD Cartesian Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.3
         */
        updateTwoDCartesianZone(request: ZoneManagement.UpdateTwoDCartesianZoneRequest): MaybePromise;
    }
}

export type ZoneManagementInterface = {
    components: [
        { flags: {}, methods: ZoneManagementInterface.Base },
        { flags: { userDefined: true }, methods: ZoneManagementInterface.UserDefined },
        {
            flags: { twoDimensionalCartesianZone: true, userDefined: true },
            methods: ZoneManagementInterface.TwoDimensionalCartesianZoneAndUserDefined
        }
    ]
};
