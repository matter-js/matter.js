/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, FixedAttribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvInt16, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString } from "../tlv/TlvString.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace TemperatureControl {
    /**
     * These are optional features supported by TemperatureControlCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.2.4
     */
    export enum Feature {
        /**
         * TemperatureNumber (TN)
         *
         * For devices that use an actual temperature value for the temperature setpoint, such as some water heaters,
         * the feature TN shall be used. Note that this cluster provides and supports temperatures in degrees Celsius
         * via the temperature data type.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.2.4.1
         */
        TemperatureNumber = "TemperatureNumber",

        /**
         * TemperatureLevel (TL)
         *
         * For devices that use vendor-specific temperature levels for the temperature setpoint, such as some washers,
         * the feature TL shall be used.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.2.4.2
         */
        TemperatureLevel = "TemperatureLevel",

        /**
         * TemperatureStep (STEP)
         *
         * For devices that support discrete temperature setpoints that are larger than the temperature resolution
         * imposed via the temperature data type, the Step feature may be used.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.2.4.3
         */
        TemperatureStep = "TemperatureStep"
    }

    /**
     * Input to the TemperatureControl setTemperature command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.2.6.1
     */
    export const TlvSetTemperatureRequest = TlvObject({
        /**
         * This field shall specify the desired temperature setpoint that the server is to be set to.
         *
         * The TargetTemperature shall be from MinTemperature to MaxTemperature inclusive. If the Step attribute is
         * supported, TargetTemperature shall be such that (TargetTemperature - MinTemperature) % Step == 0.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.2.6.1.1
         */
        targetTemperature: TlvOptionalField(0, TlvInt16),

        /**
         * This field shall specify the index of the list item in the SupportedTemperatureLevels list that represents
         * the desired temperature level setting of the server. The value of this field shall be between 0 and the
         * length of the SupportedTemperatureLevels list -1.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 8.2.6.1.2
         */
        targetTemperatureLevel: TlvOptionalField(1, TlvUInt8)
    });

    /**
     * Input to the TemperatureControl setTemperature command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.2.6.1
     */
    export interface SetTemperatureRequest extends TypeFromSchema<typeof TlvSetTemperatureRequest> {}

    /**
     * A TemperatureControlCluster supports these elements if it supports feature TemperatureNumber.
     */
    export const TemperatureNumberComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the desired Temperature Setpoint on the device.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.5.1
             */
            temperatureSetpoint: Attribute(0x0, TlvInt16),

            /**
             * Indicates the minimum temperature to which the TemperatureSetpoint attribute may be set.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.5.2
             */
            minTemperature: FixedAttribute(0x1, TlvInt16),

            /**
             * Indicates the maximum temperature to which the TemperatureSetpoint attribute may be set.
             *
             * If the Step attribute is supported, this attribute shall be such that MaxTemperature = MinTemperature +
             * (Step * n), where n is an integer and n > 0. If the Step attribute is not supported, this attribute shall
             * be such that MaxTemperature > MinTemperature.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.5.3
             */
            maxTemperature: FixedAttribute(0x2, TlvInt16)
        }
    });

    /**
     * A TemperatureControlCluster supports these elements if it supports feature TemperatureStep.
     */
    export const TemperatureStepComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the discrete value by which the TemperatureSetpoint attribute can be changed via the
             * SetTemperature command.
             *
             * For example, if the value of MinTemperature is 25.00C (2500) and the Step value is 0.50C (50), valid
             * values of the TargetTemperature field of the SetTemperature command would be 25.50C
             *
             * (2550), 26.00C (2600), 26.50C (2650), etc.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.5.4
             */
            step: FixedAttribute(0x3, TlvInt16.bound({ min: 1 }))
        }
    });

    /**
     * A TemperatureControlCluster supports these elements if it supports feature TemperatureLevel.
     */
    export const TemperatureLevelComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the currently selected temperature level setting of the server. This attribute shall be the
             * positional index of the list item in the SupportedTemperatureLevels list that represents the currently
             * selected temperature level setting of the server.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.5.5
             */
            selectedTemperatureLevel: Attribute(0x4, TlvUInt8.bound({ max: 31 })),

            /**
             * Indicates the list of supported temperature level settings that may be selected via the
             * TargetTemperatureLevel field in the SetTemperature command. Each string is readable text that describes
             * each temperature level setting in a way that can be easily understood by humans. For example, a washing
             * machine can have temperature levels like "Cold", "Warm", and "Hot". Each string is specified by the
             * manufacturer.
             *
             * Each item in this list shall represent a unique temperature level. Each entry in this list shall have a
             * unique value. The entries in this list shall appear in order of increasing temperature level with list
             * item 0 being the setting with the lowest temperature level.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.5.6
             */
            supportedTemperatureLevels: Attribute(0x5, TlvArray(TlvString, { maxLength: 32 }), { default: [] })
        }
    });

    /**
     * These elements and properties are present in all TemperatureControl clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x56,
        name: "TemperatureControl",
        revision: 1,

        features: {
            /**
             * For devices that use an actual temperature value for the temperature setpoint, such as some water
             * heaters, the feature TN shall be used. Note that this cluster provides and supports temperatures in
             * degrees Celsius via the temperature data type.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.4.1
             */
            temperatureNumber: BitFlag(0),

            /**
             * For devices that use vendor-specific temperature levels for the temperature setpoint, such as some
             * washers, the feature TL shall be used.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.4.2
             */
            temperatureLevel: BitFlag(1),

            /**
             * For devices that support discrete temperature setpoints that are larger than the temperature resolution
             * imposed via the temperature data type, the Step feature may be used.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.4.3
             */
            temperatureStep: BitFlag(2)
        },

        commands: {
            /**
             * This command is used to set the temperature setpoint.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 8.2.6.1
             */
            setTemperature: Command(0x0, TlvSetTemperatureRequest, 0x0, TlvNoResponse)
        },

        /**
         * This metadata controls which TemperatureControlCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { temperatureNumber: true }, component: TemperatureNumberComponent },
            { flags: { temperatureStep: true }, component: TemperatureStepComponent },
            { flags: { temperatureLevel: true }, component: TemperatureLevelComponent },
            { flags: { temperatureStep: true, temperatureNumber: false }, component: false },
            { flags: { temperatureNumber: true, temperatureLevel: true }, component: false },
            { flags: { temperatureNumber: false, temperatureLevel: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides an interface to the setpoint temperature on devices such as washers, refrigerators, and
     * water heaters. The setpoint temperature is the temperature to which a device using this cluster would attempt to
     * control to. This cluster does not provide access to the actual or physical temperature associated with any device
     * using this cluster. Access to the physical temperature associated with a device using this cluster would be
     * provided by other clusters as part of that devices device type definition.
     *
     * The values and constraints of the attributes communicated to clients SHOULD match the controls on any physical
     * interface on a device implementing this server. For example, the value of the Step attribute SHOULD match the
     * incremental value by which the temperature setpoint can be changed on the physical device.
     *
     * Per the Matter specification you cannot use {@link TemperatureControlCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.2
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const TN = { temperatureNumber: true };
    const STEP = { temperatureStep: true };
    const TL = { temperatureLevel: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            temperatureSetpoint: MutableCluster.AsConditional(
                TemperatureNumberComponent.attributes.temperatureSetpoint,
                { mandatoryIf: [TN] }
            ),
            minTemperature: MutableCluster.AsConditional(
                TemperatureNumberComponent.attributes.minTemperature,
                { mandatoryIf: [TN] }
            ),
            maxTemperature: MutableCluster.AsConditional(
                TemperatureNumberComponent.attributes.maxTemperature,
                { mandatoryIf: [TN] }
            ),
            step: MutableCluster.AsConditional(TemperatureStepComponent.attributes.step, { mandatoryIf: [STEP] }),
            selectedTemperatureLevel: MutableCluster.AsConditional(
                TemperatureLevelComponent.attributes.selectedTemperatureLevel,
                { mandatoryIf: [TL] }
            ),
            supportedTemperatureLevels: MutableCluster.AsConditional(
                TemperatureLevelComponent.attributes.supportedTemperatureLevels,
                { mandatoryIf: [TL] }
            )
        },

        commands: Base.commands
    });

    /**
     * This cluster supports all TemperatureControl features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type TemperatureControlCluster = TemperatureControl.Cluster;
export const TemperatureControlCluster = TemperatureControl.Cluster;
ClusterRegistry.register(TemperatureControl.Complete);
