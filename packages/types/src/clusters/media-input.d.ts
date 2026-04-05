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
 * Definitions for the MediaInput cluster.
 *
 * This cluster provides an interface for controlling the Input Selector on a media device such as a Video Player.
 *
 * This cluster would be implemented on TV and other media streaming devices, as well as devices that provide input to
 * or output from such devices.
 *
 * This cluster provides the list of available inputs and provides commands for selecting and renaming them.
 *
 * The cluster server for Media Input is implemented by a device that has selectable input, such as a Video Player
 * device.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 6.9
 */
export declare namespace MediaInput {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0507;

    /**
     * Textual cluster identifier.
     */
    export const name: "MediaInput";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the MediaInput cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link MediaInput} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall provide a list of the media inputs supported by the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.6.1
         */
        inputList: InputInfo[];

        /**
         * This attribute shall contain the value of the index field of the currently selected InputInfoStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.6.2
         */
        currentInput: number;
    }

    /**
     * Attributes that may appear in {@link MediaInput}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall provide a list of the media inputs supported by the device.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.6.1
         */
        inputList: InputInfo[];

        /**
         * This attribute shall contain the value of the index field of the currently selected InputInfoStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.6.2
         */
        currentInput: number;
    }

    /**
     * {@link MediaInput} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this command shall change the media input on the device to the input at a specific index in the
         * Input List.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.1
         */
        selectInput(request: SelectInputRequest): MaybePromise;

        /**
         * Upon receipt, this command shall display the active status of the input list on screen.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.2
         */
        showInputStatus(): MaybePromise;

        /**
         * Upon receipt, this command shall hide the input list from the screen.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.3
         */
        hideInputStatus(): MaybePromise;
    }

    /**
     * {@link MediaInput} supports these elements if it supports feature "NameUpdates".
     */
    export interface NameUpdatesCommands {
        /**
         * Upon receipt, this command shall rename the input at a specific index in the Input List.
         *
         * Updates to the input name shall appear in the device’s settings menus.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.4
         */
        renameInput(request: RenameInputRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link MediaInput}.
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
     * These are optional features supported by MediaInputCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.9.4
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
     * This contains information about an input.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.9.5.2
     */
    export declare class InputInfo {
        constructor(values?: Partial<InputInfo>);

        /**
         * This field shall indicate the unique index into the list of Inputs.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.5.2.1
         */
        index: number;

        /**
         * This field shall indicate the type of input
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.5.2.2
         */
        inputType: InputType;

        /**
         * This field shall indicate the input name, such as “HDMI 1”. This field may be blank, but SHOULD be provided
         * when known.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.5.2.3
         */
        name: string;

        /**
         * This field shall indicate the user editable input description, such as “Living room Playstation”. This field
         * may be blank, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.5.2.4
         */
        description: string;
    };

    /**
     * Upon receipt, this command shall change the media input on the device to the input at a specific index in the
     * Input List.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.1
     */
    export declare class SelectInputRequest {
        constructor(values?: Partial<SelectInputRequest>);

        /**
         * This field shall indicate the index field of the InputInfoStruct from the InputList attribute in which to
         * change to.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.1.1
         */
        index: number;
    };

    /**
     * Upon receipt, this command shall rename the input at a specific index in the Input List.
     *
     * Updates to the input name shall appear in the device’s settings menus.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 6.9.7.4
     */
    export declare class RenameInputRequest {
        constructor(values?: Partial<RenameInputRequest>);
        index: number;
        name: string;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 6.9.5.1
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
     * @deprecated Use {@link MediaInput}.
     */
    export const Cluster: typeof MediaInput;

    /**
     * @deprecated Use {@link MediaInput}.
     */
    export const Complete: typeof MediaInput;

    export const Typing: MediaInput;
}

/**
 * @deprecated Use {@link MediaInput}.
 */
export declare const MediaInputCluster: typeof MediaInput;

export interface MediaInput extends ClusterTyping {
    Attributes: MediaInput.Attributes;
    Commands: MediaInput.Commands;
    Features: MediaInput.Features;
    Components: MediaInput.Components;
}
