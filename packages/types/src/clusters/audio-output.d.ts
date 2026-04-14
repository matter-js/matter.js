/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the AudioOutput cluster.
 *
 * This cluster provides an interface for controlling the Output on a Video Player device such as a TV.
 *
 * This cluster would be supported on a device with audio outputs like a Video Player device (Smart TV, TV Setup Top
 * Box, Smart Speaker, etc).
 *
 * This cluster provides the list of available outputs and provides commands for selecting and renaming them.
 *
 * The cluster server for Audio Output is implemented by a device that has configurable audio output.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 6.5
 */
export declare namespace AudioOutput {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x050b;

    /**
     * Textual cluster identifier.
     */
    export const name: "AudioOutput";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the AudioOutput cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link AudioOutput} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute provides the list of outputs supported by the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.6.1
         */
        outputList: OutputInfo[];

        /**
         * This attribute contains the value of the index field of the currently selected OutputInfoStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.6.2
         */
        currentOutput: number;
    }

    /**
     * Attributes that may appear in {@link AudioOutput}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute provides the list of outputs supported by the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.6.1
         */
        outputList: OutputInfo[];

        /**
         * This attribute contains the value of the index field of the currently selected OutputInfoStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.6.2
         */
        currentOutput: number;
    }

    /**
     * {@link AudioOutput} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this shall change the output on the device to the output at a specific index in the Output
         * List.
         *
         * Note that when the current output is set to an output of type HDMI, adjustments to volume via a Speaker
         * endpoint on the same node may cause HDMI volume up/down commands to be sent to the given HDMI output.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.7.1
         */
        selectOutput(): MaybePromise;
    }

    /**
     * {@link AudioOutput} supports these elements if it supports feature "NameUpdates".
     */
    export interface NameUpdatesCommands {
        /**
         * Upon receipt, this shall rename the output at a specific index in the Output List.
         *
         * Updates to the output name shall appear in the device's settings menus. Name updates may automatically be
         * sent to the actual device to which the output connects.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.7.2
         */
        renameOutput(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link AudioOutput}.
     */
    export interface Commands extends
        BaseCommands,
        NameUpdatesCommands
    {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { nameUpdates: true }, commands: NameUpdatesCommands }
    ];
    export type Features = "NameUpdates";

    /**
     * These are optional features supported by AudioOutputCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.5.4
     */
    export enum Feature {
        /**
         * NameUpdates (NU)
         *
         * Supports updates to output names
         */
        NameUpdates = "NameUpdates"
    }

    /**
     * This contains information about an output.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.5.5.2
     */
    export declare class OutputInfo {
        constructor(values?: Partial<OutputInfo>);

        /**
         * This field shall indicate the unique index into the list of outputs.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.5.2.1
         */
        index: number;

        /**
         * This field shall indicate the type of output.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.5.2.2
         */
        outputType: OutputType;

        /**
         * The device defined and user editable output name, such as “Soundbar”, “Speakers”. This field may be blank,
         * but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.5.5.2.3
         */
        name: string;
    };

    /**
     * The type of output, expressed as an enum, with the following values:
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.5.5.1
     */
    export enum OutputType {
        /**
         * HDMI
         */
        Hdmi = 0,

        Bt = 1,
        Optical = 2,
        Headphone = 3,
        Internal = 4,
        Other = 5
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link AudioOutput}.
     */
    export const Cluster: ClusterType.WithCompat<typeof AudioOutput, AudioOutput>;

    /**
     * @deprecated Use {@link AudioOutput}.
     */
    export const Complete: typeof AudioOutput;

    export const Typing: AudioOutput;
}

/**
 * @deprecated Use {@link AudioOutput}.
 */
export declare const AudioOutputCluster: typeof AudioOutput;

export interface AudioOutput extends ClusterTyping {
    Attributes: AudioOutput.Attributes;
    Commands: AudioOutput.Commands;
    Features: AudioOutput.Features;
    Components: AudioOutput.Components;
}
