/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute, Command, OptionalCommand, Event, OptionalEvent } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvUInt8, TlvUInt32, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { OperationalState as OperationalStateNamespace } from "./operational-state.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace RvcOperationalState {
    /**
     * The values defined herein are applicable to this derived cluster of Operational State only and are additional to
     * the set of values defined in Operational State itself.
     *
     * RVC Pause Compatibility defines the compatibility of the states this cluster defines with the Pause command.
     *
     * ### Table 13. RVC Pause Compatibility
     *
     * RVC Resume Compatibility defines the compatibility of the states this cluster defines with the Resume command.
     *
     * ### Table 14. RVC Resume Compatibility
     *
     * While in the Charging or Docked states, the device shall NOT attempt to resume unless it transitioned to those
     * states while operating and can resume, such as, for example, if it is recharging while in a cleaning cycle. Else,
     * if the operational state is Charging or Docked but there’s no operation to resume or the operation can’t be
     * resumed, the device shall respond with an OperationalCommandResponse command with an ErrorStateID of
     * CommandInvalidInState but take no further action.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 7.4.4.1
     */
    export enum OperationalState {
        /**
         * The device is stopped
         */
        Stopped = 0,

        /**
         * The device is operating
         */
        Running = 1,

        /**
         * The device is paused during an operation
         */
        Paused = 2,

        /**
         * The device is in an error state
         */
        Error = 3,

        /**
         * The device is en route to the charging dock
         */
        SeekingCharger = 64,

        /**
         * The device is charging
         */
        Charging = 65,

        /**
         * The device is on the dock, not charging
         */
        Docked = 66,

        /**
         * The device is automatically emptying its own dust bin, such as to a dock
         */
        EmptyingDustBin = 67,

        /**
         * The device is automatically cleaning its own mopping device, such as on a dock
         */
        CleaningMop = 68,

        /**
         * The device is automatically filling its own clean water tank for use when mopping, such as from a dock
         */
        FillingWaterTank = 69,

        /**
         * The device is processing acquired data to update its maps
         */
        UpdatingMaps = 70
    }

    /**
     * The OperationalStateStruct is used to indicate a possible state of the device.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.2
     */
    export const TlvOperationalStateStruct = TlvObject({
        /**
         * This shall be populated with a value from the OperationalStateEnum.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.2.1
         */
        operationalStateId: TlvField(0, TlvEnum<OperationalState | OperationalStateNamespace.OperationalStateEnum>()),

        /**
         * This field is present when the OperationalStateID is from the set reserved for Manufacturer Specific States.
         * If present, this shall contain a human-readable description of the operational state.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.2.2
         */
        operationalStateLabel: TlvOptionalField(1, TlvString.bound({ maxLength: 64 }))
    });

    /**
     * The OperationalStateStruct is used to indicate a possible state of the device.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.2
     */
    export interface OperationalStateStruct extends TypeFromSchema<typeof TlvOperationalStateStruct> {}

    /**
     * The values defined herein are applicable to this derived cluster of Operational State only and are additional to
     * the set of values defined in Operational State itself.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 7.4.4.2
     */
    export enum ErrorState {
        /**
         * The device is not in an error state
         */
        NoError = 0,

        /**
         * The device is unable to start or resume operation
         */
        UnableToStartOrResume = 1,

        /**
         * The device was unable to complete the current operation
         */
        UnableToCompleteOperation = 2,

        /**
         * The device cannot process the command in its current state
         */
        CommandInvalidInState = 3,

        /**
         * The device has failed to find or reach the charging dock
         */
        FailedToFindChargingDock = 64,

        /**
         * The device is stuck and requires manual intervention
         */
        Stuck = 65,

        /**
         * The device has detected that its dust bin is missing
         */
        DustBinMissing = 66,

        /**
         * The device has detected that its dust bin is full
         */
        DustBinFull = 67,

        /**
         * The device has detected that its clean water tank is empty
         */
        WaterTankEmpty = 68,

        /**
         * The device has detected that its clean water tank is missing
         */
        WaterTankMissing = 69,

        /**
         * The device has detected that its water tank lid is open
         */
        WaterTankLidOpen = 70,

        /**
         * The device has detected that its cleaning pad is missing
         */
        MopCleaningPadMissing = 71,

        /**
         * The device is unable to start or to continue operating due to a low battery
         */
        LowBattery = 72,

        /**
         * The device is unable to move to an area where it was asked to operate, such as by setting the ServiceArea
         * cluster’s SelectedAreas attribute, due to an obstruction. For example, the obstruction might be a closed door
         * or objects blocking the mapped path.
         */
        CannotReachTargetArea = 73,

        /**
         * The device has detected that its dirty water tank is full
         */
        DirtyWaterTankFull = 74,

        /**
         * The device has detected that its dirty water is missing
         */
        DirtyWaterTankMissing = 75,

        /**
         * The device has detected that one or more wheels are jammed by an object
         */
        WheelsJammed = 76,

        /**
         * The device has detected that its brush is jammed by an object
         */
        BrushJammed = 77,

        /**
         * The device has detected that one of its sensors, such as LiDAR, infrared, or camera is obscured and needs to
         * be cleaned
         */
        NavigationSensorObscured = 78
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.4
     */
    export const TlvErrorStateStruct = TlvObject({
        /**
         * This shall be populated with a value from the ErrorStateEnum.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.4.1
         */
        errorStateId: TlvField(0, TlvEnum<ErrorState | OperationalStateNamespace.ErrorState>()),

        /**
         * This field is present when the ErrorStateID is from the set reserved for Manufacturer Specific errors. If
         * present, this shall contain a human-readable description of the error state.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.4.2
         */
        errorStateLabel: TlvOptionalField(1, TlvString.bound({ maxLength: 64 })),

        /**
         * This shall be a human-readable string that provides details about the error condition. As an example, if the
         * ErrorStateID indicates that the device is a Robotic Vacuum that is stuck, the ErrorStateDetails contains
         * "left wheel blocked".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.4.3
         */
        errorStateDetails: TlvOptionalField(2, TlvString.bound({ maxLength: 64 }))
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 1.14.4.4
     */
    export interface ErrorStateStruct extends TypeFromSchema<typeof TlvErrorStateStruct> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 7.4.5
     */
    export const TlvOperationalCommandResponse = TlvObject({
        /**
         * This shall indicate the success or otherwise of the attempted command invocation. On a successful invocation
         * of the attempted command, the ErrorStateID shall be populated with NoError. See the individual command
         * sections for additional specific requirements on population.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.6.5.1
         */
        commandResponseState: TlvField(0, TlvErrorStateStruct)
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 7.4.5
     */
    export interface OperationalCommandResponse extends TypeFromSchema<typeof TlvOperationalCommandResponse> {}

    /**
     * Body of the RvcOperationalState operationalError event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.14.7.1
     */
    export const TlvOperationalErrorEvent = TlvObject({ errorState: TlvField(0, TlvErrorStateStruct) });

    /**
     * Body of the RvcOperationalState operationalError event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.14.7.1
     */
    export interface OperationalErrorEvent extends TypeFromSchema<typeof TlvOperationalErrorEvent> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x61,
        name: "RvcOperationalState",
        revision: 3,

        attributes: {
            /**
             * Indicates a list of names of different phases that the device can go through for the selected function or
             * mode. The list may not be in sequence order. For example in a washing machine this could include items
             * such as "pre-soak", "rinse", and "spin". These phases are manufacturer specific and may change when a
             * different function or mode is selected.
             *
             * A null value indicates that the device does not present phases during its operation. When this
             * attribute’s value is null, the CurrentPhase attribute shall also be set to null.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.1
             */
            phaseList: Attribute(0x0, TlvNullable(TlvArray(TlvString, { maxLength: 32 }))),

            /**
             * This attribute represents the current phase of operation being performed by the server. This shall be the
             * positional index representing the value from the set provided in the PhaseList Attribute, where the first
             * item in that list is an index of 0. Thus, this attribute shall have a maximum value that is
             * "length(PhaseList) - 1".
             *
             * Null if the PhaseList attribute is null or if the PhaseList attribute is an empty list.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.2
             */
            currentPhase: Attribute(0x1, TlvNullable(TlvUInt8)),

            /**
             * Indicates the estimated time left before the operation is completed, in seconds.
             *
             * A value of 0 (zero) means that the operation has completed.
             *
             * A value of null represents that there is no time currently defined until operation completion. This may
             * happen, for example, because no operation is in progress or because the completion time is unknown.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • If it has changed due to a change in the CurrentPhase or OperationalState attributes, or
             *
             *   • When it changes from 0 to any other value and vice versa, or
             *
             *   • When it changes from null to any other value and vice versa, or
             *
             *   • When it increases, or
             *
             *   • When there is any increase or decrease in the estimated time remaining that was due to progressing
             *     insight of the server’s control logic, or
             *
             *   • When it changes at a rate significantly different from one unit per second.
             *
             * Changes to this attribute merely due to the normal passage of time with no other dynamic change of device
             * state shall NOT be reported.
             *
             * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the
             * reporting of this attribute in order to keep track of the remaining duration.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.3
             */
            countdownTime: OptionalAttribute(0x2, TlvNullable(TlvUInt32.bound({ max: 259200 })), { default: null }),

            /**
             * This attribute describes the set of possible operational states that the device exposes. An operational
             * state is a fundamental device state such as Running or Error. Details of the phase of a device when, for
             * example, in a state of Running are provided by the CurrentPhase attribute.
             *
             * All devices shall, at a minimum, expose the set of states matching the commands that are also supported
             * by the cluster instance, in addition to Error. The set of possible device states are defined in the
             * OperationalStateEnum. A device type requiring implementation of this cluster shall define the set of
             * states that are applicable to that specific device type.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.4
             */
            operationalStateList: Attribute(0x3, TlvArray(TlvOperationalStateStruct), { default: [] }),

            /**
             * This attribute specifies the current operational state of a device. This shall be populated with a valid
             * OperationalStateID from the set of values in the OperationalStateList Attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.5
             */
            operationalState: Attribute(
                0x4,
                TlvEnum<OperationalState | OperationalStateNamespace.OperationalStateEnum>()
            ),

            /**
             * This attribute shall specify the details of any current error condition being experienced on the device
             * when the OperationalState attribute is populated with Error. See Section 1.14.4.4, “ErrorStateStruct
             * Type” for general requirements on the population of this attribute.
             *
             * When there is no error detected, this shall have an ErrorStateID of NoError.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.6
             */
            operationalError: Attribute(0x5, TlvErrorStateStruct)
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 7.4.5
             */
            pause: Command(0x0, TlvNoArguments, 0x4, TlvOperationalCommandResponse),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 7.4.5
             */
            resume: Command(0x3, TlvNoArguments, 0x4, TlvOperationalCommandResponse),

            /**
             * On receipt of this command, the device shall start seeking the charging dock, if possible in the current
             * state of the device.
             *
             * If this command is received when already in the SeekingCharger state the device shall respond with an
             * OperationalCommandResponse command with an ErrorStateID of NoError but the command shall have no other
             * effect.
             *
             * A device that receives this command in any state which does not allow seeking the charger, such as
             * Charging or Docked, shall respond with an OperationalCommandResponse command with an ErrorStateID of
             * CommandInvalidInState and shall have no other effect.
             *
             * Otherwise, on success:
             *
             *   • The OperationalState attribute shall be set to SeekingCharger.
             *
             *   • The device shall respond with an OperationalCommandResponse command with an ErrorStateID of NoError.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 7.4.5.1
             */
            goHome: OptionalCommand(0x80, TlvNoArguments, 0x4, TlvOperationalCommandResponse)
        },

        events: {
            /**
             * This event is generated when a reportable error condition is detected. A device that generates this event
             * shall also set the OperationalState attribute to Error, indicating an error condition.
             *
             * This event shall contain the following fields:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.7.1
             */
            operationalError: Event(0x0, Priority.Critical, TlvOperationalErrorEvent),

            /**
             * This event SHOULD be generated when the overall operation ends, successfully or otherwise. For example,
             * the completion of a cleaning operation in a Robot Vacuum Cleaner, or the completion of a wash cycle in a
             * Washing Machine.
             *
             * It is highly recommended that appliances device types employing the Operational State cluster support
             * this event, even if it is optional. This assists clients in executing automations or issuing
             * notifications at critical points in the device operation cycles.
             *
             * This event shall contain the following fields:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.7.2
             */
            operationCompletion: OptionalEvent(
                0x1,
                Priority.Info,
                OperationalStateNamespace.TlvOperationCompletionEvent
            )
        }
    });

    /**
     * This cluster is derived from the Operational State cluster and provides an interface for monitoring the
     * operational state of a robotic vacuum cleaner.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 7.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type RvcOperationalStateCluster = RvcOperationalState.Cluster;
export const RvcOperationalStateCluster = RvcOperationalState.Cluster;
ClusterRegistry.register(RvcOperationalState.Complete);
