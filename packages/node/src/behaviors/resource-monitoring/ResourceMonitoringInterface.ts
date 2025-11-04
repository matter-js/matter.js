/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace ResourceMonitoringInterface {
    export interface Base {
        /**
         * Upon receipt, the device shall reset the Condition and ChangeIndicator attributes, indicating full resource
         * availability and readiness for use, as initially configured. Invocation of this command may cause the
         * LastChangedTime to be updated automatically based on the clock of the server, if the server supports setting
         * the attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.7.1
         */
        resetCondition(): MaybePromise;
    }
}

export type ResourceMonitoringInterface = { components: [{ flags: {}, methods: ResourceMonitoringInterface.Base }] };
