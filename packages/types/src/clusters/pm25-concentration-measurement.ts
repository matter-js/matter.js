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

export namespace Pm25ConcentrationMeasurement {
    export const Base = { ...ConcentrationMeasurement.Base, id: 0x42a, name: "Pm25ConcentrationMeasurement" } as const;

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This alias specializes the semantics of {@link ConcentrationMeasurement.Base}.
     *
     * Per the Matter specification you cannot use {@link Pm25ConcentrationMeasurementCluster} without enabling certain
     * feature combinations. You must use the {@link with} factory method to obtain a working cluster.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * This cluster supports all Pm25ConcentrationMeasurement features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export const CompleteInstance = MutableCluster({
        ...ConcentrationMeasurement.Complete,
        id: 0x42a,
        name: "Pm25ConcentrationMeasurement"
    });

    export interface Complete extends Identity<typeof CompleteInstance> {}
    export const Complete: Complete = CompleteInstance;
}

export type Pm25ConcentrationMeasurementCluster = Pm25ConcentrationMeasurement.Cluster;
export const Pm25ConcentrationMeasurementCluster = Pm25ConcentrationMeasurement.Cluster;
ClusterRegistry.register(Pm25ConcentrationMeasurement.Complete);
