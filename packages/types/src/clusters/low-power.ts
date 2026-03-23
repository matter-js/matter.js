/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { LowPower as LowPowerModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the LowPower cluster.
 */
export namespace LowPower {
    /**
     * {@link LowPower} always supports these elements.
     */
    export namespace Base {
        export interface Commands {
            /**
             * This command shall put the device into low power mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.11.4.1
             */
            sleep(): MaybePromise;
        }
    }

    export interface Commands extends Base.Commands {}
    export type Components = [{ flags: {}, commands: Base.Commands }];

    export const id = ClusterId(0x508);
    export const name = "LowPower" as const;
    export const revision = 1;
    export const schema = LowPowerModel;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export type Cluster = typeof LowPower;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `LowPower` instead of `LowPower.Complete`)
     */
    export type Complete = typeof LowPower;

    export declare const Complete: Complete;
    export declare const Typing: LowPower;
}

ClusterNamespace.define(LowPower);
export type LowPowerCluster = LowPower.Cluster;
export const LowPowerCluster = LowPower.Cluster;
export interface LowPower extends ClusterTyping { Commands: LowPower.Commands; Components: LowPower.Components }
