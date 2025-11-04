/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    Command,
    TlvNoResponse,
    OptionalWritableAttribute,
    OptionalEvent,
    OptionalCommand,
    Event
} from "../cluster/Cluster.js";
import {
    TlvEpochS,
    TlvInt64,
    TlvPercent,
    TlvUInt16,
    TlvUInt8,
    TlvBitmap,
    TlvEnum,
    TlvUInt32
} from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { TlvArray } from "../tlv/TlvArray.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvString, TlvByteString } from "../tlv/TlvString.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace EnergyEvse {
    /**
     * These are optional features supported by EnergyEvseCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.4
     */
    export enum Feature {
        /**
         * ChargingPreferences (PREF)
         *
         * Since some EVSEs cannot obtain the SoC from the vehicle, some EV charging solutions allow the consumer to
         * specify a daily charging target (for adding energy to the EV’s battery). This feature allows the consumer to
         * specify how many miles or km of additional range they need for their typical daily commute. This range
         * requirement can be converted into a daily energy demand with a target charging completion time.
         *
         * The EVSE itself can use this information (or may allow a controller such as an EMS) to compute an optimized
         * charging schedule.
         *
         * An EVSE device which includes a Device Energy Management device with the Device Energy Management cluster PFR
         * (Power Forecast Reporting) feature can use the charging preferences information to produce its power
         * forecast.
         *
         * EVSE devices that support the Device Energy Management cluster’s FA feature can have their charging profiles
         * set by a controller device such as an EMS. For example, if the EVSE advertises a simple power forecast which
         * allows the EMS to adjust over a wide range of power and time durations, then the EVSE may allow the EMS to
         * propose a revised optimized forecast (which is the charging profile). For example, a solar PV ESA may also
         * share its Forecast, so enabling an EMS to adjust the EVSE forecast to the best time to charge so that any
         * excess solar generation is used to charge the EV.
         *
         * See the Device Energy Management Cluster for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.1
         */
        ChargingPreferences = "ChargingPreferences",

        /**
         * SoCReporting (SOC)
         *
         * Vehicles and EVSEs which support ISO 15118 may allow the vehicle to report its battery size and state of
         * charge. If the EVSE supports PLC it may have a vehicle connected which optionally supports reporting of its
         * battery size and current State of Charge (SoC).
         *
         * If the EVSE supports reporting of State of Charge this feature will only work if a compatible EV is
         * connected.
         *
         * Note some EVSEs may use other undefined mechanisms to obtain vehicle State of Charge outside the scope of
         * this cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.2
         */
        SoCReporting = "SoCReporting",

        /**
         * PlugAndCharge (PNC)
         *
         * If the EVSE supports PLC, it may be able to support the Plug and Charge feature. e.g. this may allow the
         * vehicle ID to be obtained which may allow an energy management system to track energy usage per vehicle (e.g.
         * to give the owner an indicative cost of charging, or for work place charging).
         *
         * If the EVSE supports the Plug and Charge feature, it will only work if a compatible EV is connected.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.3
         */
        PlugAndCharge = "PlugAndCharge",

        /**
         * Rfid (RFID)
         *
         * If the EVSE is fitted with an RFID reader, it may be possible to obtain the User or Vehicle ID from an RFID
         * card. This may be used to record a charging session against a specific charging account, and may optionally
         * be used to authorize a charging session.
         *
         * An RFID event can be generated when a user taps an RFID card onto the RFID reader. The event must be
         * subscribed to by the EVSE Management cluster client. This client may use this to enable the EV to charge or
         * discharge. The lookup and authorization of RIFD UID is outside the scope of this cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.4
         */
        Rfid = "Rfid",

        /**
         * V2X (V2X)
         *
         * If the EVSE can support bi-directional charging, it may be possible to request that the vehicle can discharge
         * to the home or grid.
         *
         * The charging and discharging may be controlled by a home Energy Management System (EMS) using the Device
         * Energy Management cluster of the associated Device Energy Management device. For example, an EMS may use the
         * PA (Power Adjustment) feature to continually adjust the charge/discharge current to/from the EV so as to
         * minimise the energy flow from/to the grid as the demand in the home and the solar supply to the home both
         * fluctuate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.5
         */
        V2X = "V2X"
    }

    /**
     * Input to the EnergyEvse enableDischarging command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3
     */
    export const TlvEnableDischargingRequest = TlvObject({
        /**
         * This field shall indicate the expiry time, in UTC, when discharging will be automatically disabled.
         *
         * A value in the past in this field shall disable the EVSE discharging whereas a null value shall enable EVSE
         * discharging permanently.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3.1
         */
        dischargingEnabledUntil: TlvField(0, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the maximum current that can be received by the EVSE from the EV. The EVSE current
         * limit can be advertised to an EV in 0.6A steps. The value of the MaximumDischargeCurrent attribute shall be
         * stored and persisted across reboots by the EVSE to the value of this field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3.2
         */
        maximumDischargeCurrent: TlvField(1, TlvInt64.bound({ min: 0 }))
    });

    /**
     * Input to the EnergyEvse enableDischarging command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3
     */
    export interface EnableDischargingRequest extends TypeFromSchema<typeof TlvEnableDischargingRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.1
     */
    export const TargetDayOfWeek = {
        /**
         * Sunday
         */
        sunday: BitFlag(0),

        /**
         * Monday
         */
        monday: BitFlag(1),

        /**
         * Tuesday
         */
        tuesday: BitFlag(2),

        /**
         * Wednesday
         */
        wednesday: BitFlag(3),

        /**
         * Thursday
         */
        thursday: BitFlag(4),

        /**
         * Friday
         */
        friday: BitFlag(5),

        /**
         * Saturday
         */
        saturday: BitFlag(6)
    };

    /**
     * This represents a single user specified charging target for an EV.
     *
     * An EVSE or EMS system optimizer may use this information to take the Time of Use Tariff, grid carbon intensity,
     * local generation (solar PV) into account to provide the cheapest and cleanest energy to the EV.
     *
     * The optimization strategy is not defined here, however in simple terms, the AddedEnergy requirement can be
     * fulfilled by knowing the charging Power (W) and the time needed to charge.
     *
     * To compute the Charging Time: Required Energy (Wh) = Power (W) x ChargingTime (s) / 3600 Therefore: ChargingTime
     * (s) = (3600 x RequiredEnergy (wH)) / Power (W)
     *
     * To compute the charging time: Charging StartTime = TargetTimeMinutesPastMidnight - ChargingTime
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6
     */
    export const TlvChargingTarget = TlvObject({
        /**
         * This field shall indicate the desired charging completion time of the associated day. The time will be
         * represented by a 16 bits unsigned integer to designate the minutes since midnight. For example, 6am will be
         * represented by 360 minutes since midnight and 11:30pm will be represented by 1410 minutes since midnight.
         *
         * This field is based on local wall clock time. In case of Daylight Savings Time transition which may result in
         * an extra hour or one hour less in the day, the charging algorithm should take into account the shift
         * appropriately.
         *
         * Note that if the TargetTimeMinutesPastMidnight values are too close together (e.g. 2 per day) these may
         * overlap. The EVSE may have to coalesce the charging targets into a single target. e.g. if the 1st charging
         * target cannot be met in the time available, the EVSE may be forced to begin working towards the 2nd charging
         * target and immediately continue until both targets have been satisfied (or the vehicle becomes full).
         *
         * The EVSE itself cannot predict the behavior of the vehicle (i.e. if it cannot obtain the SoC from the
         * vehicle), so should attempt to perform a sensible operation based on these targets. It is recommended that
         * the charging schedule is pessimistic (i.e. starts earlier) since the vehicle may charge more slowly than the
         * electrical supply may provide power (especially if it is cold).
         *
         * If the user configures large charging targets (e.g. high values of AddedEnergy or SoC) then it is expected
         * that the EVSE may need to begin charging immediately, and may not be able to guarantee that the vehicle will
         * be able to reach the target.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6.1
         */
        targetTimeMinutesPastMidnight: TlvField(0, TlvUInt16.bound({ max: 1439 })),

        /**
         * This field represents the target SoC that the vehicle should be charged to before the
         * TargetTimeMinutesPastMidnight.
         *
         * If the EVSE supports the SOC feature and can obtain the SoC of the vehicle:
         *
         *   • the TargetSoC field shall take precedence over the AddedEnergy field.
         *
         *   • the EVSE SHOULD charge to the TargetSoC and then stop the charging automatically when it reaches that
         *     point.
         *
         *   • if the TargetSoC value is set to 100% then the EVSE SHOULD continue to charge the vehicle until the
         *     vehicle decides to stop charging.
         *
         * If the EVSE does not support the SOC feature or cannot obtain the SoC of the vehicle:
         *
         *   • the AddedEnergy field shall take precedence over the TargetSoC field, and if the EVSE does not support
         *     the SOC feature then the TargetSoC field may only take the values null or 100%.
         *
         *   • if the AddedEnergy field has not been provided, the EVSE SHOULD assume the vehicle is empty
         *
         * and charge until the vehicle stops demanding a charge.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6.2
         */
        targetSoC: TlvOptionalField(1, TlvPercent),

        /**
         * This field represents the amount of energy that the user would like to have added to the vehicle before the
         * TargetTimeMinutesPastMidnight.
         *
         * This represents a positive value in mWh that SHOULD be added during the session (i.e. if the vehicle charging
         * is stopped and started several times, this equates to the total energy since the vehicle has been plugged
         * in).
         *
         * The maximum value (500kWh) is much larger than most EV batteries on the market today. If the client tries to
         * set this value too high then the EVSE will need to start charging immediately and continue charging until the
         * vehicle stops demanding charge (i.e. it is full). Therefore the maximum value should be set based on typical
         * battery size of the vehicles on the market (e.g. 70000Wh), however this is up to the client to carefully
         * choose a value.
         *
         * > [!NOTE]
         *
         * > If the EVSE can obtain the Battery Capacity of the vehicle, it SHOULD NOT limit this AddedEnergy value to
         *   the Battery Capacity of the vehicle, since the EV may also require energy for heating and cooling of the
         *   battery during charging, or for heating or cooling the cabin.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6.3
         */
        addedEnergy: TlvOptionalField(2, TlvInt64.bound({ min: 0 }))
    });

    /**
     * This represents a single user specified charging target for an EV.
     *
     * An EVSE or EMS system optimizer may use this information to take the Time of Use Tariff, grid carbon intensity,
     * local generation (solar PV) into account to provide the cheapest and cleanest energy to the EV.
     *
     * The optimization strategy is not defined here, however in simple terms, the AddedEnergy requirement can be
     * fulfilled by knowing the charging Power (W) and the time needed to charge.
     *
     * To compute the Charging Time: Required Energy (Wh) = Power (W) x ChargingTime (s) / 3600 Therefore: ChargingTime
     * (s) = (3600 x RequiredEnergy (wH)) / Power (W)
     *
     * To compute the charging time: Charging StartTime = TargetTimeMinutesPastMidnight - ChargingTime
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6
     */
    export interface ChargingTarget extends TypeFromSchema<typeof TlvChargingTarget> {}

    /**
     * This represents a set of user specified charging targets for an EV for a set of specified days.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.7
     */
    export const TlvChargingTargetSchedule = TlvObject({
        /**
         * This field shall indicate the days of the week that the charging targets SHOULD be associated to. This field
         * is a bitmap and therefore the associated targets could be applied to multiple days.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.8
         */
        dayOfWeekForSequence: TlvField(0, TlvBitmap(TlvUInt8, TargetDayOfWeek)),

        /**
         * This field shall indicate a list of up to 10 charging targets for each of the associated days of the week.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.9
         */
        chargingTargets: TlvField(1, TlvArray(TlvChargingTarget, { maxLength: 10 }))
    });

    /**
     * This represents a set of user specified charging targets for an EV for a set of specified days.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.7
     */
    export interface ChargingTargetSchedule extends TypeFromSchema<typeof TlvChargingTargetSchedule> {}

    /**
     * Input to the EnergyEvse setTargets command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5
     */
    export const TlvSetTargetsRequest = TlvObject({
        /**
         * This field shall indicate a list of up to 7 sets of daily charging targets together with their associated
         * days of the week. Each of the days of the week may only be included in a single ChargingTargetSchedule within
         * this list field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5.1
         */
        chargingTargetSchedules: TlvField(0, TlvArray(TlvChargingTargetSchedule, { maxLength: 7 }))
    });

    /**
     * Input to the EnergyEvse setTargets command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5
     */
    export interface SetTargetsRequest extends TypeFromSchema<typeof TlvSetTargetsRequest> {}

    /**
     * The GetTargetsResponse is sent in response to the GetTargets Command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.7
     */
    export const TlvGetTargetsResponse = TlvObject({
        /**
         * This field shall indicate a list of up to 7 sets of daily charging targets together with their associated
         * days of the week.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.7.1
         */
        chargingTargetSchedules: TlvField(0, TlvArray(TlvChargingTargetSchedule, { maxLength: 7 }))
    });

    /**
     * The GetTargetsResponse is sent in response to the GetTargets Command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.7
     */
    export interface GetTargetsResponse extends TypeFromSchema<typeof TlvGetTargetsResponse> {}

    /**
     * Body of the EnergyEvse rfid event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6
     */
    export const TlvRfidEvent = TlvObject({
        /**
         * The UID field (ISO 14443A UID) is either 4, 7 or 10 bytes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6.1
         */
        uid: TlvField(0, TlvByteString.bound({ maxLength: 10 }))
    });

    /**
     * Body of the EnergyEvse rfid event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6
     */
    export interface RfidEvent extends TypeFromSchema<typeof TlvRfidEvent> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.2
     */
    export enum State {
        /**
         * The EV is not plugged in.
         */
        NotPluggedIn = 0,

        /**
         * The EV is plugged in, but not demanding current.
         */
        PluggedInNoDemand = 1,

        /**
         * The EV is plugged in and is demanding current, but EVSE is not allowing current to flow.
         */
        PluggedInDemand = 2,

        /**
         * The EV is plugged in, charging is in progress, and current is flowing
         */
        PluggedInCharging = 3,

        /**
         * The EV is plugged in, discharging is in progress, and current is flowing
         */
        PluggedInDischarging = 4,

        /**
         * The EVSE is transitioning from any plugged-in state to NotPluggedIn
         */
        SessionEnding = 5,

        /**
         * There is a fault, further details in the FaultState attribute
         */
        Fault = 6
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.3
     */
    export enum SupplyState {
        /**
         * The EV is not currently allowed to charge or discharge
         */
        Disabled = 0,

        /**
         * The EV is currently allowed to charge
         */
        ChargingEnabled = 1,

        /**
         * The EV is currently allowed to discharge
         */
        DischargingEnabled = 2,

        /**
         * The EV is not currently allowed to charge or discharge due to an error. The error must be cleared before
         * operation can continue.
         */
        DisabledError = 3,

        /**
         * The EV is not currently allowed to charge or discharge due to self-diagnostics mode.
         */
        DisabledDiagnostics = 4,

        /**
         * The EV is currently allowed to charge and discharge
         */
        Enabled = 5
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.4
     */
    export enum FaultState {
        /**
         * The EVSE is not in an error state.
         */
        NoError = 0,

        /**
         * The EVSE is unable to obtain electrical measurements.
         */
        MeterFailure = 1,

        /**
         * The EVSE input voltage level is too high.
         */
        OverVoltage = 2,

        /**
         * The EVSE input voltage level is too low.
         */
        UnderVoltage = 3,

        /**
         * The EVSE detected charging current higher than allowed by charger.
         */
        OverCurrent = 4,

        /**
         * The EVSE detected voltage on charging pins when the contactor is open.
         */
        ContactWetFailure = 5,

        /**
         * The EVSE detected absence of voltage after enabling contactor.
         */
        ContactDryFailure = 6,

        /**
         * The EVSE has an unbalanced current supply.
         */
        GroundFault = 7,

        /**
         * The EVSE has detected a loss in power.
         */
        PowerLoss = 8,

        /**
         * The EVSE has detected another power quality issue (e.g. phase imbalance).
         */
        PowerQuality = 9,

        /**
         * The EVSE pilot signal amplitude short circuited to ground.
         */
        PilotShortCircuit = 10,

        /**
         * The emergency stop button was pressed.
         */
        EmergencyStop = 11,

        /**
         * The EVSE detected that the cable has been disconnected.
         */
        EvDisconnected = 12,

        /**
         * The EVSE could not determine proper power supply level.
         */
        WrongPowerSupply = 13,

        /**
         * The EVSE detected Live and Neutral are swapped.
         */
        LiveNeutralSwap = 14,

        /**
         * The EVSE internal temperature is too high.
         */
        OverTemperature = 15,

        /**
         * Any other reason.
         */
        Other = 255
    }

    /**
     * Input to the EnergyEvse enableCharging command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2
     */
    export const TlvEnableChargingRequest = TlvObject({
        /**
         * This field shall indicate the expiry time, in UTC, when charging will be automatically disabled.
         *
         * A value in the past in this field shall disable the EVSE charging whereas a null value shall enable it
         * permanently.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2.1
         */
        chargingEnabledUntil: TlvField(0, TlvNullable(TlvEpochS)),

        /**
         * This field shall indicate the minimum current that can be delivered by the EVSE to the EV in trickle mode.
         * The EVSE current limit can be advertised to an EV in 0.6A steps.
         *
         * The value of the MinimumChargeCurrent attribute shall be set to the value of this field (see Section 9.3.8.7,
         * “MinimumChargeCurrent Attribute” for further details).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2.2
         */
        minimumChargeCurrent: TlvField(1, TlvInt64.bound({ min: 0 })),

        /**
         * This field shall indicate the maximum current that can be delivered by the EVSE to the EV. The EVSE current
         * limit can be advertised to an EV in 0.6A steps.
         *
         * The value of the this field shall be stored by the EVSE to determine the value of MaximumChargeCurrent
         * attribute. For example, if the UserMaximumChargeCurrent attribute is adjusted below then this value, and then
         * later adjusted above this value, the resulting MaximumChargeCurrent attribute will be limited to this value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2.3
         */
        maximumChargeCurrent: TlvField(2, TlvInt64.bound({ min: 0 }))
    });

    /**
     * Input to the EnergyEvse enableCharging command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2
     */
    export interface EnableChargingRequest extends TypeFromSchema<typeof TlvEnableChargingRequest> {}

    /**
     * Body of the EnergyEvse evConnected event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1
     */
    export const TlvEvConnectedEvent = TlvObject({
        /**
         * This is the new session ID created after the vehicle is plugged in.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1.1
         */
        sessionId: TlvField(0, TlvUInt32)
    });

    /**
     * Body of the EnergyEvse evConnected event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1
     */
    export interface EvConnectedEvent extends TypeFromSchema<typeof TlvEvConnectedEvent> {}

    /**
     * Body of the EnergyEvse evNotDetected event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2
     */
    export const TlvEvNotDetectedEvent = TlvObject({
        /**
         * This field shall indicate the current value of the SessionID attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.1
         */
        sessionId: TlvField(0, TlvUInt32),

        /**
         * This field shall indicate the value of the State attribute prior to the EV not being detected.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.2
         */
        state: TlvField(1, TlvEnum<State>()),

        /**
         * This field shall indicate the total duration of the session, from the start of the session when the EV was
         * plugged in, until it was unplugged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.3
         */
        sessionDuration: TlvField(2, TlvUInt32),

        /**
         * This field shall indicate the total amount of energy transferred from the EVSE to the EV during the session.
         *
         * Note that if bi-directional charging occurs during the session, then this value shall only include the sum of
         * energy transferred from the EVSE to the EV, and shall NOT be a net value of charging and discharging energy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.4
         */
        sessionEnergyCharged: TlvField(3, TlvInt64.bound({ min: 0 })),

        /**
         * This field shall indicate the total amount of energy transferred from the EV to the EVSE during the session.
         *
         * Note that if bi-directional discharging occurs during the session, then this value shall only include the sum
         * of energy transferred from the EV to the EVSE, and shall NOT be a net value of charging and discharging
         * energy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.5
         */
        sessionEnergyDischarged: TlvOptionalField(4, TlvInt64.bound({ min: 0 }))
    });

    /**
     * Body of the EnergyEvse evNotDetected event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2
     */
    export interface EvNotDetectedEvent extends TypeFromSchema<typeof TlvEvNotDetectedEvent> {}

    /**
     * Body of the EnergyEvse energyTransferStarted event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3
     */
    export const TlvEnergyTransferStartedEvent = TlvObject({
        /**
         * This field shall indicate the value of the SessionID attribute at the time the event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.1
         */
        sessionId: TlvField(0, TlvUInt32),

        /**
         * This field shall indicate the value of the State attribute at the time the event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.2
         */
        state: TlvField(1, TlvEnum<State>()),

        /**
         * This field shall indicate the value of the maximum charging current at the time the event was generated.
         *
         * A non-zero value indicates that the EV has been enabled for charging and the value is taken directly from the
         * MaximumChargeCurrent attribute. A zero value indicates that the EV has not been enabled for charging.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.3
         */
        maximumCurrent: TlvField(2, TlvInt64.bound({ min: 0 })),

        /**
         * This field shall indicate the value of the maximum discharging current at the time the event was generated.
         *
         * A non-zero value indicates that the EV has been enabled for discharging and the value is taken directly from
         * the MaximumDischargeCurrent attribute. A zero value indicates that the EV has not been enabled for
         * discharging.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.4
         */
        maximumDischargeCurrent: TlvOptionalField(3, TlvInt64.bound({ min: 0 }))
    });

    /**
     * Body of the EnergyEvse energyTransferStarted event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3
     */
    export interface EnergyTransferStartedEvent extends TypeFromSchema<typeof TlvEnergyTransferStartedEvent> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.5
     */
    export enum EnergyTransferStoppedReason {
        /**
         * The EV decided to stop
         */
        EvStopped = 0,

        /**
         * The EVSE decided to stop
         */
        EvseStopped = 1,

        /**
         * An other unknown reason
         */
        Other = 2
    }

    /**
     * Body of the EnergyEvse energyTransferStopped event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4
     */
    export const TlvEnergyTransferStoppedEvent = TlvObject({
        /**
         * This field shall indicate the value of the SessionID attribute prior to the energy transfer stopping.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.1
         */
        sessionId: TlvField(0, TlvUInt32),

        /**
         * This field shall indicate the value of the State attribute prior to the energy transfer stopping.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.2
         */
        state: TlvField(1, TlvEnum<State>()),

        /**
         * This field shall indicate the reason why the energy transferred stopped.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.3
         */
        reason: TlvField(2, TlvEnum<EnergyTransferStoppedReason>()),

        /**
         * This field shall indicate the amount of energy transferred from the EVSE to the EV since the previous
         * EnergyTransferStarted event, in mWh.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.4
         */
        energyTransferred: TlvField(4, TlvInt64.bound({ min: 0 })),

        /**
         * This field shall indicate the amount of energy transferred from the EV to the EVSE since the previous
         * EnergyTransferStarted event, in mWh.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.5
         */
        energyDischarged: TlvOptionalField(5, TlvInt64.bound({ min: 0 }))
    });

    /**
     * Body of the EnergyEvse energyTransferStopped event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4
     */
    export interface EnergyTransferStoppedEvent extends TypeFromSchema<typeof TlvEnergyTransferStoppedEvent> {}

    /**
     * Body of the EnergyEvse fault event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5
     */
    export const TlvFaultEvent = TlvObject({
        /**
         * This field shall indicate the value of the SessionID attribute prior to the Fault State being changed. A
         * value of null indicates no sessions have occurred before the fault occurred.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.1
         */
        sessionId: TlvField(0, TlvNullable(TlvUInt32)),

        /**
         * This field shall indicate the value of the State attribute prior to the Fault State being changed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.2
         */
        state: TlvField(1, TlvEnum<State>()),

        /**
         * This field shall indicate the value of the FaultState attribute prior to the Fault State being changed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.3
         */
        faultStatePreviousState: TlvField(2, TlvEnum<FaultState>()),

        /**
         * This field shall indicate the current value of the FaultState attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.4
         */
        faultStateCurrentState: TlvField(4, TlvEnum<FaultState>())
    });

    /**
     * Body of the EnergyEvse fault event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5
     */
    export interface FaultEvent extends TypeFromSchema<typeof TlvFaultEvent> {}

    /**
     * A EnergyEvseCluster supports these elements if it supports feature V2X.
     */
    export const V2XComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the time, in UTC, that the EVSE will automatically stop current flow from the EV.
             *
             * A null value indicates the EVSE is always enabled for discharging.
             *
             * A value in the past or 0x0 indicates that EVSE discharging shall be disabled. The attribute is only set
             * via the payload of the EnableDischarging command.
             *
             * This attribute shall be persisted, for example a temporary power failure should not stop the vehicle from
             * being discharged.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.5
             */
            dischargingEnabledUntil: Attribute(0x4, TlvNullable(TlvEpochS), { persistent: true }),

            /**
             * Indicates the maximum current that can be received by the EVSE from the EV. This attribute can be set
             * using the EnableDischarging command.
             *
             * This attribute value shall be the minimum of:
             *
             *   • CircuitCapacity - Electrician’s installation setting
             *
             *   • CableAssemblyCurrentLimit (detected by the EVSE when the cable is plugged in)
             *
             *   • MaximumDischargeCurrent field in the EnableDischarging command
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.9
             */
            maximumDischargeCurrent: Attribute(0x8, TlvInt64.bound({ min: 0 }), { persistent: true }),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
             */
            sessionEnergyDischarged: Attribute(0x43, TlvNullable(TlvInt64.bound({ min: 0 })), { persistent: true })
        },

        commands: {
            /**
             * Upon receipt, this shall allow a client to enable the discharge of an EV, and to provide or update the
             * maximum discharge current.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3
             */
            enableDischarging: Command(0x3, TlvEnableDischargingRequest, 0x3, TlvNoResponse, { timed: true })
        }
    });

    /**
     * A EnergyEvseCluster supports these elements if it supports feature ChargingPreferences.
     */
    export const ChargingPreferencesComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the time, in UTC, when the EVSE plans to start the next scheduled charge based on the charging
             * preferences.
             *
             * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use
             * Manual mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.12
             */
            nextChargeStartTime: Attribute(0x23, TlvNullable(TlvEpochS)),

            /**
             * Indicates the time, in UTC, when the EVSE SHOULD complete the next scheduled charge based on the charging
             * preferences.
             *
             * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use
             * Manual mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.13
             */
            nextChargeTargetTime: Attribute(0x24, TlvNullable(TlvEpochS)),

            /**
             * Indicates the amount of energy that the EVSE is going to attempt to add to the vehicle in the next
             * charging target.
             *
             * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use
             * Manual mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is
             * enabled, or that the next ChargingTargetStruct is using the TargetSoC value to charge the vehicle.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.14
             */
            nextChargeRequiredEnergy: Attribute(0x25, TlvNullable(TlvInt64.bound({ min: 0 }))),

            /**
             * Indicates the target SoC the EVSE is going to attempt to reach when the vehicle is next charged.
             *
             * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use
             * Manual mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is
             * enabled, or that the next ChargingTargetStruct is using the AddedEnergy value to charge the vehicle.
             *
             * If the SOC feature is not supported, only the values null and 100% are supported.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.15
             */
            nextChargeTargetSoC: Attribute(0x26, TlvNullable(TlvPercent)),

            /**
             * Indicates the vehicle efficiency rating for a connected vehicle.
             *
             * This can be used to help indicate to the user approximately how many miles or km of range will be added.
             * It allows user interfaces to display to the user simpler terms that they can relate to compared to kWh.
             *
             * This is value is stored in km per kWh multiplied by a scaling factor of 1000.
             *
             * A null value indicates that the EV efficiency is unknown and the NextChargeRequiredEnergy attribute
             * cannot be converted from Wh to miles or km.
             *
             * To convert from Wh into Range:
             *
             * AddedRange (km) = AddedEnergy (Wh) x ApproxEVEfficiency (km/kWh x 1000) AddedRange (Miles) = AddedEnergy
             * (Wh) x ApproxEVEfficiency (km/kWh x 1000) x 0.6213
             *
             * Example:
             *
             * ApproxEVEfficiency (km/kWh x 1000): 4800 (i.e. 4.8km/kWh x 1000)
             *
             * ### AddedEnergy (Wh): 10,000
             *
             * AddedRange (km) = 10,000 x 4800 / 1,000,000 = 48 km
             *
             * AddedRange (Miles) = AddedEnergy (Wh) x ApproxEVEfficiency (km/kWh x 1000) x
             *
             * 0.6213
             *
             * = 29.82 Miles
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.16
             */
            approximateEvEfficiency: OptionalWritableAttribute(
                0x27,
                TlvNullable(TlvUInt16),
                { persistent: true, default: null, writeAcl: AccessLevel.Manage }
            )
        },

        commands: {
            /**
             * Allows a client to set the user specified charging targets.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5
             */
            setTargets: Command(0x5, TlvSetTargetsRequest, 0x5, TlvNoResponse, { timed: true }),

            /**
             * Allows a client to retrieve the current set of charging targets.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.6
             */
            getTargets: Command(0x6, TlvNoArguments, 0x0, TlvGetTargetsResponse, { timed: true }),

            /**
             * Allows a client to clear all stored charging targets.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.8
             */
            clearTargets: Command(0x7, TlvNoArguments, 0x7, TlvNoResponse, { timed: true })
        }
    });

    /**
     * A EnergyEvseCluster supports these elements if it supports feature SoCReporting.
     */
    export const SoCReportingComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the state of charge of the EV battery in steps of 1%. The values are in the 0-100%. This
             * attribute is only available on EVSEs which can read the state of charge from the vehicle and that support
             * the SOC feature. If the StateOfCharge cannot be read from the vehicle it shall be returned with a NULL
             * value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.17
             */
            stateOfCharge: Attribute(0x30, TlvNullable(TlvPercent)),

            /**
             * Indicates the capacity of the EV battery in mWh. This value is always positive.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.18
             */
            batteryCapacity: Attribute(0x31, TlvNullable(TlvInt64.bound({ min: 0 })))
        }
    });

    /**
     * A EnergyEvseCluster supports these elements if it supports feature PlugAndCharge.
     */
    export const PlugAndChargeComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the vehicle ID read by the EVSE via ISO-15118 using the PNC feature, if the EVSE supports this
             * capability.
             *
             * The field may be based on the e-Mobility Account Identifier (EMAID). A null value shall indicate that
             * this is unknown.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.19
             */
            vehicleId: Attribute(0x32, TlvNullable(TlvString.bound({ maxLength: 32 })))
        }
    });

    /**
     * A EnergyEvseCluster supports these elements if it supports feature Rfid.
     */
    export const RfidComponent = MutableCluster.Component({
        events: {
            /**
             * This event shall be generated when a RFID card has been read. This allows a controller to register the
             * card ID and use this to authenticate and start the charging session.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6
             */
            rfid: OptionalEvent(0x5, Priority.Info, TlvRfidEvent)
        }
    });

    /**
     * These elements and properties are present in all EnergyEvse clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x99,
        name: "EnergyEvse",
        revision: 3,

        features: {
            /**
             * Since some EVSEs cannot obtain the SoC from the vehicle, some EV charging solutions allow the consumer to
             * specify a daily charging target (for adding energy to the EV’s battery). This feature allows the consumer
             * to specify how many miles or km of additional range they need for their typical daily commute. This range
             * requirement can be converted into a daily energy demand with a target charging completion time.
             *
             * The EVSE itself can use this information (or may allow a controller such as an EMS) to compute an
             * optimized charging schedule.
             *
             * An EVSE device which includes a Device Energy Management device with the Device Energy Management cluster
             * PFR (Power Forecast Reporting) feature can use the charging preferences information to produce its power
             * forecast.
             *
             * EVSE devices that support the Device Energy Management cluster’s FA feature can have their charging
             * profiles set by a controller device such as an EMS. For example, if the EVSE advertises a simple power
             * forecast which allows the EMS to adjust over a wide range of power and time durations, then the EVSE may
             * allow the EMS to propose a revised optimized forecast (which is the charging profile). For example, a
             * solar PV ESA may also share its Forecast, so enabling an EMS to adjust the EVSE forecast to the best time
             * to charge so that any excess solar generation is used to charge the EV.
             *
             * See the Device Energy Management Cluster for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.1
             */
            chargingPreferences: BitFlag(0),

            /**
             * Vehicles and EVSEs which support ISO 15118 may allow the vehicle to report its battery size and state of
             * charge. If the EVSE supports PLC it may have a vehicle connected which optionally supports reporting of
             * its battery size and current State of Charge (SoC).
             *
             * If the EVSE supports reporting of State of Charge this feature will only work if a compatible EV is
             * connected.
             *
             * Note some EVSEs may use other undefined mechanisms to obtain vehicle State of Charge outside the scope of
             * this cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.2
             */
            soCReporting: BitFlag(1),

            /**
             * If the EVSE supports PLC, it may be able to support the Plug and Charge feature. e.g. this may allow the
             * vehicle ID to be obtained which may allow an energy management system to track energy usage per vehicle
             * (e.g. to give the owner an indicative cost of charging, or for work place charging).
             *
             * If the EVSE supports the Plug and Charge feature, it will only work if a compatible EV is connected.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.3
             */
            plugAndCharge: BitFlag(2),

            /**
             * If the EVSE is fitted with an RFID reader, it may be possible to obtain the User or Vehicle ID from an
             * RFID card. This may be used to record a charging session against a specific charging account, and may
             * optionally be used to authorize a charging session.
             *
             * An RFID event can be generated when a user taps an RFID card onto the RFID reader. The event must be
             * subscribed to by the EVSE Management cluster client. This client may use this to enable the EV to charge
             * or discharge. The lookup and authorization of RIFD UID is outside the scope of this cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.4
             */
            rfid: BitFlag(3),

            /**
             * If the EVSE can support bi-directional charging, it may be possible to request that the vehicle can
             * discharge to the home or grid.
             *
             * The charging and discharging may be controlled by a home Energy Management System (EMS) using the Device
             * Energy Management cluster of the associated Device Energy Management device. For example, an EMS may use
             * the PA (Power Adjustment) feature to continually adjust the charge/discharge current to/from the EV so as
             * to minimise the energy flow from/to the grid as the demand in the home and the solar supply to the home
             * both fluctuate.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.4.5
             */
            v2X: BitFlag(4)
        },

        attributes: {
            /**
             * Indicates the current status of the EVSE. This higher-level status is partly derived from the signaling
             * protocol as communicated between the EVSE and the vehicle through the pilot signal.
             *
             * The State attribute shall change when the EVSE detects change of condition of the EV (plugged in or
             * unplugged, whether the vehicle is asking for demand or not, and if it is charging or discharging).
             *
             * > [!NOTE]
             *
             * > SessionEnding is not really a state but a transition. However, the transition period may take a few
             *   seconds and is useful for some clean up purposes.
             *
             * The Fault state is used to indicate that the FaultState attribute is not NoError.
             *
             * A null value shall indicate that the state cannot be determined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.1
             */
            state: Attribute(0x0, TlvNullable(TlvEnum<State>())),

            /**
             * Indicates whether the EV is currently allowed to charge from or discharge to the EVSE.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.2
             */
            supplyState: Attribute(0x1, TlvEnum<SupplyState>()),

            /**
             * Indicates the type of fault detected by the EVSE (internally or as detected in the pilot signal).
             *
             * When the SupplyState attribute is DisabledError, the FaultState attribute will be one of the values
             * listed in FaultStateEnum, except NoError. For all values of SupplyState other than DisabledError, the
             * FaultState attribute shall be NoError.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.3
             */
            faultState: Attribute(0x2, TlvEnum<FaultState>()),

            /**
             * Indicates the time, in UTC, that the EVSE will automatically stop current flow to the EV.
             *
             * A null value indicates the EVSE is always enabled for charging.
             *
             * A value in the past or 0x0 indicates that EVSE charging shall be disabled. The attribute is only set via
             * the payload of the EnableCharging command.
             *
             * This attribute shall be persisted, for example a temporary power failure should not stop the vehicle from
             * being charged.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.4
             */
            chargingEnabledUntil: Attribute(0x3, TlvNullable(TlvEpochS), { persistent: true }),

            /**
             * Indicates the capacity that the circuit that the EVSE is connected to can provide. It is intended to
             * allow implementation of a self-managed network of EVSEs. It is assumed that the device will allow the
             * setting of such values by an installer.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.6
             */
            circuitCapacity: Attribute(0x5, TlvInt64.bound({ min: 0 }), { persistent: true }),

            /**
             * Indicates the minimum current that can be delivered by the EVSE to the EV.
             *
             * The attribute can be set using the EnableCharging command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.7
             */
            minimumChargeCurrent: Attribute(0x6, TlvInt64.bound({ min: 0 }), { persistent: true }),

            /**
             * Indicates the maximum current that can be delivered by the EVSE to the EV.
             *
             * This shall represent the actual maximum current offered to the EV at any time. Note that the EV can draw
             * less current than this value. For example, the EV may be limiting its power draw based on the operating
             * conditions of the battery, such as temperature and state of charge.
             *
             * The attribute can be initially set using the EnableCharging command or by adjusting the
             * UserMaximumChargeCurrent attribute.
             *
             * This attribute value shall be the minimum of:
             *
             *   • CircuitCapacity - Electrician’s installation setting
             *
             *   • CableAssemblyCurrentLimit (detected by the EVSE when the cable is plugged in)
             *
             *   • MaximumChargeCurrent field in the EnableCharging command
             *
             *   • UserMaximumChargeCurrent attribute
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.8
             */
            maximumChargeCurrent: Attribute(0x7, TlvInt64.bound({ min: 0 }), { persistent: true }),

            /**
             * Indicates a maximum current that can set by the consumer (e.g. via an app) as a preference to further
             * reduce the charging rate. This may be desirable if the home owner has a solar PV or battery storage
             * system which may only be able to deliver a limited amount of power. The consumer can manually control how
             * much they allow the EV to take.
             *
             * This attribute value shall be limited by the EVSE to be in the range of:
             *
             * MinimumChargeCurrent <= UserMaximumChargeCurrent <= MaximumChargeCurrent where MinimumChargeCurrent and
             * MaximumChargeCurrent are the values received in the EnableCharging command.
             *
             * Its default value SHOULD be initialized to the same as the CircuitCapacity attribute. This value shall be
             * persisted across reboots to ensure it does not cause charging issues during temporary power failures.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.10
             */
            userMaximumChargeCurrent: OptionalWritableAttribute(
                0x9,
                TlvInt64,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * Indicates the size of a random window over which the EVSE will randomize the start of a charging session.
             * This value is in seconds.
             *
             * This is a feature that is mandated in some markets (such as UK) where the EVSE should by default
             * randomize its start time within the randomization window. By default in the UK this should be 600s.
             *
             * For example, if the RandomizationDelayWindow is 600s (i.e. 10 minutes) and if there was a cheap rate
             * energy starting at 00:30, then the EVSE must compute a random delay between 0-599s and add this to its
             * initial planned start time.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.11
             */
            randomizationDelayWindow: OptionalWritableAttribute(
                0xa,
                TlvUInt32.bound({ max: 86400 }),
                { persistent: true, default: 600, writeAcl: AccessLevel.Manage }
            ),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
             */
            sessionId: Attribute(0x40, TlvNullable(TlvUInt32), { persistent: true }),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
             */
            sessionDuration: Attribute(0x41, TlvNullable(TlvUInt32), { persistent: true }),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
             */
            sessionEnergyCharged: Attribute(0x42, TlvNullable(TlvInt64.bound({ min: 0 })), { persistent: true })
        },

        commands: {
            /**
             * Allows a client to disable the EVSE from charging and discharging.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.1
             */
            disable: Command(0x1, TlvNoArguments, 0x1, TlvNoResponse, { timed: true }),

            /**
             * This command allows a client to enable the EVSE to charge an EV, and to provide or update the maximum and
             * minimum charge current.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2
             */
            enableCharging: Command(0x2, TlvEnableChargingRequest, 0x2, TlvNoResponse, { timed: true }),

            /**
             * Allows a client to put the EVSE into a self-diagnostics mode.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.4
             */
            startDiagnostics: OptionalCommand(0x4, TlvNoArguments, 0x4, TlvNoResponse, { timed: true })
        },

        events: {
            /**
             * This event shall be generated when the EV is plugged in.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1
             */
            evConnected: Event(0x0, Priority.Info, TlvEvConnectedEvent),

            /**
             * This event shall be generated when the EV is unplugged or not detected (having been previously plugged
             * in). When the vehicle is unplugged then the session is ended.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2
             */
            evNotDetected: Event(0x1, Priority.Info, TlvEvNotDetectedEvent),

            /**
             * This event shall be generated whenever the EV starts charging or discharging, except when an EV has
             * switched between charging and discharging under the control of the PowerAdjustment feature of the Device
             * Energy Management cluster of the associated Device Energy Management device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3
             */
            energyTransferStarted: Event(0x2, Priority.Info, TlvEnergyTransferStartedEvent),

            /**
             * This event shall be generated whenever the EV stops charging or discharging, except when an EV has
             * switched between charging and discharging under the control of the PowerAdjustment feature of the Device
             * Energy Management cluster of the associated Device Energy Management device.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4
             */
            energyTransferStopped: Event(0x3, Priority.Info, TlvEnergyTransferStoppedEvent),

            /**
             * If the EVSE detects a fault it shall generate a Fault Event. The SupplyState attribute shall be set to
             * DisabledError and the type of fault detected by the EVSE shall be stored in the FaultState attribute.
             *
             * This event shall be generated when the FaultState changes from any error state. i.e. if it changes from
             * NoError to any other state and if the error then clears, this would generate 2 events.
             *
             * It is assumed that the fault will be cleared locally on the EVSE device. When all faults have been
             * cleared, the EVSE device shall set the FaultState attribute to NoError and the SupplyState attribute
             * shall be set back to its previous state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5
             */
            fault: Event(0x4, Priority.Critical, TlvFaultEvent)
        },

        /**
         * This metadata controls which EnergyEvseCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { v2X: true }, component: V2XComponent },
            { flags: { chargingPreferences: true }, component: ChargingPreferencesComponent },
            { flags: { soCReporting: true }, component: SoCReportingComponent },
            { flags: { plugAndCharge: true }, component: PlugAndChargeComponent },
            { flags: { rfid: true }, component: RfidComponent },
            { flags: { chargingPreferences: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * Electric Vehicle Supply Equipment (EVSE) is equipment used to charge an Electric Vehicle (EV) or Plug-In Hybrid
     * Electric Vehicle. This cluster provides an interface to the functionality of Electric Vehicle Supply Equipment
     * (EVSE) management.
     *
     * Devices targeted by this cluster include Electric Vehicle Supply Equipment (EVSE). The cluster generically
     * assumes a signaling protocol (J1772 in NA and IEC61851 in Europe and Asia) between the EVSE and Electric Vehicle
     * (EV) that utilizes a pilot signal to manage the states of the charging process. [SAE J2847/3_202311] version and
     * IEC61841 define Pilot signal as a modulated DC voltage on a single wire.
     *
     * Power Line Communication (PLC) is supported by some EVSEs (e.g. for support of ISO 15118 in Europe and SAE
     * J2931/4 in NA) and may enable features such as Vehicle to Grid (V2G) or Vehicle to Home (V2H) that allows for
     * bi-directional charging/discharging of electric vehicles.
     *
     * More modern EVSE devices may optionally support ISO 15118-20 in Europe and SAE J2836/3 for NA to support
     * bi-directional charging (Vehicle to Grid - V2G) and Plug and Charge capabilities.
     *
     * This cluster definition assumes AC charging only. DC charging options may be added in future revisions of this
     * cluster.
     *
     * This cluster supports a safety mechanism that may lockout remote operation until the initial latching conditions
     * have been met. Some of the fault conditions defined in SAE J1772, such as Ground- Fault Circuit Interrupter
     * (GFCI) or Charging Circuit Interrupting Device (CCID), may require clearing by an operator by, for example,
     * pressing a button on the equipment or breaker panel.
     *
     * This EVSE cluster is written around support of a single EVSE. Having multiple EVSEs at home or a business is
     * managed by backend system and outside scope of this cluster.
     *
     * Note that in many deployments the EVSE may be outside the home and may suffer from intermittent network
     * connections (e.g. a weak Wi-Fi signal). It also allows for a charging profile to be pre-configured, in case there
     * is a temporary communications loss during a charging session.
     *
     * EnergyEvseCluster supports optional features that you can enable with the EnergyEvseCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const V2X = { v2X: true };
    const PREF = { chargingPreferences: true };
    const SOC = { soCReporting: true };
    const PNC = { plugAndCharge: true };
    const RFID = { rfid: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            dischargingEnabledUntil: MutableCluster.AsConditional(
                V2XComponent.attributes.dischargingEnabledUntil,
                { mandatoryIf: [V2X] }
            ),
            maximumDischargeCurrent: MutableCluster.AsConditional(
                V2XComponent.attributes.maximumDischargeCurrent,
                { mandatoryIf: [V2X] }
            ),
            nextChargeStartTime: MutableCluster.AsConditional(
                ChargingPreferencesComponent.attributes.nextChargeStartTime,
                { mandatoryIf: [PREF] }
            ),
            nextChargeTargetTime: MutableCluster.AsConditional(
                ChargingPreferencesComponent.attributes.nextChargeTargetTime,
                { mandatoryIf: [PREF] }
            ),
            nextChargeRequiredEnergy: MutableCluster.AsConditional(
                ChargingPreferencesComponent.attributes.nextChargeRequiredEnergy,
                { mandatoryIf: [PREF] }
            ),
            nextChargeTargetSoC: MutableCluster.AsConditional(
                ChargingPreferencesComponent.attributes.nextChargeTargetSoC,
                { mandatoryIf: [PREF] }
            ),
            approximateEvEfficiency: MutableCluster.AsConditional(
                ChargingPreferencesComponent.attributes.approximateEvEfficiency,
                { optionalIf: [PREF] }
            ),
            stateOfCharge: MutableCluster.AsConditional(
                SoCReportingComponent.attributes.stateOfCharge,
                { mandatoryIf: [SOC] }
            ),
            batteryCapacity: MutableCluster.AsConditional(
                SoCReportingComponent.attributes.batteryCapacity,
                { mandatoryIf: [SOC] }
            ),
            vehicleId: MutableCluster.AsConditional(
                PlugAndChargeComponent.attributes.vehicleId,
                { mandatoryIf: [PNC] }
            ),
            sessionEnergyDischarged: MutableCluster.AsConditional(
                V2XComponent.attributes.sessionEnergyDischarged,
                { mandatoryIf: [V2X] }
            )
        },

        commands: {
            ...Cluster.commands,
            enableDischarging: MutableCluster.AsConditional(
                V2XComponent.commands.enableDischarging,
                { mandatoryIf: [V2X] }
            ),
            setTargets: MutableCluster.AsConditional(
                ChargingPreferencesComponent.commands.setTargets,
                { mandatoryIf: [PREF] }
            ),
            getTargets: MutableCluster.AsConditional(
                ChargingPreferencesComponent.commands.getTargets,
                { mandatoryIf: [PREF] }
            ),
            clearTargets: MutableCluster.AsConditional(
                ChargingPreferencesComponent.commands.clearTargets,
                { mandatoryIf: [PREF] }
            )
        },

        events: {
            ...Cluster.events,
            rfid: MutableCluster.AsConditional(RfidComponent.events.rfid, { optionalIf: [RFID] })
        }
    });

    /**
     * This cluster supports all EnergyEvse features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type EnergyEvseCluster = EnergyEvse.Cluster;
export const EnergyEvseCluster = EnergyEvse.Cluster;
ClusterRegistry.register(EnergyEvse.Complete);
