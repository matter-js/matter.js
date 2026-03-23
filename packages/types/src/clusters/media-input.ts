/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { MediaInput as MediaInputModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the MediaInput cluster.
 */
export namespace MediaInput {
    /**
     * {@link MediaInput} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall provide a list of the media inputs supported by the device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.6.1
             */
            readonly inputList: InputInfo[];

            /**
             * This attribute shall contain the value of the index field of the currently selected InputInfoStruct.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.6.2
             */
            readonly currentInput: number;
        }

        export interface Commands {
            /**
             * Upon receipt, this command shall change the media input on the device to the input at a specific index in
             * the Input List.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1
             */
            selectInput(request: SelectInputRequest): MaybePromise;

            /**
             * Upon receipt, this command shall display the active status of the input list on screen.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.2
             */
            showInputStatus(): MaybePromise;

            /**
             * Upon receipt, this command shall hide the input list from the screen.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.3
             */
            hideInputStatus(): MaybePromise;
        }
    }

    /**
     * {@link MediaInput} supports these elements if it supports feature "NameUpdates".
     */
    export namespace NameUpdatesComponent {
        export interface Commands {
            /**
             * Upon receipt, this command shall rename the input at a specific index in the Input List.
             *
             * Updates to the input name shall appear in the device’s settings menus.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.4
             */
            renameInput(request: RenameInputRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link MediaInput}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall provide a list of the media inputs supported by the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.6.1
         */
        readonly inputList: InputInfo[];

        /**
         * This attribute shall contain the value of the index field of the currently selected InputInfoStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.6.2
         */
        readonly currentInput: number;
    }

    export interface Commands extends Base.Commands, NameUpdatesComponent.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { nameUpdates: true }, commands: NameUpdatesComponent.Commands }
    ];
    export type Features = "NameUpdates";

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
     * This contains information about an input.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2
     */
    export interface InputInfo {
        /**
         * This field shall indicate the unique index into the list of Inputs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.1
         */
        index: number;

        /**
         * This field shall indicate the type of input
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.2
         */
        inputType: InputType;

        /**
         * This field shall indicate the input name, such as “HDMI 1”. This field may be blank, but SHOULD be provided
         * when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.3
         */
        name: string;

        /**
         * This field shall indicate the user editable input description, such as “Living room Playstation”. This field
         * may be blank, but SHOULD be provided when known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.5.2.4
         */
        description: string;
    }

    /**
     * Upon receipt, this command shall change the media input on the device to the input at a specific index in the
     * Input List.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1
     */
    export interface SelectInputRequest {
        /**
         * This field shall indicate the index field of the InputInfoStruct from the InputList attribute in which to
         * change to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.1.1
         */
        index: number;
    }

    /**
     * Upon receipt, this command shall rename the input at a specific index in the Input List.
     *
     * Updates to the input name shall appear in the device’s settings menus.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.9.7.4
     */
    export interface RenameInputRequest {
        index: number;
        name: string;
    }

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

    export const id = ClusterId(0x507);
    export const name = "MediaInput" as const;
    export const revision = 1;
    export const schema = MediaInputModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof MediaInput;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `MediaInput` instead of `MediaInput.Complete`)
     */
    export type Complete = typeof MediaInput;

    export declare const Complete: Complete;
    export declare const Typing: MediaInput;
}

ClusterNamespace.define(MediaInput);
export type MediaInputCluster = MediaInput.Cluster;
export const MediaInputCluster = MediaInput.Cluster;
export interface MediaInput extends ClusterTyping { Attributes: MediaInput.Attributes; Commands: MediaInput.Commands; Features: MediaInput.Features; Components: MediaInput.Components }
