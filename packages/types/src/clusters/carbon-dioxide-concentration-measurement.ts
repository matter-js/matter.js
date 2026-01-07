/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { ConcentrationMeasurement } from "./concentration-measurement.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace CarbonDioxideConcentrationMeasurement {
    export const Base = {
        ...ConcentrationMeasurement.Base,
        id: 0x40d,
        name: "CarbonDioxideConcentrationMeasurement"
    } as const;

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This alias specializes the semantics of {@link ConcentrationMeasurement.Base}.
     *
     * Per the Matter specification you cannot use {@link CarbonDioxideConcentrationMeasurementCluster} without enabling
     * certain feature combinations. You must use the {@link with} factory method to obtain a working cluster.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * This cluster supports all CarbonDioxideConcentrationMeasurement features. It may support illegal feature
     * combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export const CompleteInstance = MutableCluster({
        ...ConcentrationMeasurement.Complete,
        id: 0x40d,
        name: "CarbonDioxideConcentrationMeasurement"
    });

    export interface Complete extends Identity<typeof CompleteInstance> {}
    export const Complete: Complete = CompleteInstance;
}

export type CarbonDioxideConcentrationMeasurementCluster = CarbonDioxideConcentrationMeasurement.Cluster;
export const CarbonDioxideConcentrationMeasurementCluster = CarbonDioxideConcentrationMeasurement.Cluster;
ClusterRegistry.register(CarbonDioxideConcentrationMeasurement.Complete);
