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
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace MediaInput {
    /**
     * These are optional features supported by MediaInputCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.4
     */
    export enum Feature {
        /**
         * NameUpdates (NU)
         *
         * Supports updates to the input names
         */
        NameUpdates = "NameUpdates"
    }

    /**
     * Input to the MediaInput renameInput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.4
     */
    export const TlvRenameInputRequest = TlvObject({ index: TlvField(0, TlvUInt8), name: TlvField(1, TlvString) });

    /**
     * Input to the MediaInput renameInput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.4
     */
    export interface RenameInputRequest extends TypeFromSchema<typeof TlvRenameInputRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.1
     */
    export enum InputType {
        /**
         * Indicates content not coming from a physical input.
         */
        Internal = 0,

        Aux = 1,
        Coax = 2,
        Composite = 3,
        Hdmi = 4,
        Input = 5,
        Line = 6,
        Optical = 7,
        Video = 8,
        Scart = 9,
        Usb = 10,
        Other = 11
    }

    /**
     * This contains information about an input.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2
     */
    export const TlvInputInfo = TlvObject({
        /**
         * This field shall indicate the unique index into the list of Inputs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.1
         */
        index: TlvField(0, TlvUInt8),

        /**
         * ### This field shall indicate the type of input
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.2
         */
        inputType: TlvField(1, TlvEnum<InputType>()),

        /**
         * This field shall indicate the input name, such as “HDMI 1”. This field may be blank, but SHOULD be provided
         * when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.3
         */
        name: TlvField(2, TlvString),

        /**
         * This field shall indicate the user editable input description, such as “Living room Playstation”. This field
         * may be blank, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.4
         */
        description: TlvField(3, TlvString)
    });

    /**
     * This contains information about an input.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2
     */
    export interface InputInfo extends TypeFromSchema<typeof TlvInputInfo> {}

    /**
     * Input to the MediaInput selectInput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1
     */
    export const TlvSelectInputRequest = TlvObject({
        /**
         * This field shall indicate the index field of the InputInfoStruct from the InputList attribute in which to
         * change to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1.1
         */
        index: TlvField(0, TlvUInt8)
    });

    /**
     * Input to the MediaInput selectInput command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1
     */
    export interface SelectInputRequest extends TypeFromSchema<typeof TlvSelectInputRequest> {}

    /**
     * A MediaInputCluster supports these elements if it supports feature NameUpdates.
     */
    export const NameUpdatesComponent = MutableCluster.Component({
        commands: {
            /**
             * Upon receipt, this command shall rename the input at a specific index in the Input List. Updates to the
             * input name shall appear in the device’s settings menus.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.4
             */
            renameInput: Command(0x3, TlvRenameInputRequest, 0x3, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * These elements and properties are present in all MediaInput clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x507,
        name: "MediaInput",
        revision: 1,

        features: {
            /**
             * Supports updates to the input names
             */
            nameUpdates: BitFlag(0)
        },

        attributes: {
            /**
             * This attribute shall provide a list of the media inputs supported by the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.6.1
             */
            inputList: Attribute(0x0, TlvArray(TlvInputInfo), { default: [] }),

            /**
             * This attribute shall contain the value of the index field of the currently selected InputInfoStruct.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.6.2
             */
            currentInput: Attribute(0x1, TlvUInt8)
        },

        commands: {
            /**
             * Upon receipt, this command shall change the media input on the device to the input at a specific index in
             * the Input List.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1
             */
            selectInput: Command(0x0, TlvSelectInputRequest, 0x0, TlvNoResponse),

            /**
             * Upon receipt, this command shall display the active status of the input list on screen.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.2
             */
            showInputStatus: Command(0x1, TlvNoArguments, 0x1, TlvNoResponse),

            /**
             * Upon receipt, this command shall hide the input list from the screen.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.3
             */
            hideInputStatus: Command(0x2, TlvNoArguments, 0x2, TlvNoResponse)
        },

        /**
         * This metadata controls which MediaInputCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { nameUpdates: true }, component: NameUpdatesComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for controlling the Input Selector on a media device such as a Video Player.
     *
     * This cluster would be implemented on TV and other media streaming devices, as well as devices that provide input
     * to or output from such devices.
     *
     * This cluster provides the list of available inputs and provides commands for selecting and renaming them.
     *
     * The cluster server for Media Input is implemented by a device that has selectable input, such as a Video Player
     * device.
     *
     * MediaInputCluster supports optional features that you can enable with the MediaInputCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9
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
            renameInput: MutableCluster.AsConditional(NameUpdatesComponent.commands.renameInput, { mandatoryIf: [NU] })
        }
    });

    /**
     * This cluster supports all MediaInput features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type MediaInputCluster = MediaInput.Cluster;
export const MediaInputCluster = MediaInput.Cluster;
ClusterRegistry.register(MediaInput.Complete);
