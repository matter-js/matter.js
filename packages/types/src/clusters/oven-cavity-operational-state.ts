/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute, Command, Event, OptionalEvent } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvUInt8, TlvUInt32, TlvEnum } from "../tlv/TlvNumber.js";
import { OperationalState } from "./operational-state.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace OvenCavityOperationalState {
    /**
     * @see {@link MatterSpecification.v141.Cluster} § 8.10.5
     */
    export const TlvOperationalCommandResponse = TlvObject({
        /**
         * This shall indicate the success or otherwise of the attempted command invocation. On a successful invocation
         * of the attempted command, the ErrorStateID shall be populated with NoError. See the individual command
         * sections for additional specific requirements on population.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.14.6.5.1
         */
        commandResponseState: TlvField(0, OperationalState.TlvErrorStateStruct)
    });

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 8.10.5
     */
    export interface OperationalCommandResponse extends TypeFromSchema<typeof TlvOperationalCommandResponse> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x48,
        name: "OvenCavityOperationalState",
        revision: 2,

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
            operationalStateList: Attribute(0x3, TlvArray(OperationalState.TlvOperationalStateStruct), { default: [] }),

            /**
             * This attribute specifies the current operational state of a device. This shall be populated with a valid
             * OperationalStateID from the set of values in the OperationalStateList Attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.5
             */
            operationalState: Attribute(0x4, TlvEnum<OperationalState.OperationalStateEnum>()),

            /**
             * This attribute shall specify the details of any current error condition being experienced on the device
             * when the OperationalState attribute is populated with Error. See Section 1.14.4.4, “ErrorStateStruct
             * Type” for general requirements on the population of this attribute.
             *
             * When there is no error detected, this shall have an ErrorStateID of NoError.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.14.5.6
             */
            operationalError: Attribute(0x5, OperationalState.TlvErrorStateStruct)
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v141.Cluster} § 8.10.5
             */
            stop: Command(0x1, TlvNoArguments, 0x4, TlvOperationalCommandResponse),

            /**
             * @see {@link MatterSpecification.v141.Cluster} § 8.10.5
             */
            start: Command(0x2, TlvNoArguments, 0x4, TlvOperationalCommandResponse)
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
            operationalError: Event(0x0, Priority.Critical, OperationalState.TlvOperationalErrorEvent),

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
            operationCompletion: OptionalEvent(0x1, Priority.Info, OperationalState.TlvOperationCompletionEvent)
        }
    });

    /**
     * This cluster is derived from the Operational State cluster and provides an interface for monitoring the
     * operational state of an oven.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 8.10
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type OvenCavityOperationalStateCluster = OvenCavityOperationalState.Cluster;
export const OvenCavityOperationalStateCluster = OvenCavityOperationalState.Cluster;
ClusterRegistry.register(OvenCavityOperationalState.Complete);
