/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    WritableAttribute,
    FixedAttribute,
    Attribute,
    OptionalWritableAttribute,
    Command
} from "../cluster/Cluster.js";
import { TlvUInt8, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvVendorId } from "../datatype/VendorId.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";

export namespace ModeBase {
    /**
     * These are optional features supported by ModeBaseCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.4
     */
    export enum Feature {
        /**
         * OnOff (DEPONOFF)
         *
         * This feature creates a dependency between an OnOff cluster instance and this cluster instance on the same
         * endpoint. See OnMode for more information.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.4.1
         */
        OnOff = "OnOff"
    }

    export enum ModeTag {
        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Auto = 0,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Quick = 1,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Quiet = 2,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        LowNoise = 3,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        LowEnergy = 4,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Vacation = 5,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Min = 6,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Max = 7,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Night = 8,

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.8
         */
        Day = 9
    }

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1
     */
    export const TlvModeTagStruct = TlvObject({
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
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1.1
         */
        mfgCode: TlvOptionalField(0, TlvVendorId),

        /**
         * This field shall indicate the mode tag within a mode tag namespace which is either manufacturer specific or
         * standard.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1.2
         */
        value: TlvField(1, TlvEnum<ModeTag>())
    });

    /**
     * A Mode Tag is meant to be interpreted by the client for the purpose the cluster serves.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.1
     */
    export interface ModeTagStruct extends TypeFromSchema<typeof TlvModeTagStruct> {}

    /**
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.2
     */
    export const TlvModeOption = TlvObject({
        /**
         * This field shall indicate readable text that describes the mode option, so that a client can provide it to
         * the user to indicate what this option means. This field is meant to be readable and understandable by the
         * user.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.2.1
         */
        label: TlvField(0, TlvString.bound({ maxLength: 64 })),

        /**
         * This field is used to identify the mode option.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.2.2
         */
        mode: TlvField(1, TlvUInt8),

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
         *   • A mode named "100%" can have both the High (manufacturer specific) and Max (standard) mode tag. Clients
         *     seeking the mode for either High or Max will find the same mode in this case.
         *
         *   • A mode that includes a LowEnergy tag can be displayed by the client using a widget icon that shows a
         *     green leaf.
         *
         *   • A mode that includes a LowNoise tag may be used by the client when the user wishes for a lower level of
         *     audible sound, less likely to disturb the household’s activities.
         *
         *   • A mode that includes a LowEnergy tag (standard, defined in this cluster specification) and also a
         *     Delicate tag (standard, defined in the namespace of a Laundry Mode derived cluster).
         *
         *   • A mode that includes both a generic Quick tag (defined here), and Vacuum and Mop tags, (defined in the
         *     RVC Clean cluster that is a derivation of this cluster).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.2.3
         */
        modeTags: TlvField(2, TlvArray(TlvModeTagStruct, { maxLength: 8 }))
    });

    /**
     * This is a struct representing a possible mode of the server.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.5.2
     */
    export interface ModeOption extends TypeFromSchema<typeof TlvModeOption> {}

    /**
     * Input to the ModeBase changeToMode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.1
     */
    export const TlvChangeToModeRequest = TlvObject({
        /**
         * If the NewMode field doesn’t match the Mode field of any entry of the SupportedModes list, the
         * ChangeToModeResponse command’s Status field shall indicate UnsupportedMode and the StatusText field shall be
         * included and may be used to indicate the issue, with a human readable string, or include an empty string.
         *
         * If the NewMode field matches the Mode field of one entry of the SupportedModes list, but the device is not
         * able to transition as requested, the ChangeToModeResponse command shall:
         *
         *   • Have the Status set to a product-specific Status value representing the error, or GenericFailure if a
         *     more specific error cannot be provided. See Status field for details.
         *
         *   • Provide a human readable string in the StatusText field.
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
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.1.1
         */
        newMode: TlvField(0, TlvUInt8)
    });

    /**
     * Input to the ModeBase changeToMode command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.1
     */
    export interface ChangeToModeRequest extends TypeFromSchema<typeof TlvChangeToModeRequest> {}

    export enum ModeChangeStatus {
        /**
         * Switching to the mode indicated by the NewMode field is allowed and possible. The CurrentMode attribute is
         * set to the value of the NewMode field.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2.1.2
         */
        Success = 0,

        /**
         * The value of the NewMode field doesn’t match any entries in the SupportedModes attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2.1.2
         */
        UnsupportedMode = 1,

        /**
         * Generic failure code, indicating that switching to the mode indicated by the NewMode field is not allowed or
         * not possible.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2.1.2
         */
        GenericFailure = 2,

        /**
         * The received request cannot be handled due to the current mode of the device
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2.1.2
         */
        InvalidInMode = 3
    }

    /**
     * This command is sent by the device on receipt of the ChangeToMode command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2
     */
    export const TlvChangeToModeResponse = TlvObject({
        /**
         * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2.1
         */
        status: TlvField(0, TlvEnum<ModeChangeStatus>()),

        statusText: TlvField(1, TlvString.bound({ maxLength: 64 }))
    });

    /**
     * This command is sent by the device on receipt of the ChangeToMode command.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.2
     */
    export interface ChangeToModeResponse extends TypeFromSchema<typeof TlvChangeToModeResponse> {}

    /**
     * A ModeBaseCluster supports these elements if it supports feature OnOff.
     */
    export const OnOffComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates whether the value of CurrentMode depends on the state of the On/Off cluster on the same
             * endpoint. If this attribute is not present or is set to null, there is no dependency, otherwise the
             * CurrentMode attribute shall depend on the OnOff attribute in the On/Off cluster
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.6.4
             */
            onMode: WritableAttribute(0x3, TlvNullable(TlvUInt8), { persistent: true })
        }
    });

    /**
     * ModeBase is a derived cluster, not to be used directly. These elements are present in all clusters derived from
     * ModeBase.
     */
    export const Base = MutableCluster.Component({
        features: {
            /**
             * This feature creates a dependency between an OnOff cluster instance and this cluster instance on the same
             * endpoint. See OnMode for more information.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.4.1
             */
            onOff: BitFlag(0)
        },

        name: "ModeBase",
        revision: 2,

        attributes: {
            /**
             * This attribute shall contain the list of supported modes that may be selected for the CurrentMode
             * attribute. Each item in this list represents a unique mode as indicated by the Mode field of the
             * ModeOptionStruct.
             *
             * Each entry in this list shall have a unique value for the Mode field. Each entry in this list shall have
             * a unique value for the Label field.
             *
             * The set of ModeTags listed in each entry in this list shall be distinct from the sets of ModeTags listed
             * in the other entries. This comparison shall NOT depend on the order of the ModeTags in the lists. Two
             * sets shall be considered distinct if one of them contains an element that the other one does not. Note
             * that the two sets could have a non-empty intersection, or one could be a subset of the other, and still
             * be distinct.
             *
             * Simplified examples of allowed ModeTags lists:
             *
             * Simplified examples of disallowed ModeTags lists:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.6.1
             */
            supportedModes: FixedAttribute(0x0, TlvArray(TlvModeOption, { minLength: 2, maxLength: 255 })),

            /**
             * Indicates the current mode of the server.
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * The value of this attribute may change at any time via an out-of-band interaction outside of the server,
             * such as interactions with a user interface, via internal mode changes due to autonomously progressing
             * through a sequence of operations, on system time-outs or idle delays, or via interactions coming from a
             * fabric other than the one which last executed a ChangeToMode.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.6.2
             */
            currentMode: Attribute(0x1, TlvUInt8, { persistent: true }),

            /**
             * Indicates the desired startup mode for the server when it is supplied with power.
             *
             * If this attribute is not null, the CurrentMode attribute shall be set to the StartUpMode value, when the
             * server is powered up, except in the case when the OnMode attribute overrides the StartUpMode attribute
             * (see Section 1.10.6.4.1, “OnMode with Power Up”).
             *
             * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentMode
             * attribute shall return to its value prior to the restart.
             *
             * The value of this field shall match the Mode field of one of the entries in the SupportedModes attribute.
             *
             * If this attribute is not implemented, or is set to the null value, it shall have no effect.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.6.3
             */
            startUpMode: OptionalWritableAttribute(0x2, TlvNullable(TlvUInt8), { persistent: true })
        },

        commands: {
            /**
             * This command is used to change device modes.
             *
             * On receipt of this command the device shall respond with a ChangeToModeResponse command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.10.7.1
             */
            changeToMode: Command(0x0, TlvChangeToModeRequest, 0x1, TlvChangeToModeResponse)
        },

        /**
         * This metadata controls which ModeBaseCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { onOff: true }, component: OnOffComponent })
    });

    const DEPONOFF = { onOff: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster.Component({
        name: Base.name,
        revision: Base.revision,
        features: Base.features,
        attributes: {
            ...Base.attributes,
            onMode: MutableCluster.AsConditional(OnOffComponent.attributes.onMode, { mandatoryIf: [DEPONOFF] })
        },
        commands: Base.commands
    });

    /**
     * This cluster supports all ModeBase features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}
