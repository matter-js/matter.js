/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    FixedAttribute,
    OptionalFixedAttribute,
    Command,
    TlvNoResponse,
    OptionalCommand
} from "../cluster/Cluster.js";
import { TlvUInt8, TlvUInt16, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvOptionalField, TlvObject, TlvField } from "../tlv/TlvObject.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace MicrowaveOvenControl {
    /**
     * These are optional features supported by MicrowaveOvenControlCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.13.4
     */
    export enum Feature {
        /**
         * PowerAsNumber (PWRNUM)
         *
         * Power is specified as a unitless number or a percentage
         */
        PowerAsNumber = "PowerAsNumber",

        /**
         * PowerInWatts (WATTS)
         *
         * Power is specified in Watts
         */
        PowerInWatts = "PowerInWatts",

        /**
         * PowerNumberLimits (PWRLMTS)
         *
         * Supports the limit attributes used with the PWRNUM feature
         */
        PowerNumberLimits = "PowerNumberLimits"
    }

    /**
     * Input to the MicrowaveOvenControl setCookingParameters command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2
     */
    export const TlvSetCookingParametersRequest = TlvObject({
        /**
         * This field shall indicate the value to which the CurrentMode attribute of the Microwave Oven Mode cluster
         * should be set. The value of this field shall be one from the list of SupportedModes from the Microwave Oven
         * Mode cluster.
         *
         * If this field is missing, the CurrentMode attribute shall be set to a mode having the Normal mode tag.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2.1
         */
        cookMode: TlvOptionalField(0, TlvUInt8),

        /**
         * This field shall indicate the CookTime associated with the operation of the device. The value of this field
         * shall be subject to the constraints of the CookTime attribute of this cluster.
         *
         * If this field is missing, the CookTime attribute shall be set to 30 seconds by the server.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2.2
         */
        cookTime: TlvOptionalField(1, TlvUInt32.bound({ min: 1 })),

        /**
         * This field shall indicate the PowerSetting associated with the operation of the device. The value of this
         * field shall be subject to the constraints of the PowerSetting attribute of this cluster. If the PowerSetting
         * field does not conform to the constraints of the PowerSetting attribute, the server shall return a
         * CONSTRAINT_ERROR status.
         *
         * If this field is missing, the PowerSetting attribute shall be set to 100 if MaxPower is not supported by the
         * server, otherwise it shall be set to MaxPower if the MaxPower attribute is supported by the server.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2.3
         */
        powerSetting: TlvOptionalField(2, TlvUInt8),

        /**
         * This field shall indicate the value to which the SelectedWattIndex attribute is set. If the value of this
         * field is greater than or equal to the length of the SupportedWatts attribute list, the server shall return a
         * CONSTRAINT_ERROR status and the value of the SelectedWattIndex attribute shall be unchanged.
         *
         * If this field is missing, the SelectedWattIndex attribute shall be set by the server to the index associated
         * with the highest Watt setting for the selected CookMode.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2.4
         */
        wattSettingIndex: TlvOptionalField(3, TlvUInt8),

        /**
         * This field shall indicate whether or not oven operation shall be started when the command is received.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2.5
         */
        startAfterSetting: TlvOptionalField(4, TlvBoolean)
    });

    /**
     * Input to the MicrowaveOvenControl setCookingParameters command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2
     */
    export interface SetCookingParametersRequest extends TypeFromSchema<typeof TlvSetCookingParametersRequest> {}

    /**
     * Input to the MicrowaveOvenControl addMoreTime command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.3
     */
    export const TlvAddMoreTimeRequest = TlvObject({
        /**
         * This field shall indicate the number of seconds to be added to the CookTime attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.3.1
         */
        timeToAdd: TlvField(0, TlvUInt32.bound({ min: 1 }))
    });

    /**
     * Input to the MicrowaveOvenControl addMoreTime command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.3
     */
    export interface AddMoreTimeRequest extends TypeFromSchema<typeof TlvAddMoreTimeRequest> {}

    /**
     * A MicrowaveOvenControlCluster supports these elements if it supports feature PowerAsNumber.
     */
    export const PowerAsNumberComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the power level associated with the operation of the device. If the MinPower, MaxPower, and
             * PowerStep attributes are not supported:
             *
             *   • The minimum value of this attribute shall be 10,
             *
             *   • The maximum value of this attribute shall be 100,
             *
             *   • The value shall be in even multiples of 10,
             *
             *   • The default value shall be 100.
             *
             * If the MinPower, MaxPower, and PowerStep attributes are supported:
             *
             *   • The value of this attribute shall be between MinPower and MaxPower inclusive.
             *
             *   • The value of this attribute shall be such that (PowerSetting - MinPower) % PowerStep == 0
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.3
             */
            powerSetting: Attribute(0x2, TlvUInt8)
        }
    });

    /**
     * A MicrowaveOvenControlCluster supports these elements if it supports feature PowerNumberLimits.
     */
    export const PowerNumberLimitsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the minimum value to which the PowerSetting attribute that can be set on the server.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.4
             */
            minPower: FixedAttribute(0x3, TlvUInt8.bound({ min: 1, max: 99 })),

            /**
             * Indicates the maximum value to which the PowerSetting attribute that can be set on the server.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.5
             */
            maxPower: FixedAttribute(0x4, TlvUInt8.bound({ max: 100 })),

            /**
             * Indicates the increment of power that can be set on the server. The value of this attribute shall be
             * between 1 and MaxPower inclusive.
             *
             * The value of this attribute shall be such that (MaxPower - MinPower) % PowerStep == 0
             *
             * For example, if MinPower is 1, MaxPower is 10, and PowerSetting can be set to any integer between
             * MinPower and MaxPower, PowerStep would be set to 1.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.6
             */
            powerStep: FixedAttribute(0x5, TlvUInt8)
        }
    });

    /**
     * A MicrowaveOvenControlCluster supports these elements if it supports feature PowerInWatts.
     */
    export const PowerInWattsComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the list of power levels (in W) supported by the server.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.7
             */
            supportedWatts: FixedAttribute(0x6, TlvArray(TlvUInt16, { minLength: 1, maxLength: 10 })),

            /**
             * Indicates the index into the list of SupportedWatts of the currently selected power setting.
             *
             * The index shall be a valid index into the SupportedWatts list.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.8
             */
            selectedWattIndex: Attribute(0x7, TlvUInt8)
        }
    });

    /**
     * These elements and properties are present in all MicrowaveOvenControl clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x5f,
        name: "MicrowaveOvenControl",
        revision: 1,

        features: {
            /**
             * Power is specified as a unitless number or a percentage
             */
            powerAsNumber: BitFlag(0),

            /**
             * Power is specified in Watts
             */
            powerInWatts: BitFlag(1),

            /**
             * Supports the limit attributes used with the PWRNUM feature
             */
            powerNumberLimits: BitFlag(2)
        },

        attributes: {
            /**
             * Indicates the total cook time associated with the operation of the device.
             *
             * This attribute shall remain unchanged during the operation of the oven unless the value is changed via a
             * command or out-of-band action.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.1
             */
            cookTime: Attribute(0x0, TlvUInt32.bound({ min: 1 })),

            /**
             * Indicates the maximum value to which the CookTime attribute can be set.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.2
             */
            maxCookTime: FixedAttribute(0x1, TlvUInt32.bound({ min: 1, max: 86400 })),

            /**
             * Indicates the rating, in Watts, of the microwave power of the oven.
             *
             * Supporting this attribute can assist clients in suggesting cooking settings for various foods and
             * beverages.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.5.9
             */
            wattRating: OptionalFixedAttribute(0x8, TlvUInt16)
        },

        commands: {
            /**
             * This command is used to set the cooking parameters associated with the operation of the device. This
             * command supports the following fields:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.2
             */
            setCookingParameters: Command(0x0, TlvSetCookingParametersRequest, 0x0, TlvNoResponse),

            /**
             * This command is used to add more time to the CookTime attribute of the server. This command supports
             * these fields:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.13.6.3
             */
            addMoreTime: OptionalCommand(0x1, TlvAddMoreTimeRequest, 0x1, TlvNoResponse)
        },

        /**
         * This metadata controls which MicrowaveOvenControlCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { powerAsNumber: true }, component: PowerAsNumberComponent },
            { flags: { powerNumberLimits: true }, component: PowerNumberLimitsComponent },
            { flags: { powerInWatts: true }, component: PowerInWattsComponent },
            { flags: { powerNumberLimits: true, powerAsNumber: false }, component: false },
            { flags: { powerAsNumber: true, powerInWatts: true }, component: false },
            { flags: { powerAsNumber: false, powerInWatts: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster defines the requirements for the Microwave Oven Control cluster.
     *
     * This cluster has dependencies with the Operational State and Microwave Oven Mode clusters. The Operational State
     * cluster and the Microwave Oven Mode clusters, or derivatives of those clusters shall appear on the same endpoint
     * as this cluster.
     *
     * Per the Matter specification you cannot use {@link MicrowaveOvenControlCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.13
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const PWRNUM = { powerAsNumber: true };
    const PWRLMTS = { powerNumberLimits: true };
    const WATTS = { powerInWatts: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            powerSetting: MutableCluster.AsConditional(
                PowerAsNumberComponent.attributes.powerSetting,
                { mandatoryIf: [PWRNUM] }
            ),
            minPower: MutableCluster.AsConditional(
                PowerNumberLimitsComponent.attributes.minPower,
                { mandatoryIf: [PWRLMTS] }
            ),
            maxPower: MutableCluster.AsConditional(
                PowerNumberLimitsComponent.attributes.maxPower,
                { mandatoryIf: [PWRLMTS] }
            ),
            powerStep: MutableCluster.AsConditional(
                PowerNumberLimitsComponent.attributes.powerStep,
                { mandatoryIf: [PWRLMTS] }
            ),
            supportedWatts: MutableCluster.AsConditional(
                PowerInWattsComponent.attributes.supportedWatts,
                { mandatoryIf: [WATTS] }
            ),
            selectedWattIndex: MutableCluster.AsConditional(
                PowerInWattsComponent.attributes.selectedWattIndex,
                { mandatoryIf: [WATTS] }
            )
        },

        commands: Base.commands
    });

    /**
     * This cluster supports all MicrowaveOvenControl features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type MicrowaveOvenControlCluster = MicrowaveOvenControl.Cluster;
export const MicrowaveOvenControlCluster = MicrowaveOvenControl.Cluster;
ClusterRegistry.register(MicrowaveOvenControl.Complete);
