/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity, MaybePromise } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { LowPower as LowPowerModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the LowPower cluster.
 */
export namespace LowPower {
    export interface Commands extends Commands.Base {}

    export namespace Commands {
        /**
         * {@link LowPower} always supports these commands.
         */
        export interface Base {
            /**
             * This command shall put the device into low power mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.11.4.1
             */
            sleep(): MaybePromise;
        }

        export type Components = [{ flags: {}, methods: Base }];
    }

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x508,
        name: "LowPower",
        revision: 1,

        commands: {
            /**
             * This command shall put the device into low power mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.11.4.1
             */
            sleep: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse)
        }
    });

    /**
     * This cluster provides an interface for managing low power mode on a device.
     *
     * This cluster would be supported on an endpoint that represents a physical device with a low power mode. This
     * cluster provides a sleep() command to allow clients to manually put the device into low power mode. There is no
     * command here to wake up a sleeping device because that operation often involves other protocols such as Wake On
     * LAN. Most devices automatically enter low power mode based upon inactivity.
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
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x508);
    export const name = "LowPower" as const;
    export const revision = 1;
    export const schema = LowPowerModel;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const Typing: LowPower;
}

export type LowPowerCluster = LowPower.Cluster;
export const LowPowerCluster = LowPower.Cluster;
ClusterRegistry.register(LowPower.Complete);
ClusterNamespace.define(LowPower);
export interface LowPower extends ClusterTyping { Commands: LowPower.Commands & { Components: LowPower.Commands.Components } }
