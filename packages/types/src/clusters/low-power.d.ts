/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the LowPower cluster.
 *
 * This cluster provides an interface for managing low power mode on a device.
 *
 * This cluster would be supported on an endpoint that represents a physical device with a low power mode. This cluster
 * provides a sleep() command to allow clients to manually put the device into low power mode. There is no command here
 * to wake up a sleeping device because that operation often involves other protocols such as Wake On LAN. Most devices
 * automatically enter low power mode based upon inactivity.
 *
 * The cluster server for Low Power is implemented by a device that supports a low power mode, such as a TV, Set-top
 * box, or Smart Speaker.
 *
 * > [!NOTE]
 *
 * > We have considered a “DisableLowPowerMode” command but have not added it due to suspected issues with energy
 *   consumption regulations. This can be added in the future.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.11
 */
export declare namespace LowPower {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0508;

    /**
     * Textual cluster identifier.
     */
    export const name: "LowPower";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the LowPower cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link LowPower} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command shall put the device into low power mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.11.4.1
         */
        sleep(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link LowPower}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, commands: BaseCommands }];

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link LowPower}.
     */
    export const Cluster: typeof LowPower;

    /**
     * @deprecated Use {@link LowPower}.
     */
    export const Complete: typeof LowPower;

    export const Typing: LowPower;
}

/**
 * @deprecated Use {@link LowPower}.
 */
export declare const LowPowerCluster: typeof LowPower;

export interface LowPower extends ClusterTyping {
    Commands: LowPower.Commands;
    Components: LowPower.Components;
}
