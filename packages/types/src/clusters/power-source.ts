/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    OptionalAttribute,
    FixedAttribute,
    OptionalFixedAttribute,
    OptionalEvent,
    Attribute
} from "../cluster/Cluster.js";
import { TlvUInt32, TlvUInt16, TlvEnum, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvString } from "../tlv/TlvString.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace PowerSource {
    /**
     * These are optional features supported by PowerSourceCluster.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.4
     */
    export enum Feature {
        /**
         * Wired (WIRED)
         *
         * A wired power source
         */
        Wired = "Wired",

        /**
         * Battery (BAT)
         *
         * A battery power source
         */
        Battery = "Battery",

        /**
         * Rechargeable (RECHG)
         *
         * A rechargeable battery power source
         */
        Rechargeable = "Rechargeable",

        /**
         * Replaceable (REPLC)
         *
         * A replaceable battery power source
         */
        Replaceable = "Replaceable"
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.5
     */
    export enum WiredCurrentType {
        /**
         * Indicates AC current
         */
        Ac = 0,

        /**
         * Indicates DC current
         */
        Dc = 1
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.1
     */
    export enum WiredFault {
        /**
         * The Node detects an unspecified fault on this wired power source.
         */
        Unspecified = 0,

        /**
         * The Node detects the supplied voltage is above maximum supported value for this wired power source.
         */
        OverVoltage = 1,

        /**
         * The Node detects the supplied voltage is below maximum supported value for this wired power source.
         */
        UnderVoltage = 2
    }

    /**
     * Body of the PowerSource wiredFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.8.1
     */
    export const TlvWiredFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per ActiveWiredFaults.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.7.8.1.1
         */
        current: TlvField(0, TlvArray(TlvEnum<WiredFault>(), { maxLength: 8 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per ActiveWiredFaults.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.7.8.1.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<WiredFault>(), { maxLength: 8 }))
    });

    /**
     * Body of the PowerSource wiredFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.8.1
     */
    export interface WiredFaultChangeEvent extends TypeFromSchema<typeof TlvWiredFaultChangeEvent> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.6
     */
    export enum BatChargeLevel {
        /**
         * Charge level is nominal
         */
        Ok = 0,

        /**
         * Charge level is low, intervention may soon be required.
         */
        Warning = 1,

        /**
         * Charge level is critical, immediate intervention is required
         */
        Critical = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.7
     */
    export enum BatReplaceability {
        /**
         * The replaceability is unspecified or unknown.
         */
        Unspecified = 0,

        /**
         * The battery is not replaceable.
         */
        NotReplaceable = 1,

        /**
         * The battery is replaceable by the user or customer.
         */
        UserReplaceable = 2,

        /**
         * The battery is replaceable by an authorized factory technician.
         */
        FactoryReplaceable = 3
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.2
     */
    export enum BatFault {
        /**
         * The Node detects an unspecified fault on this battery power source.
         */
        Unspecified = 0,

        /**
         * The Node detects the temperature of this battery power source is above ideal operating conditions.
         */
        OverTemp = 1,

        /**
         * The Node detects the temperature of this battery power source is below ideal operating conditions.
         */
        UnderTemp = 2
    }

    /**
     * Body of the PowerSource batFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.8.2
     */
    export const TlvBatFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per ActiveBatFaults.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.7.8.2.1
         */
        current: TlvField(0, TlvArray(TlvEnum<BatFault>(), { maxLength: 8 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per ActiveBatFaults.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.7.8.2.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<BatFault>(), { maxLength: 8 }))
    });

    /**
     * Body of the PowerSource batFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.8.2
     */
    export interface BatFaultChangeEvent extends TypeFromSchema<typeof TlvBatFaultChangeEvent> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.8
     */
    export enum BatCommonDesignation {
        /**
         * Common type is unknown or unspecified
         */
        Unspecified = 0,

        /**
         * Common type is as specified
         */
        Aaa = 1,

        /**
         * Common type is as specified
         */
        Aa = 2,

        C = 3,
        D = 4,

        /**
         * Common type is as specified
         */
        "4V5" = 5,

        /**
         * Common type is as specified
         */
        "6V0" = 6,

        /**
         * Common type is as specified
         */
        "9V0" = 7,

        /**
         * Common type is as specified
         */
        "12Aa" = 8,

        /**
         * Common type is as specified
         */
        Aaaa = 9,

        A = 10,
        B = 11,
        F = 12,
        N = 13,

        /**
         * Common type is as specified
         */
        No6 = 14,

        /**
         * Common type is as specified
         */
        SubC = 15,

        /**
         * Common type is as specified
         */
        A23 = 16,

        /**
         * Common type is as specified
         */
        A27 = 17,

        /**
         * Common type is as specified
         */
        Ba5800 = 18,

        /**
         * Common type is as specified
         */
        Duplex = 19,

        /**
         * Common type is as specified
         */
        "4Sr44" = 20,

        /**
         * Common type is as specified
         */
        E523 = 21,

        /**
         * Common type is as specified
         */
        E531 = 22,

        /**
         * Common type is as specified
         */
        "15V0" = 23,

        /**
         * Common type is as specified
         */
        "22V5" = 24,

        /**
         * Common type is as specified
         */
        "30V0" = 25,

        /**
         * Common type is as specified
         */
        "45V0" = 26,

        /**
         * Common type is as specified
         */
        "67V5" = 27,

        J = 28,

        /**
         * Common type is as specified
         */
        Cr123A = 29,

        /**
         * Common type is as specified
         */
        Cr2 = 30,

        /**
         * Common type is as specified
         */
        "2Cr5" = 31,

        /**
         * Common type is as specified
         */
        CrP2 = 32,

        /**
         * Common type is as specified
         */
        CrV3 = 33,

        /**
         * Common type is as specified
         */
        Sr41 = 34,

        /**
         * Common type is as specified
         */
        Sr43 = 35,

        /**
         * Common type is as specified
         */
        Sr44 = 36,

        /**
         * Common type is as specified
         */
        Sr45 = 37,

        /**
         * Common type is as specified
         */
        Sr48 = 38,

        /**
         * Common type is as specified
         */
        Sr54 = 39,

        /**
         * Common type is as specified
         */
        Sr55 = 40,

        /**
         * Common type is as specified
         */
        Sr57 = 41,

        /**
         * Common type is as specified
         */
        Sr58 = 42,

        /**
         * Common type is as specified
         */
        Sr59 = 43,

        /**
         * Common type is as specified
         */
        Sr60 = 44,

        /**
         * Common type is as specified
         */
        Sr63 = 45,

        /**
         * Common type is as specified
         */
        Sr64 = 46,

        /**
         * Common type is as specified
         */
        Sr65 = 47,

        /**
         * Common type is as specified
         */
        Sr66 = 48,

        /**
         * Common type is as specified
         */
        Sr67 = 49,

        /**
         * Common type is as specified
         */
        Sr68 = 50,

        /**
         * Common type is as specified
         */
        Sr69 = 51,

        /**
         * Common type is as specified
         */
        Sr516 = 52,

        /**
         * Common type is as specified
         */
        Sr731 = 53,

        /**
         * Common type is as specified
         */
        Sr712 = 54,

        /**
         * Common type is as specified
         */
        Lr932 = 55,

        /**
         * Common type is as specified
         */
        A5 = 56,

        /**
         * Common type is as specified
         */
        A10 = 57,

        /**
         * Common type is as specified
         */
        A13 = 58,

        /**
         * Common type is as specified
         */
        A312 = 59,

        /**
         * Common type is as specified
         */
        A675 = 60,

        /**
         * Common type is as specified
         */
        Ac41E = 61,

        /**
         * Common type is as specified
         */
        E10180 = 62,

        /**
         * Common type is as specified
         */
        E10280 = 63,

        /**
         * Common type is as specified
         */
        E10440 = 64,

        /**
         * Common type is as specified
         */
        E14250 = 65,

        /**
         * Common type is as specified
         */
        E14430 = 66,

        /**
         * Common type is as specified
         */
        E14500 = 67,

        /**
         * Common type is as specified
         */
        E14650 = 68,

        /**
         * Common type is as specified
         */
        E15270 = 69,

        /**
         * Common type is as specified
         */
        E16340 = 70,

        /**
         * Common type is as specified
         */
        Rcr123A = 71,

        /**
         * Common type is as specified
         */
        E17500 = 72,

        /**
         * Common type is as specified
         */
        E17670 = 73,

        /**
         * Common type is as specified
         */
        E18350 = 74,

        /**
         * Common type is as specified
         */
        E18500 = 75,

        /**
         * Common type is as specified
         */
        E18650 = 76,

        /**
         * Common type is as specified
         */
        E19670 = 77,

        /**
         * Common type is as specified
         */
        E25500 = 78,

        /**
         * Common type is as specified
         */
        E26650 = 79,

        /**
         * Common type is as specified
         */
        E32600 = 80
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.9
     */
    export enum BatApprovedChemistry {
        /**
         * Cell chemistry is unspecified or unknown
         */
        Unspecified = 0,

        /**
         * Cell chemistry is alkaline
         */
        Alkaline = 1,

        /**
         * Cell chemistry is lithium carbon fluoride
         */
        LithiumCarbonFluoride = 2,

        /**
         * Cell chemistry is lithium chromium oxide
         */
        LithiumChromiumOxide = 3,

        /**
         * Cell chemistry is lithium copper oxide
         */
        LithiumCopperOxide = 4,

        /**
         * Cell chemistry is lithium iron disulfide
         */
        LithiumIronDisulfide = 5,

        /**
         * Cell chemistry is lithium manganese dioxide
         */
        LithiumManganeseDioxide = 6,

        /**
         * Cell chemistry is lithium thionyl chloride
         */
        LithiumThionylChloride = 7,

        /**
         * Cell chemistry is magnesium
         */
        Magnesium = 8,

        /**
         * Cell chemistry is mercury oxide
         */
        MercuryOxide = 9,

        /**
         * Cell chemistry is nickel oxyhydride
         */
        NickelOxyhydride = 10,

        /**
         * Cell chemistry is silver oxide
         */
        SilverOxide = 11,

        /**
         * Cell chemistry is zinc air
         */
        ZincAir = 12,

        /**
         * Cell chemistry is zinc carbon
         */
        ZincCarbon = 13,

        /**
         * Cell chemistry is zinc chloride
         */
        ZincChloride = 14,

        /**
         * Cell chemistry is zinc manganese dioxide
         */
        ZincManganeseDioxide = 15,

        /**
         * Cell chemistry is lead acid
         */
        LeadAcid = 16,

        /**
         * Cell chemistry is lithium cobalt oxide
         */
        LithiumCobaltOxide = 17,

        /**
         * Cell chemistry is lithium ion
         */
        LithiumIon = 18,

        /**
         * Cell chemistry is lithium ion polymer
         */
        LithiumIonPolymer = 19,

        /**
         * Cell chemistry is lithium iron phosphate
         */
        LithiumIronPhosphate = 20,

        /**
         * Cell chemistry is lithium sulfur
         */
        LithiumSulfur = 21,

        /**
         * Cell chemistry is lithium titanate
         */
        LithiumTitanate = 22,

        /**
         * Cell chemistry is nickel cadmium
         */
        NickelCadmium = 23,

        /**
         * Cell chemistry is nickel hydrogen
         */
        NickelHydrogen = 24,

        /**
         * Cell chemistry is nickel iron
         */
        NickelIron = 25,

        /**
         * Cell chemistry is nickel metal hydride
         */
        NickelMetalHydride = 26,

        /**
         * Cell chemistry is nickel zinc
         */
        NickelZinc = 27,

        /**
         * Cell chemistry is silver zinc
         */
        SilverZinc = 28,

        /**
         * Cell chemistry is sodium ion
         */
        SodiumIon = 29,

        /**
         * Cell chemistry is sodium sulfur
         */
        SodiumSulfur = 30,

        /**
         * Cell chemistry is zinc bromide
         */
        ZincBromide = 31,

        /**
         * Cell chemistry is zinc cerium
         */
        ZincCerium = 32
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.10
     */
    export enum BatChargeState {
        /**
         * Unable to determine the charging state
         */
        Unknown = 0,

        /**
         * The battery is charging
         */
        IsCharging = 1,

        /**
         * The battery is at full charge
         */
        IsAtFullCharge = 2,

        /**
         * The battery is not charging
         */
        IsNotCharging = 3
    }

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.3
     */
    export enum BatChargeFault {
        /**
         * The Node detects an unspecified fault on this battery source.
         */
        Unspecified = 0,

        /**
         * The Node detects the ambient temperature is above the nominal range for this battery source.
         */
        AmbientTooHot = 1,

        /**
         * The Node detects the ambient temperature is below the nominal range for this battery source.
         */
        AmbientTooCold = 2,

        /**
         * The Node detects the temperature of this battery source is above the nominal range.
         */
        BatteryTooHot = 3,

        /**
         * The Node detects the temperature of this battery source is below the nominal range.
         */
        BatteryTooCold = 4,

        /**
         * The Node detects this battery source is not present.
         */
        BatteryAbsent = 5,

        /**
         * The Node detects this battery source is over voltage.
         */
        BatteryOverVoltage = 6,

        /**
         * The Node detects this battery source is under voltage.
         */
        BatteryUnderVoltage = 7,

        /**
         * The Node detects the charger for this battery source is over voltage.
         */
        ChargerOverVoltage = 8,

        /**
         * The Node detects the charger for this battery source is under voltage.
         */
        ChargerUnderVoltage = 9,

        /**
         * The Node detects a charging safety timeout for this battery source.
         */
        SafetyTimeout = 10
    }

    /**
     * Body of the PowerSource batChargeFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.8.3
     */
    export const TlvBatChargeFaultChangeEvent = TlvObject({
        /**
         * This field shall represent the set of faults currently detected, as per ActiveBatChargeFaults.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.7.8.3.1
         */
        current: TlvField(0, TlvArray(TlvEnum<BatChargeFault>(), { maxLength: 16 })),

        /**
         * This field shall represent the set of faults detected prior to this change event, as per
         * ActiveBatChargeFaults.
         *
         * @see {@link MatterSpecification.v141.Core} § 11.7.8.3.2
         */
        previous: TlvField(1, TlvArray(TlvEnum<BatChargeFault>(), { maxLength: 16 }))
    });

    /**
     * Body of the PowerSource batChargeFaultChange event
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7.8.3
     */
    export interface BatChargeFaultChangeEvent extends TypeFromSchema<typeof TlvBatChargeFaultChangeEvent> {}

    /**
     * @see {@link MatterSpecification.v141.Core} § 11.7.6.4
     */
    export enum PowerSourceStatus {
        /**
         * Indicate the source status is not specified
         */
        Unspecified = 0,

        /**
         * Indicate the source is available and currently supplying power
         */
        Active = 1,

        /**
         * Indicate the source is available, but is not currently supplying power
         */
        Standby = 2,

        /**
         * Indicate the source is not currently available to supply power
         */
        Unavailable = 3
    }

    /**
     * A PowerSourceCluster supports these elements if it supports feature Wired.
     */
    export const WiredComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the assessed RMS or DC voltage currently provided by the hard-wired source, in mV (millivolts).
             * A value of NULL shall indicate the Node is currently unable to assess the value. If the wired source is
             * not connected, but the Node is still able to assess a value, then the assessed value may be reported.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.4
             */
            wiredAssessedInputVoltage: OptionalAttribute(0x3, TlvNullable(TlvUInt32), { omitChanges: true }),

            /**
             * Indicates the assessed frequency of the voltage, currently provided by the hard-wired source, in Hz. A
             * value of NULL shall indicate the Node is currently unable to assess the value. If the wired source is not
             * connected, but the Node is still able to assess a value, then the assessed value may be reported.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.5
             */
            wiredAssessedInputFrequency: OptionalAttribute(0x4, TlvNullable(TlvUInt16), { omitChanges: true }),

            /**
             * Indicates the type of current the Node expects to be provided by the hard-wired source as specified in
             * WiredCurrentTypeEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.6
             */
            wiredCurrentType: FixedAttribute(0x5, TlvEnum<WiredCurrentType>()),

            /**
             * Indicates the assessed instantaneous current draw of the Node on the hard-wired source, in mA
             * (milliamps). A value of NULL shall indicate the Node is currently unable to assess the value. If the
             * wired source is not connected, but the Node is still able to assess a value, then the assessed value may
             * be reported.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.7
             */
            wiredAssessedCurrent: OptionalAttribute(0x6, TlvNullable(TlvUInt32), { omitChanges: true }),

            /**
             * Indicates the nominal voltage, printed as part of the Node’s regulatory compliance label in mV
             * (millivolts), expected to be provided by the hard-wired source.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.8
             */
            wiredNominalVoltage: OptionalFixedAttribute(0x7, TlvUInt32),

            /**
             * Indicates the maximum current, printed as part of the Node’s regulatory compliance label in mA
             * (milliamps), expected to be provided by the hard-wired source.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.9
             */
            wiredMaximumCurrent: OptionalFixedAttribute(0x8, TlvUInt32),

            /**
             * Indicates if the Node detects that the hard-wired power source is properly connected.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.10
             */
            wiredPresent: OptionalAttribute(0x9, TlvBoolean),

            /**
             * Indicates the set of wired faults currently detected by the Node on this power source. This set is
             * represented as a list of WiredFaultEnum. When the Node detects a fault has been raised, the appropriate
             * WiredFaultEnum value shall be added to this list, provided it is not already present. This list shall NOT
             * contain more than one instance of a specific WiredFaultEnum value. When the Node detects all conditions
             * contributing to a fault have been cleared, the corresponding WiredFaultEnum value shall be removed from
             * this list. An empty list shall indicate there are currently no active faults. The order of this list
             * SHOULD have no significance. Clients interested in monitoring changes in active faults may subscribe to
             * this attribute, or they may subscribe to WiredFaultChange.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.11
             */
            activeWiredFaults: OptionalAttribute(
                0xa,
                TlvArray(TlvEnum<WiredFault>(), { maxLength: 8 }),
                { default: [] }
            )
        },

        events: {
            /**
             * The WiredFaultChange Event shall be generated when the set of wired faults currently detected by the Node
             * on this wired power source changes. This event shall correspond to a change in value of
             * ActiveWiredFaults.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.8.1
             */
            wiredFaultChange: OptionalEvent(0x0, Priority.Info, TlvWiredFaultChangeEvent)
        }
    });

    /**
     * A PowerSourceCluster supports these elements if it supports feature Battery.
     */
    export const BatteryComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the currently measured output voltage of the battery in mV (millivolts). A value of NULL shall
             * indicate the Node is currently unable to assess the value.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.12
             */
            batVoltage: OptionalAttribute(0xb, TlvNullable(TlvUInt32), { omitChanges: true }),

            /**
             * Indicates the estimated percentage of battery charge remaining until the battery will no longer be able
             * to provide power to the Node. Values are expressed in half percent units, ranging from 0 to 200. E.g. a
             * value of 48 is equivalent to 24%. A value of NULL shall indicate the Node is currently unable to assess
             * the value.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • At most once every 10 seconds, or
             *
             *   • When it changes from null to any other value and vice versa.
             *
             * Since reporting consumes power, devices SHOULD be careful not to over-report.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.13
             */
            batPercentRemaining: OptionalAttribute(0xc, TlvNullable(TlvUInt8.bound({ max: 200 }))),

            /**
             * Indicates the estimated time in seconds before the battery will no longer be able to provide power to the
             * Node. A value of NULL shall indicate the Node is currently unable to assess the value.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • At most once every 10 seconds, or
             *
             *   • When it changes from null to any other value and vice versa.
             *
             * Since reporting consumes power, devices SHOULD be careful not to over-report.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.14
             */
            batTimeRemaining: OptionalAttribute(0xd, TlvNullable(TlvUInt32)),

            /**
             * Indicates a coarse ranking of the charge level of the battery, used to indicate when intervention is
             * required as specified in BatChargeLevelEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.15
             */
            batChargeLevel: Attribute(0xe, TlvEnum<BatChargeLevel>()),

            /**
             * Indicates if the battery needs to be replaced. Replacement may be simple routine maintenance, such as
             * with a single use, non-rechargeable cell. Replacement, however, may also indicate end of life, or serious
             * fault with a rechargeable or even non-replaceable cell.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.16
             */
            batReplacementNeeded: Attribute(0xf, TlvBoolean),

            /**
             * Indicates the replaceability of the battery as specified in BatReplaceabilityEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.17
             */
            batReplaceability: FixedAttribute(0x10, TlvEnum<BatReplaceability>()),

            /**
             * Indicates whether the Node detects that the batteries are properly installed.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.18
             */
            batPresent: OptionalAttribute(0x11, TlvBoolean),

            /**
             * Indicates the set of battery faults currently detected by the Node on this power source. This set is
             * represented as a list of BatFaultEnum. When the Node detects a fault has been raised, the appropriate
             * BatFaultEnum value shall be added to this list, provided it is not already present. This list shall NOT
             * contain more than one instance of a specific BatFaultEnum value. When the Node detects all conditions
             * contributing to a fault have been cleared, the corresponding BatFaultEnum value shall be removed from
             * this list. An empty list shall indicate there are currently no active faults. The order of this list
             * SHOULD have no significance. Clients interested in monitoring changes in active faults may subscribe to
             * this attribute, or they may subscribe to BatFaultChange.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.19
             */
            activeBatFaults: OptionalAttribute(0x12, TlvArray(TlvEnum<BatFault>(), { maxLength: 8 }), { default: [] })
        },

        events: {
            /**
             * The BatFaultChange Event shall be generated when the set of battery faults currently detected by the Node
             * on this battery power source changes. This event shall correspond to a change in value of
             * ActiveBatFaults.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.8.2
             */
            batFaultChange: OptionalEvent(0x1, Priority.Info, TlvBatFaultChangeEvent)
        }
    });

    /**
     * A PowerSourceCluster supports these elements if it supports feature Replaceable.
     */
    export const ReplaceableComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall provide a user-facing description of this battery, which SHOULD contain information
             * required to identify a replacement, such as form factor, chemistry or preferred manufacturer.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.20
             */
            batReplacementDescription: FixedAttribute(0x13, TlvString.bound({ maxLength: 60 })),

            /**
             * Indicates the ID of the common or colloquial designation of the battery, as specified in
             * BatCommonDesignationEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.21
             */
            batCommonDesignation: OptionalFixedAttribute(0x14, TlvEnum<BatCommonDesignation>()),

            /**
             * Indicates the string representing the ANSI designation for the battery as specified in ANSI C18.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.22
             */
            batAnsiDesignation: OptionalFixedAttribute(0x15, TlvString.bound({ maxLength: 20 })),

            /**
             * Indicates the string representing the IEC designation for the battery as specified in IEC 60086.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.23
             */
            batIecDesignation: OptionalFixedAttribute(0x16, TlvString.bound({ maxLength: 20 })),

            /**
             * Indicates the ID of the preferred chemistry of the battery source as specified in
             * BatApprovedChemistryEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.24
             */
            batApprovedChemistry: OptionalFixedAttribute(0x17, TlvEnum<BatApprovedChemistry>()),

            /**
             * Indicates the quantity of individual, user- or factory-serviceable battery cells or packs in the battery
             * source.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.26
             */
            batQuantity: FixedAttribute(0x19, TlvUInt8)
        }
    });

    /**
     * A PowerSourceCluster supports these elements if it supports features Replaceable or Rechargeable.
     */
    export const ReplaceableOrRechargeableComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the preferred minimum charge capacity rating in mAh of individual, user- or factory-serviceable
             * battery cells or packs in the battery source.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.25
             */
            batCapacity: OptionalFixedAttribute(0x18, TlvUInt32)
        }
    });

    /**
     * A PowerSourceCluster supports these elements if it supports feature Rechargeable.
     */
    export const RechargeableComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the current state of the battery source with respect to charging as specified in
             * BatChargeStateEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.27
             */
            batChargeState: Attribute(0x1a, TlvEnum<BatChargeState>()),

            /**
             * Indicates the estimated time in seconds before the battery source will be at full charge. A value of NULL
             * shall indicate the Node is currently unable to assess the value.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • At most once every 10 seconds, or
             *
             *   • When it changes from null to any other value and vice versa.
             *
             * Since reporting consumes power, devices SHOULD be careful not to over-report.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.28
             */
            batTimeToFullCharge: OptionalAttribute(0x1b, TlvNullable(TlvUInt32)),

            /**
             * Indicates whether the Node can remain operational while the battery source is charging.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.29
             */
            batFunctionalWhileCharging: Attribute(0x1c, TlvBoolean),

            /**
             * Indicates assessed current in mA (milliamps) presently supplied to charge the battery source. A value of
             * NULL shall indicate the Node is currently unable to assess the value.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.30
             */
            batChargingCurrent: OptionalAttribute(0x1d, TlvNullable(TlvUInt32), { omitChanges: true }),

            /**
             * Indicates the set of charge faults currently detected by the Node on this power source. This set is
             * represented as a list of BatChargeFaultEnum. When the Node detects a fault has been raised, the
             * appropriate BatChargeFaultEnum value shall be added to this list, provided it is not already present.
             * This list shall NOT contain more than one instance of a specific BatChargeFaultEnum value. When the Node
             * detects all conditions contributing to a fault have been cleared, the corresponding BatChargeFaultEnum
             * value shall be removed from this list. An empty list shall indicate there are currently no active faults.
             * The order of this list SHOULD have no significance. Clients interested in monitoring changes in active
             * faults may subscribe to this attribute, or they may subscribe to the BatFaultChange event.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.31
             */
            activeBatChargeFaults: OptionalAttribute(
                0x1e,
                TlvArray(TlvEnum<BatChargeFault>(), { maxLength: 16 }),
                { default: [] }
            )
        },

        events: {
            /**
             * The BatChargeFaultChange Event shall be generated when the set of charge faults currently detected by the
             * Node on this battery power source changes. This event shall correspond to a change in value of
             * ActiveBatChargeFaults.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.8.3
             */
            batChargeFaultChange: OptionalEvent(0x2, Priority.Info, TlvBatChargeFaultChangeEvent)
        }
    });

    /**
     * These elements and properties are present in all PowerSource clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x2f,
        name: "PowerSource",
        revision: 3,

        features: {
            /**
             * A wired power source
             */
            wired: BitFlag(0),

            /**
             * A battery power source
             */
            battery: BitFlag(1),

            /**
             * A rechargeable battery power source
             */
            rechargeable: BitFlag(2),

            /**
             * A replaceable battery power source
             */
            replaceable: BitFlag(3)
        },

        attributes: {
            /**
             * Indicates the participation of this power source in providing power to the Node as specified in
             * PowerSourceStatusEnum.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.1
             */
            status: Attribute(0x0, TlvEnum<PowerSourceStatus>()),

            /**
             * Indicates the relative preference with which the Node will select this source to provide power. A source
             * with a lower order shall be selected by the Node to provide power before any other source with a higher
             * order, if the lower order source is available (see Section 11.7.7.1, “Status Attribute”).
             *
             * Note, Order is read-only and therefore NOT intended to allow clients control over power source selection.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.2
             */
            order: Attribute(0x1, TlvUInt8, { persistent: true }),

            /**
             * This attribute shall provide a user-facing description of this source, used to distinguish it from other
             * power sources, e.g. "DC Power", "Primary Battery" or "Battery back-up". This attribute shall NOT be used
             * to convey information such as battery form factor, or chemistry.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.3
             */
            description: FixedAttribute(0x2, TlvString.bound({ maxLength: 60 })),

            /**
             * Indicates a list of endpoints that are powered by the source defined by this cluster. Multiple instances
             * of this cluster may list the same endpoint, because it is possible for power for an endpoint to come from
             * multiple sources. In that case the Order attribute indicates their priority.
             *
             * For each power source on a node, there shall only be one instance of this cluster.
             *
             * A cluster instance with an empty list shall indicate that the power source is for the entire node, which
             * includes all endpoints.
             *
             * A cluster instance with a non-empty list shall include the endpoint, upon which the cluster instance
             * resides.
             *
             * The above rules allow that some endpoints can have an unknown power source, and therefore would not be
             * indicated by any instance of this cluster.
             *
             * ### Empty list examples
             *
             * Typically, there is one power source for the node. Also common is mains power for the node with battery
             * backup power for the node. In both these common cases, for each cluster instance described, the list is
             * empty.
             *
             * ### Populated list example
             *
             * A node has a mains power source with Order as 0 (zero), but some application endpoints (not all) have a
             * battery back up source with Order as 1, which means this list is empty for the Power Source cluster
             * associated with the mains power, because it indicates the entire node, but the Power Source cluster
             * instance associated with the battery backup would list the endpoints that have a battery backup.
             *
             * @see {@link MatterSpecification.v141.Core} § 11.7.7.32
             */
            endpointList: Attribute(0x1f, TlvArray(TlvEndpointNumber), { default: [] })
        },

        /**
         * This metadata controls which PowerSourceCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { wired: true }, component: WiredComponent },
            { flags: { battery: true }, component: BatteryComponent },
            { flags: { replaceable: true }, component: ReplaceableComponent },
            { flags: { replaceable: true }, component: ReplaceableOrRechargeableComponent },
            { flags: { rechargeable: true }, component: ReplaceableOrRechargeableComponent },
            { flags: { rechargeable: true }, component: RechargeableComponent },
            { flags: { rechargeable: true, battery: false }, component: false },
            { flags: { replaceable: true, battery: false }, component: false },
            { flags: { wired: true, battery: true }, component: false },
            { flags: { wired: false, battery: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster is used to describe the configuration and capabilities of a physical power source that provides
     * power to one or more endpoints on a node. In case the node has multiple power sources, each shall be described by
     * its own cluster instance. Each instance of this cluster may be associated with one or more endpoints or the
     * entire node.
     *
     * Per the Matter specification you cannot use {@link PowerSourceCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Core} § 11.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const WIRED = { wired: true };
    const BAT = { battery: true };
    const REPLC = { replaceable: true };
    const RECHG = { rechargeable: true };

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
            wiredAssessedInputVoltage: MutableCluster.AsConditional(
                WiredComponent.attributes.wiredAssessedInputVoltage,
                { optionalIf: [WIRED] }
            ),
            wiredAssessedInputFrequency: MutableCluster.AsConditional(
                WiredComponent.attributes.wiredAssessedInputFrequency,
                { optionalIf: [WIRED] }
            ),
            wiredCurrentType: MutableCluster.AsConditional(
                WiredComponent.attributes.wiredCurrentType,
                { mandatoryIf: [WIRED] }
            ),
            wiredAssessedCurrent: MutableCluster.AsConditional(
                WiredComponent.attributes.wiredAssessedCurrent,
                { optionalIf: [WIRED] }
            ),
            wiredNominalVoltage: MutableCluster.AsConditional(
                WiredComponent.attributes.wiredNominalVoltage,
                { optionalIf: [WIRED] }
            ),
            wiredMaximumCurrent: MutableCluster.AsConditional(
                WiredComponent.attributes.wiredMaximumCurrent,
                { optionalIf: [WIRED] }
            ),
            wiredPresent: MutableCluster.AsConditional(WiredComponent.attributes.wiredPresent, { optionalIf: [WIRED] }),
            activeWiredFaults: MutableCluster.AsConditional(
                WiredComponent.attributes.activeWiredFaults,
                { optionalIf: [WIRED] }
            ),
            batVoltage: MutableCluster.AsConditional(BatteryComponent.attributes.batVoltage, { optionalIf: [BAT] }),
            batPercentRemaining: MutableCluster.AsConditional(
                BatteryComponent.attributes.batPercentRemaining,
                { optionalIf: [BAT] }
            ),
            batTimeRemaining: MutableCluster.AsConditional(
                BatteryComponent.attributes.batTimeRemaining,
                { optionalIf: [BAT] }
            ),
            batChargeLevel: MutableCluster.AsConditional(
                BatteryComponent.attributes.batChargeLevel,
                { mandatoryIf: [BAT] }
            ),
            batReplacementNeeded: MutableCluster.AsConditional(
                BatteryComponent.attributes.batReplacementNeeded,
                { mandatoryIf: [BAT] }
            ),
            batReplaceability: MutableCluster.AsConditional(
                BatteryComponent.attributes.batReplaceability,
                { mandatoryIf: [BAT] }
            ),
            batPresent: MutableCluster.AsConditional(BatteryComponent.attributes.batPresent, { optionalIf: [BAT] }),
            activeBatFaults: MutableCluster.AsConditional(
                BatteryComponent.attributes.activeBatFaults,
                { optionalIf: [BAT] }
            ),
            batReplacementDescription: MutableCluster.AsConditional(
                ReplaceableComponent.attributes.batReplacementDescription,
                { mandatoryIf: [REPLC] }
            ),
            batCommonDesignation: MutableCluster.AsConditional(
                ReplaceableComponent.attributes.batCommonDesignation,
                { optionalIf: [REPLC] }
            ),
            batAnsiDesignation: MutableCluster.AsConditional(
                ReplaceableComponent.attributes.batAnsiDesignation,
                { optionalIf: [REPLC] }
            ),
            batIecDesignation: MutableCluster.AsConditional(
                ReplaceableComponent.attributes.batIecDesignation,
                { optionalIf: [REPLC] }
            ),
            batApprovedChemistry: MutableCluster.AsConditional(
                ReplaceableComponent.attributes.batApprovedChemistry,
                { optionalIf: [REPLC] }
            ),
            batCapacity: MutableCluster.AsConditional(
                ReplaceableOrRechargeableComponent.attributes.batCapacity,
                { optionalIf: [REPLC, RECHG] }
            ),
            batQuantity: MutableCluster.AsConditional(
                ReplaceableComponent.attributes.batQuantity,
                { mandatoryIf: [REPLC] }
            ),
            batChargeState: MutableCluster.AsConditional(
                RechargeableComponent.attributes.batChargeState,
                { mandatoryIf: [RECHG] }
            ),
            batTimeToFullCharge: MutableCluster.AsConditional(
                RechargeableComponent.attributes.batTimeToFullCharge,
                { optionalIf: [RECHG] }
            ),
            batFunctionalWhileCharging: MutableCluster.AsConditional(
                RechargeableComponent.attributes.batFunctionalWhileCharging,
                { mandatoryIf: [RECHG] }
            ),
            batChargingCurrent: MutableCluster.AsConditional(
                RechargeableComponent.attributes.batChargingCurrent,
                { optionalIf: [RECHG] }
            ),
            activeBatChargeFaults: MutableCluster.AsConditional(
                RechargeableComponent.attributes.activeBatChargeFaults,
                { optionalIf: [RECHG] }
            )
        },

        events: {
            wiredFaultChange: MutableCluster.AsConditional(
                WiredComponent.events.wiredFaultChange,
                { optionalIf: [WIRED] }
            ),
            batFaultChange: MutableCluster.AsConditional(BatteryComponent.events.batFaultChange, { optionalIf: [BAT] }),
            batChargeFaultChange: MutableCluster.AsConditional(
                RechargeableComponent.events.batChargeFaultChange,
                { optionalIf: [RECHG] }
            )
        }
    });

    /**
     * This cluster supports all PowerSource features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type PowerSourceCluster = PowerSource.Cluster;
export const PowerSourceCluster = PowerSource.Cluster;
ClusterRegistry.register(PowerSource.Complete);
