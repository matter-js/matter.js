/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";
import type { VendorId } from "../datatype/VendorId.js";

/**
 * Definitions for the ModeBase cluster.
 *
 * This cluster provides an interface for controlling a characteristic of a device that can be set to one of several
 * predefined values. For example, the light pattern of a disco ball, the mode of a massage chair, or the wash cycle of
 * a laundry machine.
 *
 * The server allows the client to set a mode on the server. A mode is one of a list of options that may be presented by
 * a client for a user choice, or understood by the client, via the mode’s tags.
 *
 * A mode tag is either a standard tag within a standard category namespace, or a manufacturer specific tag, within the
 * namespace of the vendor ID of the manufacturer.
 *
 * Any derived cluster specification based on this cluster shall support the standard mode tag value definitions and
 * command status definitions defined in this cluster and may define additional standard mode tag values and standard
 * command status values that are supported in the respective derived cluster instances.
 *
 * Each cluster ID that indicates this specification shall define a distinct purpose for the cluster instance. For
 * example: A LightBlinking cluster ID supports blinking modes for a light (and is described that way).
 *
 * An anonymous mode shall NOT replace the meaning of a standard mode tag, when one exists, for the cluster purpose.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.10
 */
export declare namespace ModeBase {
    /**
     * Textual cluster identifier.
     */
    export const name: "ModeBase";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the ModeBase cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ModeBase} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall contain the list of supported modes that may be selected for the CurrentMode attribute.
         * Each item in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct.
         *
         * Each entry in this list shall have a unique value for the Mode field.
         *
         * Each entry in this list shall have a unique value for the Label field.
         *
         * The set of ModeTags listed in each entry in this list shall be distinct from the sets of ModeTags listed in
         * the other entries. This comparison shall NOT depend on the order of the ModeTags in the lists. Two sets shall
         * be considered distinct if one of them contains an element that the other one does not. Note that the two sets
         * could have a non-empty intersection, or one could be a subset of the other, and still be distinct.
         *
         * Simplified examples of allowed ModeTags lists:
         *
         * Simplified examples of disallowed ModeTags lists:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.1
         */
        supportedModes: ModeOption[];

        /**
         * Indicates the current mode of the server.
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * The value of this attribute may change at any time via an out-of-band interaction outside of the server, such
         * as interactions with a user interface, via internal mode changes due to autonomously progressing through a
         * sequence of operations, on system time-outs or idle delays, or via interactions coming from a fabric other
         * than the one which last executed a ChangeToMode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.2
         */
        currentMode: number;

        /**
         * Indicates the desired startup mode for the server when it is supplied with power.
         *
         * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
         * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute (see
         * Section 1.10.6.4.1, “OnMode with Power Up”).
         *
         * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode attribute
         * shall return to its value prior to the restart.
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * If this attribute is not implemented, or is set to the null value, it shall have no effect.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.3
         */
        startUpMode?: number | null;
    }

    /**
     * {@link ModeBase} supports these elements if it supports feature "OnOff".
     */
    export interface OnOffAttributes {
        /**
         * Indicates whether the value of CurrentMode depends on the state of the On/Off cluster on the same endpoint.
         * If this attribute is not present or is set to null, there is no dependency, otherwise the CurrentMode
         * attribute shall depend on the OnOff attribute in the On/Off cluster
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.4
         */
        onMode: number | null;
    }

    /**
     * Attributes that may appear in {@link ModeBase}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall contain the list of supported modes that may be selected for the CurrentMode attribute.
         * Each item in this list represents a unique mode as indicated by the Mode field of the ModeOptionStruct.
         *
         * Each entry in this list shall have a unique value for the Mode field.
         *
         * Each entry in this list shall have a unique value for the Label field.
         *
         * The set of ModeTags listed in each entry in this list shall be distinct from the sets of ModeTags listed in
         * the other entries. This comparison shall NOT depend on the order of the ModeTags in the lists. Two sets shall
         * be considered distinct if one of them contains an element that the other one does not. Note that the two sets
         * could have a non-empty intersection, or one could be a subset of the other, and still be distinct.
         *
         * Simplified examples of allowed ModeTags lists:
         *
         * Simplified examples of disallowed ModeTags lists:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.1
         */
        supportedModes: ModeOption[];

        /**
         * Indicates the current mode of the server.
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * The value of this attribute may change at any time via an out-of-band interaction outside of the server, such
         * as interactions with a user interface, via internal mode changes due to autonomously progressing through a
         * sequence of operations, on system time-outs or idle delays, or via interactions coming from a fabric other
         * than the one which last executed a ChangeToMode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.2
         */
        currentMode: number;

        /**
         * Indicates the desired startup mode for the server when it is supplied with power.
         *
         * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
         * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute (see
         * Section 1.10.6.4.1, “OnMode with Power Up”).
         *
         * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode attribute
         * shall return to its value prior to the restart.
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * If this attribute is not implemented, or is set to the null value, it shall have no effect.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.3
         */
        startUpMode: number | null;

        /**
         * Indicates whether the value of CurrentMode depends on the state of the On/Off cluster on the same endpoint.
         * If this attribute is not present or is set to null, there is no dependency, otherwise the CurrentMode
         * attribute shall depend on the OnOff attribute in the On/Off cluster
         *
         * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.6.4
         */
        onMode: number | null;
    }

    /**
     * {@link ModeBase} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to change device modes.
         *
         * On receipt of this command the device shall respond with a ChangeToModeResponse command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.1
         */
        changeToMode(request: ChangeToModeRequest): MaybePromise<ChangeToModeResponse>;
    }

    /**
     * Commands that may appear in {@link ModeBase}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { onOff: true }, attributes: OnOffAttributes }
    ];
    export type Features = "OnOff";

    /**
     * These are optional features supported by ModeBaseCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.4
     */
    export enum Feature {
        /**
         * OnOff (DEPONOFF)
         *
         * This feature creates a dependency between an OnOff cluster instance and this cluster instance on the same
         * endpoint. See OnMode for more information.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.4.1
         */
        OnOff = "OnOff"
    }

    /**
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2
     */
    export interface ModeOption {
        /**
         * This field shall indicate readable text that describes the mode option, so that a client can provide it to
         * the user to indicate what this option means. This field is meant to be readable and understandable by the
         * user.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.1
         */
        label: string;

        /**
         * This field is used to identify the mode option.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.2
         */
        mode: number;

        /**
         * This field shall contain a list of tags that are associated with the mode option. This may be used by clients
         * to determine the full or the partial semantics of a certain mode, depending on which tags they understand,
         * using standard definitions and/or manufacturer specific namespace definitions.
         *
         * The standard mode tags are defined in this cluster specification. For the derived cluster instances, if the
         * specification of the derived cluster defines a namespace, the set of standard mode tags also includes the
         * mode tag values from that namespace.
         *
         * Mode tags can help clients look for options that meet certain criteria, render the user interface, use the
         * mode in an automation, or to craft help text their voice-driven interfaces. A mode tag shall be either a
         * standard tag or a manufacturer specific tag, as defined in each ModeTagStruct list entry.
         *
         * A mode option may have more than one mode tag. A mode option may be associated with a mixture of standard and
         * manufacturer specific mode tags. A mode option shall be associated with at least one standard mode tag.
         *
         * Each mode tag in this field shall be distinct from other mode tags in this field. For example, a simplified
         * list containing [Auto, Auto] would not be allowed.
         *
         * A few examples are provided below.
         *
         *   - A mode named "100%" can have both the High (manufacturer specific) and Max (standard) mode tag. Clients
         *     seeking the mode for either High or Max will find the same mode in this case.
         *
         *   - A mode that includes a LowEnergy tag can be displayed by the client using a widget icon that shows a
         *     green leaf.
         *
         *   - A mode that includes a LowNoise tag may be used by the client when the user wishes for a lower level of
         *     audible sound, less likely to disturb the household’s activities.
         *
         *   - A mode that includes a LowEnergy tag (standard, defined in this cluster specification) and also a
         *     Delicate tag (standard, defined in the namespace of a Laundry Mode derived cluster).
         *
         *   - A mode that includes both a generic Quick tag (defined here), and Vacuum and Mop tags, (defined in the
         *     RVC Clean cluster that is a derivation of this cluster).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.2.3
         */
        modeTags: ModeTagStruct[];
    }

    /**
     * This command is used to change device modes.
     *
     * On receipt of this command the device shall respond with a ChangeToModeResponse command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.1
     */
    export interface ChangeToModeRequest {
        /**
         * If the NewMode field doesn’t match the Mode field of any entry of the SupportedModes list, the
         * ChangeToModeResponse command’s Status field shall indicate UnsupportedMode and the StatusText field shall be
         * included and may be used to indicate the issue, with a human readable string, or include an empty string.
         *
         * If the NewMode field matches the Mode field of one entry of the SupportedModes list, but the device is not
         * able to transition as requested, the ChangeToModeResponse command shall:
         *
         *   - Have the Status set to a product-specific Status value representing the error, or GenericFailure if a
         *     more specific error cannot be provided. See Status field for details.
         *
         *   - Provide a human readable string in the StatusText field.
         *
         * If the NewMode field matches the Mode field of one entry of the SupportedModes list and the device is able to
         * transition as requested, the server shall transition into the mode associated with NewMode, the
         * ChangeToModeResponse command shall have the Status field set to Success, the StatusText field may be supplied
         * with a human readable string or include an empty string and the CurrentMode field shall be set to the value
         * of the NewMode field.
         *
         * If the NewMode field is the same as the value of the CurrentMode attribute the ChangeToModeResponse command
         * shall have the Status field set to Success and the StatusText field may be supplied with a human readable
         * string or include an empty string.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.1.1
         */
        newMode: number;
    }

    /**
     * This command is sent by the device on receipt of the ChangeToMode command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2
     */
    export interface ChangeToModeResponse {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2.1
         */
        status: ModeChangeStatus;

        statusText: string;
    }

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1
     */
    export interface ModeTagStruct {
        /**
         * If the MfgCode field exists, the Value field shall be in the manufacturer-specific value range (see Section
         * 1.10.8, “Mode Namespace”).
         *
         * This field shall indicate the manufacturer’s VendorID and it shall determine the meaning of the Value field.
         *
         * The same manufacturer code and mode tag value in separate cluster instances are part of the same namespace
         * and have the same meaning. For example: a manufacturer tag meaning "pinch" can be used both in a cluster
         * whose purpose is to choose the amount of sugar, or in a cluster whose purpose is to choose the amount of
         * salt.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1.1
         */
        mfgCode?: VendorId;

        /**
         * This field shall indicate the mode tag within a mode tag namespace which is either manufacturer specific or
         * standard.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.5.1.2
         */
        value: ModeTag;
    }

    export enum ModeChangeStatus {
        /**
         * Switching to the mode indicated by the NewMode field is allowed and possible. The CurrentMode attribute is
         * set to the value of the NewMode field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2.1.2
         */
        Success = 0,

        /**
         * The value of the NewMode field doesn’t match any entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2.1.2
         */
        UnsupportedMode = 1,

        /**
         * Generic failure code, indicating that switching to the mode indicated by the NewMode field is not allowed or
         * not possible.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2.1.2
         */
        GenericFailure = 2,

        /**
         * The received request cannot be handled due to the current mode of the device
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.7.2.1.2
         */
        InvalidInMode = 3
    }

    export enum ModeTag {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.10.8
         */
        Day = 9
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
     * @deprecated Use {@link ModeBase}.
     */
    export const Complete: typeof ModeBase;

    export const Typing: ModeBase;
}

export interface ModeBase extends ClusterTyping {
    Attributes: ModeBase.Attributes;
    Commands: ModeBase.Commands;
    Features: ModeBase.Features;
    Components: ModeBase.Components;
}
