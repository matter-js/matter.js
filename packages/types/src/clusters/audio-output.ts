/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { AudioOutput as AudioOutputModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the AudioOutput cluster.
 */
export namespace AudioOutput {
    /**
     * {@link AudioOutput} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute provides the list of outputs supported by the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.6.1
             */
            readonly outputList: OutputInfo[];

            /**
             * This attribute contains the value of the index field of the currently selected OutputInfoStruct.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.6.2
             */
            readonly currentOutput: number;
        }

        export interface Commands {
            /**
             * Upon receipt, this shall change the output on the device to the output at a specific index in the Output
             * List.
             *
             * Note that when the current output is set to an output of type HDMI, adjustments to volume via a Speaker
             * endpoint on the same node may cause HDMI volume up/down commands to be sent to the given HDMI output.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1
             */
            selectOutput(request: SelectOutputRequest): MaybePromise;
        }
    }

    /**
     * {@link AudioOutput} supports these elements if it supports feature "NameUpdates".
     */
    export namespace NameUpdatesComponent {
        export interface Commands {
            /**
             * Upon receipt, this shall rename the output at a specific index in the Output List.
             *
             * Updates to the output name shall appear in the device’s settings menus. Name updates may automatically be
             * sent to the actual device to which the output connects.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.2
             */
            renameOutput(request: RenameOutputRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link AudioOutput}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute provides the list of outputs supported by the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.6.1
         */
        readonly outputList: OutputInfo[];

        /**
         * This attribute contains the value of the index field of the currently selected OutputInfoStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.6.2
         */
        readonly currentOutput: number;
    }

    export interface Commands extends Base.Commands, NameUpdatesComponent.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { nameUpdates: true }, commands: NameUpdatesComponent.Commands }
    ];
    export type Features = "NameUpdates";

    /**
     * These are optional features supported by AudioOutputCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.4
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
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2
     */
    export interface OutputInfo {
        /**
         * This field shall indicate the unique index into the list of outputs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2.1
         */
        index: number;

        /**
         * This field shall indicate the type of output.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2.2
         */
        outputType: OutputType;

        /**
         * The device defined and user editable output name, such as “Soundbar”, “Speakers”. This field may be blank,
         * but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2.3
         */
        name: string;
    }

    /**
     * Upon receipt, this shall change the output on the device to the output at a specific index in the Output List.
     *
     * Note that when the current output is set to an output of type HDMI, adjustments to volume via a Speaker endpoint
     * on the same node may cause HDMI volume up/down commands to be sent to the given HDMI output.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1
     */
    export interface SelectOutputRequest {
        /**
         * This shall indicate the index field of the OutputInfoStruct from the OutputList attribute in which to change
         * to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1.1
         */
        index: number;
    }

    /**
     * Upon receipt, this shall rename the output at a specific index in the Output List.
     *
     * Updates to the output name shall appear in the device’s settings menus. Name updates may automatically be sent to
     * the actual device to which the output connects.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.2
     */
    export interface RenameOutputRequest {
        index: number;
        name: string;
    }

    /**
     * The type of output, expressed as an enum, with the following values:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.1
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

    export const id = ClusterId(0x50b);
    export const name = "AudioOutput" as const;
    export const revision = 1;
    export const schema = AudioOutputModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof AudioOutput;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `AudioOutput` instead of `AudioOutput.Complete`)
     */
    export type Complete = typeof AudioOutput;

    export declare const Complete: Complete;
    export declare const Typing: AudioOutput;
}

ClusterNamespace.define(AudioOutput);
export type AudioOutputCluster = AudioOutput.Cluster;
export const AudioOutputCluster = AudioOutput.Cluster;
export interface AudioOutput extends ClusterTyping { Attributes: AudioOutput.Attributes; Commands: AudioOutput.Commands; Features: AudioOutput.Features; Components: AudioOutput.Components }
