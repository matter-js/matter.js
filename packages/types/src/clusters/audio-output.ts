/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Command, TlvNoResponse, Attribute } from "../cluster/Cluster.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt8, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace AudioOutput {
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
     * Input to the AudioOutput renameOutput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.2
     */
    export const TlvRenameOutputRequest = TlvObject({ index: TlvField(0, TlvUInt8), name: TlvField(1, TlvString) });

    /**
     * Input to the AudioOutput renameOutput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.2
     */
    export interface RenameOutputRequest extends TypeFromSchema<typeof TlvRenameOutputRequest> {}

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

    /**
     * This contains information about an output.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2
     */
    export const TlvOutputInfo = TlvObject({
        /**
         * This field shall indicate the unique index into the list of outputs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2.1
         */
        index: TlvField(0, TlvUInt8),

        /**
         * This field shall indicate the type of output.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2.2
         */
        outputType: TlvField(1, TlvEnum<OutputType>()),

        /**
         * The device defined and user editable output name, such as “Soundbar”, “Speakers”. This field may be blank,
         * but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2.3
         */
        name: TlvField(2, TlvString)
    });

    /**
     * This contains information about an output.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.5.2
     */
    export interface OutputInfo extends TypeFromSchema<typeof TlvOutputInfo> {}

    /**
     * Input to the AudioOutput selectOutput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1
     */
    export const TlvSelectOutputRequest = TlvObject({
        /**
         * This shall indicate the index field of the OutputInfoStruct from the OutputList attribute in which to change
         * to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1.1
         */
        index: TlvField(0, TlvUInt8)
    });

    /**
     * Input to the AudioOutput selectOutput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1
     */
    export interface SelectOutputRequest extends TypeFromSchema<typeof TlvSelectOutputRequest> {}

    /**
     * A AudioOutputCluster supports these elements if it supports feature NameUpdates.
     */
    export const NameUpdatesComponent = MutableCluster.Component({
        commands: {
            /**
             * Upon receipt, this shall rename the output at a specific index in the Output List.
             *
             * Updates to the output name shall appear in the device’s settings menus. Name updates may automatically be
             * sent to the actual device to which the output connects.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.2
             */
            renameOutput: Command(0x1, TlvRenameOutputRequest, 0x1, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * These elements and properties are present in all AudioOutput clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x50b,
        name: "AudioOutput",
        revision: 1,

        features: {
            /**
             * Supports updates to output names
             */
            nameUpdates: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute provides the list of outputs supported by the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.6.1
             */
            outputList: Attribute(0x0, TlvArray(TlvOutputInfo), { default: [] }),

            /**
             * This attribute contains the value of the index field of the currently selected OutputInfoStruct.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.6.2
             */
            currentOutput: Attribute(0x1, TlvUInt8)
        },

        commands: {
            /**
             * Upon receipt, this shall change the output on the device to the output at a specific index in the Output
             * List.
             *
             * Note that when the current output is set to an output of type HDMI, adjustments to volume via a Speaker
             * endpoint on the same node may cause HDMI volume up/down commands to be sent to the given HDMI output.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.5.7.1
             */
            selectOutput: Command(0x0, TlvSelectOutputRequest, 0x0, TlvNoResponse)
        },

        /**
         * This metadata controls which AudioOutputCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { nameUpdates: true }, component: NameUpdatesComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for controlling the Output on a Video Player device such as a TV.
     *
     * This cluster would be supported on a device with audio outputs like a Video Player device (Smart TV, TV Setup Top
     * Box, Smart Speaker, etc).
     *
     * This cluster provides the list of available outputs and provides commands for selecting and renaming them.
     *
     * The cluster server for Audio Output is implemented by a device that has configurable audio output.
     *
     * AudioOutputCluster supports optional features that you can enable with the AudioOutputCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const NU = { nameUpdates: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,
        attributes: Cluster.attributes,

        commands: {
            ...Cluster.commands,
            renameOutput: MutableCluster.AsConditional(
                NameUpdatesComponent.commands.renameOutput,
                { mandatoryIf: [NU] }
            )
        }
    });

    /**
     * This cluster supports all AudioOutput features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type AudioOutputCluster = AudioOutput.Cluster;
export const AudioOutputCluster = AudioOutput.Cluster;
ClusterRegistry.register(AudioOutput.Complete);
