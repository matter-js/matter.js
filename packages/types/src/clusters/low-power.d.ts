/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { LowPower as LowPowerModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the LowPower cluster.
 */
export declare namespace LowPower {
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

    export const id: ClusterId;
    export const name: "LowPower";
    export const revision: 1;
    export const schema: typeof LowPowerModel;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export const Cluster: typeof LowPower;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `LowPower` instead of `LowPower.Complete`)
     */
    export const Complete: typeof LowPower;

    export const Typing: LowPower;
}

export declare const LowPowerCluster: typeof LowPower;
export interface LowPower extends ClusterTyping { Commands: LowPower.Commands; Components: LowPower.Components }
