/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";

/**
 * Definitions for the EnergyEvse cluster.
 *
 * Electric Vehicle Supply Equipment (EVSE) is equipment used to charge an Electric Vehicle (EV) or Plug-In Hybrid
 * Electric Vehicle. This cluster provides an interface to the functionality of Electric Vehicle Supply Equipment (EVSE)
 * management.
 *
 * Devices targeted by this cluster include Electric Vehicle Supply Equipment (EVSE). The cluster generically assumes a
 * signaling protocol (J1772 in NA and IEC61851 in Europe and Asia) between the EVSE and Electric Vehicle (EV) that
 * utilizes a pilot signal to manage the states of the charging process. [SAE J2847/3_202311] version and IEC61841
 * define Pilot signal as a modulated DC voltage on a single wire.
 *
 * Power Line Communication (PLC) is supported by some EVSEs (e.g. for support of ISO 15118 in Europe and SAE J2931/4 in
 * NA) and may enable features such as Vehicle to Grid (V2G) or Vehicle to Home (V2H) that allows for bi-directional
 * charging/discharging of electric vehicles.
 *
 * More modern EVSE devices may optionally support ISO 15118-20 in Europe and SAE J2836/3 for NA to support
 * bi-directional charging (Vehicle to Grid - V2G) and Plug and Charge capabilities.
 *
 * This cluster definition assumes AC charging only. DC charging options may be added in future revisions of this
 * cluster.
 *
 * This cluster supports a safety mechanism that may lockout remote operation until the initial latching conditions have
 * been met. Some of the fault conditions defined in SAE J1772, such as Ground-Fault Circuit Interrupter (GFCI) or
 * Charging Circuit Interrupting Device (CCID), may require clearing by an operator by, for example, pressing a button
 * on the equipment or breaker panel.
 *
 * This EVSE cluster is written around support of a single EVSE. Having multiple EVSEs at home or a business is managed
 * by backend system and outside scope of this cluster.
 *
 * Note that in many deployments the EVSE may be outside the home and may suffer from intermittent network connections
 * (e.g. a weak Wi-Fi signal). It also allows for a charging profile to be pre-configured, in case there is a temporary
 * communications loss during a charging session.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 9.3
 */
export declare namespace EnergyEvse {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0099;

    /**
     * Textual cluster identifier.
     */
    export const name: "EnergyEvse";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the EnergyEvse cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link EnergyEvse} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the current status of the EVSE. This higher-level status is partly derived from the signaling
         * protocol as communicated between the EVSE and the vehicle through the pilot signal.
         *
         * The State attribute shall change when the EVSE detects change of condition of the EV (plugged in or
         * unplugged, whether the vehicle is asking for demand or not, and if it is charging or discharging).
         *
         * > [!NOTE]
         *
         * > SessionEnding is not really a state but a transition. However, the transition period may take a few seconds
         *   and is useful for some clean up purposes.
         *
         * The Fault state is used to indicate that the FaultState attribute is not NoError.
         *
         * A null value shall indicate that the state cannot be determined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.1
         */
        state: State | null;

        /**
         * Indicates whether the EV is currently allowed to charge from or discharge to the EVSE.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.2
         */
        supplyState: SupplyState;

        /**
         * Indicates the type of fault detected by the EVSE (internally or as detected in the pilot signal).
         *
         * When the SupplyState attribute is DisabledError, the FaultState attribute will be one of the values listed in
         * FaultStateEnum, except NoError. For all values of SupplyState other than DisabledError, the FaultState
         * attribute shall be NoError.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.3
         */
        faultState: FaultState;

        /**
         * Indicates the time, in UTC, that the EVSE will automatically stop current flow to the EV.
         *
         * A null value indicates the EVSE is always enabled for charging.
         *
         * A value in the past or 0x0 indicates that EVSE charging shall be disabled. The attribute is only set via the
         * payload of the EnableCharging command.
         *
         * This attribute shall be persisted, for example a temporary power failure should not stop the vehicle from
         * being charged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.4
         */
        chargingEnabledUntil: number | null;

        /**
         * Indicates the capacity that the circuit that the EVSE is connected to can provide. It is intended to allow
         * implementation of a self-managed network of EVSEs. It is assumed that the device will allow the setting of
         * such values by an installer.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.6
         */
        circuitCapacity: number | bigint;

        /**
         * Indicates the minimum current that can be delivered by the EVSE to the EV.
         *
         * The attribute can be set using the EnableCharging command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.7
         */
        minimumChargeCurrent: number | bigint;

        /**
         * Indicates the maximum current that can be delivered by the EVSE to the EV.
         *
         * This shall represent the actual maximum current offered to the EV at any time. Note that the EV can draw less
         * current than this value. For example, the EV may be limiting its power draw based on the operating conditions
         * of the battery, such as temperature and state of charge.
         *
         * The attribute can be initially set using the EnableCharging command or by adjusting the
         * UserMaximumChargeCurrent attribute.
         *
         * This attribute value shall be the minimum of:
         *
         *   - CircuitCapacity - Electrician’s installation setting
         *
         *   - CableAssemblyCurrentLimit (detected by the EVSE when the cable is plugged in)
         *
         *   - MaximumChargeCurrent field in the EnableCharging command
         *
         *   - UserMaximumChargeCurrent attribute
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.8
         */
        maximumChargeCurrent: number | bigint;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionId: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionDuration: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionEnergyCharged: number | bigint | null;

        /**
         * Indicates a maximum current that can set by the consumer (e.g. via an app) as a preference to further reduce
         * the charging rate. This may be desirable if the home owner has a solar PV or battery storage system which may
         * only be able to deliver a limited amount of power. The consumer can manually control how much they allow the
         * EV to take.
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
        userMaximumChargeCurrent?: number | bigint;

        /**
         * Indicates the size of a random window over which the EVSE will randomize the start of a charging session.
         * This value is in seconds.
         *
         * This is a feature that is mandated in some markets (such as UK) where the EVSE should by default randomize
         * its start time within the randomization window. By default in the UK this should be 600s.
         *
         * For example, if the RandomizationDelayWindow is 600s (i.e. 10 minutes) and if there was a cheap rate energy
         * starting at 00:30, then the EVSE must compute a random delay between 0-599s and add this to its initial
         * planned start time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.11
         */
        randomizationDelayWindow?: number;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "V2X".
     */
    export interface V2XAttributes {
        /**
         * Indicates the time, in UTC, that the EVSE will automatically stop current flow from the EV.
         *
         * A null value indicates the EVSE is always enabled for discharging.
         *
         * A value in the past or 0x0 indicates that EVSE discharging shall be disabled. The attribute is only set via
         * the payload of the EnableDischarging command.
         *
         * This attribute shall be persisted, for example a temporary power failure should not stop the vehicle from
         * being discharged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.5
         */
        dischargingEnabledUntil: number | null;

        /**
         * Indicates the maximum current that can be received by the EVSE from the EV.
         *
         * This attribute can be set using the EnableDischarging command.
         *
         * This attribute value shall be the minimum of:
         *
         *   - CircuitCapacity - Electrician’s installation setting
         *
         *   - CableAssemblyCurrentLimit (detected by the EVSE when the cable is plugged in)
         *
         *   - MaximumDischargeCurrent field in the EnableDischarging command
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.9
         */
        maximumDischargeCurrent: number | bigint;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionEnergyDischarged: number | bigint | null;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "ChargingPreferences".
     */
    export interface ChargingPreferencesAttributes {
        /**
         * Indicates the time, in UTC, when the EVSE plans to start the next scheduled charge based on the charging
         * preferences.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.12
         */
        nextChargeStartTime: number | null;

        /**
         * Indicates the time, in UTC, when the EVSE SHOULD complete the next scheduled charge based on the charging
         * preferences.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.13
         */
        nextChargeTargetTime: number | null;

        /**
         * Indicates the amount of energy that the EVSE is going to attempt to add to the vehicle in the next charging
         * target.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled, or
         * that the next ChargingTargetStruct is using the TargetSoC value to charge the vehicle.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.14
         */
        nextChargeRequiredEnergy: number | bigint | null;

        /**
         * Indicates the target SoC the EVSE is going to attempt to reach when the vehicle is next charged.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled, or
         * that the next ChargingTargetStruct is using the AddedEnergy value to charge the vehicle.
         *
         * If the SOC feature is not supported, only the values null and 100% are supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.15
         */
        nextChargeTargetSoC: number | null;

        /**
         * Indicates the vehicle efficiency rating for a connected vehicle.
         *
         * This can be used to help indicate to the user approximately how many miles or km of range will be added. It
         * allows user interfaces to display to the user simpler terms that they can relate to compared to kWh.
         *
         * This is value is stored in km per kWh multiplied by a scaling factor of 1000.
         *
         * A null value indicates that the EV efficiency is unknown and the NextChargeRequiredEnergy attribute cannot be
         * converted from Wh to miles or km.
         *
         * To convert from Wh into Range:
         *
         * AddedRange (km) = AddedEnergy (Wh) x ApproxEVEfficiency (km/kWh x 1000) AddedRange (Miles) = AddedEnergy (Wh)
         * x ApproxEVEfficiency (km/kWh x 1000) x 0.6213
         *
         * Example:
         *
         * ApproxEVEfficiency (km/kWh x 1000): 4800 (i.e. 4.8km/kWh x 1000) AddedEnergy (Wh): 10,000
         *
         * AddedRange (km) = 10,000 x 4800 / 1,000,000 = 48 km AddedRange (Miles) = AddedEnergy (Wh) x
         * ApproxEVEfficiency (km/kWh x 1000) x 0.6213 = 29.82 Miles
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.16
         */
        approximateEvEfficiency?: number | null;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "SoCReporting".
     */
    export interface SoCReportingAttributes {
        /**
         * Indicates the state of charge of the EV battery in steps of 1%. The values are in the 0-100%. This attribute
         * is only available on EVSEs which can read the state of charge from the vehicle and that support the SOC
         * feature. If the StateOfCharge cannot be read from the vehicle it shall be returned with a NULL value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.17
         */
        stateOfCharge: number | null;

        /**
         * Indicates the capacity of the EV battery in mWh. This value is always positive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.18
         */
        batteryCapacity: number | bigint | null;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "PlugAndCharge".
     */
    export interface PlugAndChargeAttributes {
        /**
         * Indicates the vehicle ID read by the EVSE via ISO-15118 using the PNC feature, if the EVSE supports this
         * capability.
         *
         * The field may be based on the e-Mobility Account Identifier (EMAID).
         *
         * A null value shall indicate that this is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.19
         */
        vehicleId: string | null;
    }

    /**
     * Attributes that may appear in {@link EnergyEvse}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current status of the EVSE. This higher-level status is partly derived from the signaling
         * protocol as communicated between the EVSE and the vehicle through the pilot signal.
         *
         * The State attribute shall change when the EVSE detects change of condition of the EV (plugged in or
         * unplugged, whether the vehicle is asking for demand or not, and if it is charging or discharging).
         *
         * > [!NOTE]
         *
         * > SessionEnding is not really a state but a transition. However, the transition period may take a few seconds
         *   and is useful for some clean up purposes.
         *
         * The Fault state is used to indicate that the FaultState attribute is not NoError.
         *
         * A null value shall indicate that the state cannot be determined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.1
         */
        state: State | null;

        /**
         * Indicates whether the EV is currently allowed to charge from or discharge to the EVSE.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.2
         */
        supplyState: SupplyState;

        /**
         * Indicates the type of fault detected by the EVSE (internally or as detected in the pilot signal).
         *
         * When the SupplyState attribute is DisabledError, the FaultState attribute will be one of the values listed in
         * FaultStateEnum, except NoError. For all values of SupplyState other than DisabledError, the FaultState
         * attribute shall be NoError.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.3
         */
        faultState: FaultState;

        /**
         * Indicates the time, in UTC, that the EVSE will automatically stop current flow to the EV.
         *
         * A null value indicates the EVSE is always enabled for charging.
         *
         * A value in the past or 0x0 indicates that EVSE charging shall be disabled. The attribute is only set via the
         * payload of the EnableCharging command.
         *
         * This attribute shall be persisted, for example a temporary power failure should not stop the vehicle from
         * being charged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.4
         */
        chargingEnabledUntil: number | null;

        /**
         * Indicates the capacity that the circuit that the EVSE is connected to can provide. It is intended to allow
         * implementation of a self-managed network of EVSEs. It is assumed that the device will allow the setting of
         * such values by an installer.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.6
         */
        circuitCapacity: number | bigint;

        /**
         * Indicates the minimum current that can be delivered by the EVSE to the EV.
         *
         * The attribute can be set using the EnableCharging command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.7
         */
        minimumChargeCurrent: number | bigint;

        /**
         * Indicates the maximum current that can be delivered by the EVSE to the EV.
         *
         * This shall represent the actual maximum current offered to the EV at any time. Note that the EV can draw less
         * current than this value. For example, the EV may be limiting its power draw based on the operating conditions
         * of the battery, such as temperature and state of charge.
         *
         * The attribute can be initially set using the EnableCharging command or by adjusting the
         * UserMaximumChargeCurrent attribute.
         *
         * This attribute value shall be the minimum of:
         *
         *   - CircuitCapacity - Electrician’s installation setting
         *
         *   - CableAssemblyCurrentLimit (detected by the EVSE when the cable is plugged in)
         *
         *   - MaximumChargeCurrent field in the EnableCharging command
         *
         *   - UserMaximumChargeCurrent attribute
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.8
         */
        maximumChargeCurrent: number | bigint;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionId: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionDuration: number | null;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionEnergyCharged: number | bigint | null;

        /**
         * Indicates a maximum current that can set by the consumer (e.g. via an app) as a preference to further reduce
         * the charging rate. This may be desirable if the home owner has a solar PV or battery storage system which may
         * only be able to deliver a limited amount of power. The consumer can manually control how much they allow the
         * EV to take.
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
        userMaximumChargeCurrent: number | bigint;

        /**
         * Indicates the size of a random window over which the EVSE will randomize the start of a charging session.
         * This value is in seconds.
         *
         * This is a feature that is mandated in some markets (such as UK) where the EVSE should by default randomize
         * its start time within the randomization window. By default in the UK this should be 600s.
         *
         * For example, if the RandomizationDelayWindow is 600s (i.e. 10 minutes) and if there was a cheap rate energy
         * starting at 00:30, then the EVSE must compute a random delay between 0-599s and add this to its initial
         * planned start time.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.11
         */
        randomizationDelayWindow: number;

        /**
         * Indicates the time, in UTC, that the EVSE will automatically stop current flow from the EV.
         *
         * A null value indicates the EVSE is always enabled for discharging.
         *
         * A value in the past or 0x0 indicates that EVSE discharging shall be disabled. The attribute is only set via
         * the payload of the EnableDischarging command.
         *
         * This attribute shall be persisted, for example a temporary power failure should not stop the vehicle from
         * being discharged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.5
         */
        dischargingEnabledUntil: number | null;

        /**
         * Indicates the maximum current that can be received by the EVSE from the EV.
         *
         * This attribute can be set using the EnableDischarging command.
         *
         * This attribute value shall be the minimum of:
         *
         *   - CircuitCapacity - Electrician’s installation setting
         *
         *   - CableAssemblyCurrentLimit (detected by the EVSE when the cable is plugged in)
         *
         *   - MaximumDischargeCurrent field in the EnableDischarging command
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.9
         */
        maximumDischargeCurrent: number | bigint;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8
         */
        sessionEnergyDischarged: number | bigint | null;

        /**
         * Indicates the time, in UTC, when the EVSE plans to start the next scheduled charge based on the charging
         * preferences.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.12
         */
        nextChargeStartTime: number | null;

        /**
         * Indicates the time, in UTC, when the EVSE SHOULD complete the next scheduled charge based on the charging
         * preferences.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.13
         */
        nextChargeTargetTime: number | null;

        /**
         * Indicates the amount of energy that the EVSE is going to attempt to add to the vehicle in the next charging
         * target.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled, or
         * that the next ChargingTargetStruct is using the TargetSoC value to charge the vehicle.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.14
         */
        nextChargeRequiredEnergy: number | bigint | null;

        /**
         * Indicates the target SoC the EVSE is going to attempt to reach when the vehicle is next charged.
         *
         * A null value indicates that there is no scheduled charging (for example, the EVSE Mode is set to use Manual
         * mode tag), or that the vehicle is not plugged in with the SupplyState indicating that charging is enabled, or
         * that the next ChargingTargetStruct is using the AddedEnergy value to charge the vehicle.
         *
         * If the SOC feature is not supported, only the values null and 100% are supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.15
         */
        nextChargeTargetSoC: number | null;

        /**
         * Indicates the vehicle efficiency rating for a connected vehicle.
         *
         * This can be used to help indicate to the user approximately how many miles or km of range will be added. It
         * allows user interfaces to display to the user simpler terms that they can relate to compared to kWh.
         *
         * This is value is stored in km per kWh multiplied by a scaling factor of 1000.
         *
         * A null value indicates that the EV efficiency is unknown and the NextChargeRequiredEnergy attribute cannot be
         * converted from Wh to miles or km.
         *
         * To convert from Wh into Range:
         *
         * AddedRange (km) = AddedEnergy (Wh) x ApproxEVEfficiency (km/kWh x 1000) AddedRange (Miles) = AddedEnergy (Wh)
         * x ApproxEVEfficiency (km/kWh x 1000) x 0.6213
         *
         * Example:
         *
         * ApproxEVEfficiency (km/kWh x 1000): 4800 (i.e. 4.8km/kWh x 1000) AddedEnergy (Wh): 10,000
         *
         * AddedRange (km) = 10,000 x 4800 / 1,000,000 = 48 km AddedRange (Miles) = AddedEnergy (Wh) x
         * ApproxEVEfficiency (km/kWh x 1000) x 0.6213 = 29.82 Miles
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.16
         */
        approximateEvEfficiency: number | null;

        /**
         * Indicates the state of charge of the EV battery in steps of 1%. The values are in the 0-100%. This attribute
         * is only available on EVSEs which can read the state of charge from the vehicle and that support the SOC
         * feature. If the StateOfCharge cannot be read from the vehicle it shall be returned with a NULL value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.17
         */
        stateOfCharge: number | null;

        /**
         * Indicates the capacity of the EV battery in mWh. This value is always positive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.18
         */
        batteryCapacity: number | bigint | null;

        /**
         * Indicates the vehicle ID read by the EVSE via ISO-15118 using the PNC feature, if the EVSE supports this
         * capability.
         *
         * The field may be based on the e-Mobility Account Identifier (EMAID).
         *
         * A null value shall indicate that this is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.8.19
         */
        vehicleId: string | null;
    }

    /**
     * {@link EnergyEvse} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Allows a client to disable the EVSE from charging and discharging.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.1
         */
        disable(): MaybePromise;

        /**
         * This command allows a client to enable the EVSE to charge an EV, and to provide or update the maximum and
         * minimum charge current.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2
         */
        enableCharging(request: EnableChargingRequest): MaybePromise;

        /**
         * Allows a client to put the EVSE into a self-diagnostics mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.4
         */
        startDiagnostics(): MaybePromise;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "V2X".
     */
    export interface V2XCommands {
        /**
         * Upon receipt, this shall allow a client to enable the discharge of an EV, and to provide or update the
         * maximum discharge current.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3
         */
        enableDischarging(request: EnableDischargingRequest): MaybePromise;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "ChargingPreferences".
     */
    export interface ChargingPreferencesCommands {
        /**
         * Allows a client to set the user specified charging targets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5
         */
        setTargets(request: SetTargetsRequest): MaybePromise;

        /**
         * Allows a client to retrieve the current set of charging targets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.6
         */
        getTargets(): MaybePromise<GetTargetsResponse>;

        /**
         * Allows a client to clear all stored charging targets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.8
         */
        clearTargets(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link EnergyEvse}.
     */
    export interface Commands extends
        BaseCommands,
        V2XCommands,
        ChargingPreferencesCommands
    {}

    /**
     * {@link EnergyEvse} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when the EV is plugged in.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1
         */
        evConnected: EvConnectedEvent;

        /**
         * This event shall be generated when the EV is unplugged or not detected (having been previously plugged in).
         * When the vehicle is unplugged then the session is ended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2
         */
        evNotDetected: EvNotDetectedEvent;

        /**
         * This event shall be generated whenever the EV starts charging or discharging, except when an EV has switched
         * between charging and discharging under the control of the PowerAdjustment feature of the Device Energy
         * Management cluster of the associated Device Energy Management device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3
         */
        energyTransferStarted: EnergyTransferStartedEvent;

        /**
         * This event shall be generated whenever the EV stops charging or discharging, except when an EV has switched
         * between charging and discharging under the control of the PowerAdjustment feature of the Device Energy
         * Management cluster of the associated Device Energy Management device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4
         */
        energyTransferStopped: EnergyTransferStoppedEvent;

        /**
         * If the EVSE detects a fault it shall generate a Fault Event. The SupplyState attribute shall be set to
         * DisabledError and the type of fault detected by the EVSE shall be stored in the FaultState attribute.
         *
         * This event shall be generated when the FaultState changes from any error state. i.e. if it changes from
         * NoError to any other state and if the error then clears, this would generate 2 events.
         *
         * It is assumed that the fault will be cleared locally on the EVSE device. When all faults have been cleared,
         * the EVSE device shall set the FaultState attribute to NoError and the SupplyState attribute shall be set back
         * to its previous state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5
         */
        fault: FaultEvent;
    }

    /**
     * {@link EnergyEvse} supports these elements if it supports feature "Rfid".
     */
    export interface RfidEvents {
        /**
         * This event shall be generated when a RFID card has been read. This allows a controller to register the card
         * ID and use this to authenticate and start the charging session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6
         */
        rfid?: RfidEvent;
    }

    /**
     * Events that may appear in {@link EnergyEvse}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the EV is plugged in.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1
         */
        evConnected: EvConnectedEvent;

        /**
         * This event shall be generated when the EV is unplugged or not detected (having been previously plugged in).
         * When the vehicle is unplugged then the session is ended.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2
         */
        evNotDetected: EvNotDetectedEvent;

        /**
         * This event shall be generated whenever the EV starts charging or discharging, except when an EV has switched
         * between charging and discharging under the control of the PowerAdjustment feature of the Device Energy
         * Management cluster of the associated Device Energy Management device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3
         */
        energyTransferStarted: EnergyTransferStartedEvent;

        /**
         * This event shall be generated whenever the EV stops charging or discharging, except when an EV has switched
         * between charging and discharging under the control of the PowerAdjustment feature of the Device Energy
         * Management cluster of the associated Device Energy Management device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4
         */
        energyTransferStopped: EnergyTransferStoppedEvent;

        /**
         * If the EVSE detects a fault it shall generate a Fault Event. The SupplyState attribute shall be set to
         * DisabledError and the type of fault detected by the EVSE shall be stored in the FaultState attribute.
         *
         * This event shall be generated when the FaultState changes from any error state. i.e. if it changes from
         * NoError to any other state and if the error then clears, this would generate 2 events.
         *
         * It is assumed that the fault will be cleared locally on the EVSE device. When all faults have been cleared,
         * the EVSE device shall set the FaultState attribute to NoError and the SupplyState attribute shall be set back
         * to its previous state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5
         */
        fault: FaultEvent;

        /**
         * This event shall be generated when a RFID card has been read. This allows a controller to register the card
         * ID and use this to authenticate and start the charging session.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6
         */
        rfid: RfidEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { v2X: true }, attributes: V2XAttributes, commands: V2XCommands },
        {
            flags: { chargingPreferences: true },
            attributes: ChargingPreferencesAttributes,
            commands: ChargingPreferencesCommands
        },
        { flags: { soCReporting: true }, attributes: SoCReportingAttributes },
        { flags: { plugAndCharge: true }, attributes: PlugAndChargeAttributes },
        { flags: { rfid: true }, events: RfidEvents }
    ];

    export type Features = "ChargingPreferences" | "SoCReporting" | "PlugAndCharge" | "Rfid" | "V2X";

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
     * This command allows a client to enable the EVSE to charge an EV, and to provide or update the maximum and minimum
     * charge current.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2
     */
    export declare class EnableChargingRequest {
        constructor(values?: Partial<EnableChargingRequest>);

        /**
         * This field shall indicate the expiry time, in UTC, when charging will be automatically disabled.
         *
         * A value in the past in this field shall disable the EVSE charging whereas a null value shall enable it
         * permanently.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2.1
         */
        chargingEnabledUntil: number | null;

        /**
         * This field shall indicate the minimum current that can be delivered by the EVSE to the EV in trickle mode.
         * The EVSE current limit can be advertised to an EV in 0.6A steps.
         *
         * The value of the MinimumChargeCurrent attribute shall be set to the value of this field (see Section 9.3.8.7,
         * “MinimumChargeCurrent Attribute” for further details).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.2.2
         */
        minimumChargeCurrent: number | bigint;

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
        maximumChargeCurrent: number | bigint;
    };

    /**
     * Upon receipt, this shall allow a client to enable the discharge of an EV, and to provide or update the maximum
     * discharge current.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3
     */
    export declare class EnableDischargingRequest {
        constructor(values?: Partial<EnableDischargingRequest>);

        /**
         * This field shall indicate the expiry time, in UTC, when discharging will be automatically disabled.
         *
         * A value in the past in this field shall disable the EVSE discharging whereas a null value shall enable EVSE
         * discharging permanently.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3.1
         */
        dischargingEnabledUntil: number | null;

        /**
         * This field shall indicate the maximum current that can be received by the EVSE from the EV. The EVSE current
         * limit can be advertised to an EV in 0.6A steps. The value of the MaximumDischargeCurrent attribute shall be
         * stored and persisted across reboots by the EVSE to the value of this field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.3.2
         */
        maximumDischargeCurrent: number | bigint;
    };

    /**
     * Allows a client to set the user specified charging targets.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5
     */
    export declare class SetTargetsRequest {
        constructor(values?: Partial<SetTargetsRequest>);

        /**
         * This field shall indicate a list of up to 7 sets of daily charging targets together with their associated
         * days of the week. Each of the days of the week may only be included in a single ChargingTargetSchedule within
         * this list field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.5.1
         */
        chargingTargetSchedules: ChargingTargetSchedule[];
    };

    /**
     * The GetTargetsResponse is sent in response to the GetTargets Command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.7
     */
    export declare class GetTargetsResponse {
        constructor(values?: Partial<GetTargetsResponse>);

        /**
         * This field shall indicate a list of up to 7 sets of daily charging targets together with their associated
         * days of the week.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.9.7.1
         */
        chargingTargetSchedules: ChargingTargetSchedule[];
    };

    /**
     * This event shall be generated when the EV is plugged in.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1
     */
    export declare class EvConnectedEvent {
        constructor(values?: Partial<EvConnectedEvent>);

        /**
         * This is the new session ID created after the vehicle is plugged in.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.1.1
         */
        sessionId: number;
    };

    /**
     * This event shall be generated when the EV is unplugged or not detected (having been previously plugged in). When
     * the vehicle is unplugged then the session is ended.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2
     */
    export declare class EvNotDetectedEvent {
        constructor(values?: Partial<EvNotDetectedEvent>);

        /**
         * This field shall indicate the current value of the SessionID attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.1
         */
        sessionId: number;

        /**
         * This field shall indicate the value of the State attribute prior to the EV not being detected.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.2
         */
        state: State;

        /**
         * This field shall indicate the total duration of the session, from the start of the session when the EV was
         * plugged in, until it was unplugged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.3
         */
        sessionDuration: number;

        /**
         * This field shall indicate the total amount of energy transferred from the EVSE to the EV during the session.
         *
         * Note that if bi-directional charging occurs during the session, then this value shall only include the sum of
         * energy transferred from the EVSE to the EV, and shall NOT be a net value of charging and discharging energy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.4
         */
        sessionEnergyCharged: number | bigint;

        /**
         * This field shall indicate the total amount of energy transferred from the EV to the EVSE during the session.
         *
         * Note that if bi-directional discharging occurs during the session, then this value shall only include the sum
         * of energy transferred from the EV to the EVSE, and shall NOT be a net value of charging and discharging
         * energy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.2.5
         */
        sessionEnergyDischarged?: number | bigint;
    };

    /**
     * This event shall be generated whenever the EV starts charging or discharging, except when an EV has switched
     * between charging and discharging under the control of the PowerAdjustment feature of the Device Energy Management
     * cluster of the associated Device Energy Management device.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3
     */
    export declare class EnergyTransferStartedEvent {
        constructor(values?: Partial<EnergyTransferStartedEvent>);

        /**
         * This field shall indicate the value of the SessionID attribute at the time the event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.1
         */
        sessionId: number;

        /**
         * This field shall indicate the value of the State attribute at the time the event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.2
         */
        state: State;

        /**
         * This field shall indicate the value of the maximum charging current at the time the event was generated.
         *
         * A non-zero value indicates that the EV has been enabled for charging and the value is taken directly from the
         * MaximumChargeCurrent attribute. A zero value indicates that the EV has not been enabled for charging.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.3
         */
        maximumCurrent: number | bigint;

        /**
         * This field shall indicate the value of the maximum discharging current at the time the event was generated.
         *
         * A non-zero value indicates that the EV has been enabled for discharging and the value is taken directly from
         * the MaximumDischargeCurrent attribute. A zero value indicates that the EV has not been enabled for
         * discharging.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.3.4
         */
        maximumDischargeCurrent?: number | bigint;
    };

    /**
     * This event shall be generated whenever the EV stops charging or discharging, except when an EV has switched
     * between charging and discharging under the control of the PowerAdjustment feature of the Device Energy Management
     * cluster of the associated Device Energy Management device.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4
     */
    export declare class EnergyTransferStoppedEvent {
        constructor(values?: Partial<EnergyTransferStoppedEvent>);

        /**
         * This field shall indicate the value of the SessionID attribute prior to the energy transfer stopping.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.1
         */
        sessionId: number;

        /**
         * This field shall indicate the value of the State attribute prior to the energy transfer stopping.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.2
         */
        state: State;

        /**
         * This field shall indicate the reason why the energy transferred stopped.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.3
         */
        reason: EnergyTransferStoppedReason;

        /**
         * This field shall indicate the amount of energy transferred from the EVSE to the EV since the previous
         * EnergyTransferStarted event, in mWh.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.4
         */
        energyTransferred: number | bigint;

        /**
         * This field shall indicate the amount of energy transferred from the EV to the EVSE since the previous
         * EnergyTransferStarted event, in mWh.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.4.5
         */
        energyDischarged?: number | bigint;
    };

    /**
     * If the EVSE detects a fault it shall generate a Fault Event. The SupplyState attribute shall be set to
     * DisabledError and the type of fault detected by the EVSE shall be stored in the FaultState attribute.
     *
     * This event shall be generated when the FaultState changes from any error state. i.e. if it changes from NoError
     * to any other state and if the error then clears, this would generate 2 events.
     *
     * It is assumed that the fault will be cleared locally on the EVSE device. When all faults have been cleared, the
     * EVSE device shall set the FaultState attribute to NoError and the SupplyState attribute shall be set back to its
     * previous state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5
     */
    export declare class FaultEvent {
        constructor(values?: Partial<FaultEvent>);

        /**
         * This field shall indicate the value of the SessionID attribute prior to the Fault State being changed. A
         * value of null indicates no sessions have occurred before the fault occurred.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.1
         */
        sessionId: number | null;

        /**
         * This field shall indicate the value of the State attribute prior to the Fault State being changed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.2
         */
        state: State;

        /**
         * This field shall indicate the value of the FaultState attribute prior to the Fault State being changed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.3
         */
        faultStatePreviousState: FaultState;

        /**
         * This field shall indicate the current value of the FaultState attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.5.4
         */
        faultStateCurrentState: FaultState;
    };

    /**
     * This event shall be generated when a RFID card has been read. This allows a controller to register the card ID
     * and use this to authenticate and start the charging session.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6
     */
    export declare class RfidEvent {
        constructor(values?: Partial<RfidEvent>);

        /**
         * The UID field (ISO 14443A UID) is either 4, 7 or 10 bytes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.10.6.1
         */
        uid: Bytes;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.1
     */
    export declare class TargetDayOfWeek {
        constructor(values?: Partial<TargetDayOfWeek> | number);

        /**
         * Sunday
         */
        sunday?: boolean;

        /**
         * Monday
         */
        monday?: boolean;

        /**
         * Tuesday
         */
        tuesday?: boolean;

        /**
         * Wednesday
         */
        wednesday?: boolean;

        /**
         * Thursday
         */
        thursday?: boolean;

        /**
         * Friday
         */
        friday?: boolean;

        /**
         * Saturday
         */
        saturday?: boolean;
    };

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
     * This represents a single user specified charging target for an EV.
     *
     * An EVSE or EMS system optimizer may use this information to take the Time of Use Tariff, grid carbon intensity,
     * local generation (solar PV) into account to provide the cheapest and cleanest energy to the EV.
     *
     * The optimization strategy is not defined here, however in simple terms, the AddedEnergy requirement can be
     * fulfilled by knowing the charging Power (W) and the time needed to charge.
     *
     * To compute the Charging Time: Required Energy (Wh) = Power (W) x ChargingTime (s) / 3600
     *
     * Therefore: ChargingTime (s) = (3600 x RequiredEnergy (wH)) / Power (W)
     *
     * To compute the charging time: Charging StartTime = TargetTimeMinutesPastMidnight - ChargingTime
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6
     */
    export declare class ChargingTarget {
        constructor(values?: Partial<ChargingTarget>);

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
        targetTimeMinutesPastMidnight: number;

        /**
         * This field represents the target SoC that the vehicle should be charged to before the
         * TargetTimeMinutesPastMidnight.
         *
         * If the EVSE supports the SOC feature and can obtain the SoC of the vehicle:
         *
         *   - the TargetSoC field shall take precedence over the AddedEnergy field.
         *
         *   - the EVSE SHOULD charge to the TargetSoC and then stop the charging automatically when it reaches that
         *     point.
         *
         *   - if the TargetSoC value is set to 100% then the EVSE SHOULD continue to charge the vehicle until the
         *     vehicle decides to stop charging.
         *
         * If the EVSE does not support the SOC feature or cannot obtain the SoC of the vehicle:
         *
         *   - the AddedEnergy field shall take precedence over the TargetSoC field, and if the EVSE does not support
         *     the SOC feature then the TargetSoC field may only take the values null or 100%.
         *
         *   - if the AddedEnergy field has not been provided, the EVSE SHOULD assume the vehicle is empty and charge
         *     until the vehicle stops demanding a charge.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.6.2
         */
        targetSoC?: number;

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
        addedEnergy?: number | bigint;
    };

    /**
     * This represents a set of user specified charging targets for an EV for a set of specified days.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.7
     */
    export declare class ChargingTargetSchedule {
        constructor(values?: Partial<ChargingTargetSchedule>);

        /**
         * This field shall indicate the days of the week that the charging targets SHOULD be associated to. This field
         * is a bitmap and therefore the associated targets could be applied to multiple days.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.8
         */
        dayOfWeekForSequence: TargetDayOfWeek;

        /**
         * This field shall indicate a list of up to 10 charging targets for each of the associated days of the week.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.3.7.9
         */
        chargingTargets: ChargingTarget[];
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link EnergyEvse}.
     */
    export const Cluster: ClusterType.WithCompat<typeof EnergyEvse, EnergyEvse>;

    /**
     * @deprecated Use {@link EnergyEvse}.
     */
    export const Complete: typeof EnergyEvse;

    export const Typing: EnergyEvse;
}

/**
 * @deprecated Use {@link EnergyEvse}.
 */
export declare const EnergyEvseCluster: typeof EnergyEvse;

export interface EnergyEvse extends ClusterTyping {
    Attributes: EnergyEvse.Attributes;
    Commands: EnergyEvse.Commands;
    Events: EnergyEvse.Events;
    Features: EnergyEvse.Features;
    Components: EnergyEvse.Components;
}
