/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { ResourceMonitoring } from "./resource-monitoring.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace WaterTankLevelMonitoring {
    export const Base = { ...ResourceMonitoring.Base, id: 0x79, name: "WaterTankLevelMonitoring" } as const;

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This alias specializes the semantics of {@link ResourceMonitoring.Base}.
     *
     * WaterTankLevelMonitoringCluster supports optional features that you can enable with the
     * WaterTankLevelMonitoringCluster.with() factory method.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * This cluster supports all WaterTankLevelMonitoring features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export const CompleteInstance = MutableCluster({
        ...ResourceMonitoring.Complete,
        id: 0x79,
        name: "WaterTankLevelMonitoring"
    });

    export interface Complete extends Identity<typeof CompleteInstance> {}
    export const Complete: Complete = CompleteInstance;
}

export type WaterTankLevelMonitoringCluster = WaterTankLevelMonitoring.Cluster;
export const WaterTankLevelMonitoringCluster = WaterTankLevelMonitoring.Cluster;
ClusterRegistry.register(WaterTankLevelMonitoring.Complete);
