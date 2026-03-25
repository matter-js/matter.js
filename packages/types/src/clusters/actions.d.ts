/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";
import type { EndpointNumber } from "../datatype/EndpointNumber.js";

/**
 * Definitions for the Actions cluster.
 *
 * This cluster provides a standardized way for a Node (typically a Bridge, but could be any Node) to expose logical
 * grouping and actions.
 *
 * Specifically this cluster provides:
 *
 *   - Information about logical grouping of endpoints on the Node (example: lights in a room)
 *
 *   - Information about named actions that can be performed on such a group of endpoints (example: recall a scene for a
 *     group of lights by its name)
 *
 *   - Commands to trigger such actions
 *
 *   - Events to receive feedback on the state of such actions.
 *
 * The information on grouping and available actions is typically provided by the user or Bridge manufacturer via some
 * means not defined in Matter, and therefore provided as read-only to Nodes. For example: a manufacturer-provided app
 * allows a user to set up logical grouping and create/assign scene for such groups.
 *
 * Using this cluster, a Node can learn about such logical grouping, provided actions, and trigger such actions.
 *
 * While the origin of this cluster stems from use cases with a Bridge, its server side may also be implemented on any
 * Node which can expose certain grouping, actions or automations to other users.
 *
 * After defining the attributes, commands and events for this cluster, and the associated data types, several examples
 * are provided to illustrate the capabilities of this cluster.
 *
 * Actions can be defined in a flexible manner to suit the needs of the various nodes implementing this cluster. For
 * each action, the commands available for that particular action are defined.
 *
 * This cluster can be used to expose only the grouping of endpoints without any actions defined by populating the
 * EndpointList attribute accordingly and providing an empty list for ActionList.
 *
 * The term 'action' in the description of this cluster should not be confused with the term 'action' as used in the
 * Interaction Model.
 *
 * @see {@link MatterSpecification.v142.Core} § 9.14
 */
export declare namespace Actions {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0025;

    /**
     * Textual cluster identifier.
     */
    export const name: "Actions";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the Actions cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Actions} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * The ActionList attribute holds the list of actions. Each entry shall have an unique ActionID, and its
         * EndpointListID shall exist in the EndpointLists attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.5.1
         */
        actionList: Action[];

        /**
         * The EndpointLists attribute holds the list of endpoint lists. Each entry shall have an unique EndpointListID.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.5.2
         */
        endpointLists: EndpointList[];

        /**
         * The SetupURL attribute (when provided) shall indicate a URL; its syntax shall follow the syntax as specified
         * in RFC 1738, max. 512 ASCII characters and shall use the https scheme. The location referenced by this URL
         * shall provide additional information for the actions provided:
         *
         *   - When used without suffix, it shall provide information about the various actions which the cluster
         *     provides.
         *
         *     - Example: SetupURL could take the value of example://Actions or
         *       https://domain.example/Matter/bridgev1/Actions for this generic case (access generic info how to use
         *       actions provided by this cluster).
         *
         *   - When used with a suffix of "/?a=" and the decimal value of ActionID for one of the actions, it may
         *     provide information about that particular action. This could be a deeplink to manufacturer-app/website
         *     (associated somehow to the server node) with the information/edit-screen for this action so that the user
         *     can view and update details of the action, e.g. edit the scene, or change the wake-up experience time
         *     period.
         *
         *     - Example of SetupURL with suffix added: example://Actions/?a=12345 or
         *       https://domain.example/Matter/bridgev1/Actions/?a=12345 for linking to specific info/editing of the
         *       action with ActionID 0x3039.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.5.3
         */
        setupUrl?: string;
    }

    /**
     * Attributes that may appear in {@link Actions}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Attributes {
        /**
         * The ActionList attribute holds the list of actions. Each entry shall have an unique ActionID, and its
         * EndpointListID shall exist in the EndpointLists attribute.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.5.1
         */
        actionList: Action[];

        /**
         * The EndpointLists attribute holds the list of endpoint lists. Each entry shall have an unique EndpointListID.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.5.2
         */
        endpointLists: EndpointList[];

        /**
         * The SetupURL attribute (when provided) shall indicate a URL; its syntax shall follow the syntax as specified
         * in RFC 1738, max. 512 ASCII characters and shall use the https scheme. The location referenced by this URL
         * shall provide additional information for the actions provided:
         *
         *   - When used without suffix, it shall provide information about the various actions which the cluster
         *     provides.
         *
         *     - Example: SetupURL could take the value of example://Actions or
         *       https://domain.example/Matter/bridgev1/Actions for this generic case (access generic info how to use
         *       actions provided by this cluster).
         *
         *   - When used with a suffix of "/?a=" and the decimal value of ActionID for one of the actions, it may
         *     provide information about that particular action. This could be a deeplink to manufacturer-app/website
         *     (associated somehow to the server node) with the information/edit-screen for this action so that the user
         *     can view and update details of the action, e.g. edit the scene, or change the wake-up experience time
         *     period.
         *
         *     - Example of SetupURL with suffix added: example://Actions/?a=12345 or
         *       https://domain.example/Matter/bridgev1/Actions/?a=12345 for linking to specific info/editing of the
         *       action with ActionID 0x3039.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.5.3
         */
        setupUrl: string;
    }

    /**
     * {@link Actions} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to trigger an instantaneous action.
         *
         * This command triggers an action (state change) on the involved endpoints, in a "fire and forget" manner.
         * Afterwards, the action’s state shall be Inactive.
         *
         * Example: recall a scene on a number of lights.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.1
         */
        instantAction(request: InstantActionRequest): MaybePromise;

        /**
         * This command is used to trigger an instantaneous action with a transition over a given time.
         *
         * It is recommended that, where possible (e.g., it is not possible for attributes with Boolean data type), a
         * gradual transition SHOULD take place from the old to the new state over this time period. However, the exact
         * transition is manufacturer dependent.
         *
         * This command triggers an action (state change) on the involved endpoints, with a specified time to transition
         * from the current state to the new state. During the transition, the action’s state shall be Active.
         * Afterwards, the action’s state shall be Inactive.
         *
         * Example: recall a scene on a number of lights, with a specified transition time.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.2
         */
        instantActionWithTransition(request: InstantActionWithTransitionRequest): MaybePromise;

        /**
         * This command is used to trigger the commencement of an action.
         *
         * This command triggers the commencement of an action on the involved endpoints. Afterwards, the action’s state
         * shall be Active.
         *
         * Example: start a dynamic lighting pattern (such as gradually rotating the colors around the setpoints of the
         * scene) on a set of lights.
         *
         * Example: start a sequence of events such as a wake-up experience involving lights moving through several
         * brightness/color combinations and the window covering gradually opening.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.3
         */
        startAction(request: StartActionRequest): MaybePromise;

        /**
         * This command is used to trigger the commencement of an action with a duration.
         *
         * This command triggers the commencement of an action on the involved endpoints, and shall change the action’s
         * state to Active. After the specified Duration, the action will stop, and the action’s state shall change to
         * Inactive.
         *
         * Example: start a dynamic lighting pattern (such as gradually rotating the colors around the setpoints of the
         * scene) on a set of lights for 1 hour (Duration=3600).
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.4
         */
        startActionWithDuration(request: StartActionWithDurationRequest): MaybePromise;

        /**
         * This command is used to stop an action.
         *
         * This command stops the ongoing action on the involved endpoints. Afterwards, the action’s state shall be
         * Inactive.
         *
         * Example: stop a dynamic lighting pattern which was previously started with StartAction.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.5
         */
        stopAction(request: StopActionRequest): MaybePromise;

        /**
         * This command is used to pause an action.
         *
         * This command pauses an ongoing action, and shall change the action’s state to Paused.
         *
         * Example: pause a dynamic lighting effect (the lights stay at their current color) which was previously
         * started with StartAction.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.6
         */
        pauseAction(request: PauseActionRequest): MaybePromise;

        /**
         * This command is used to pause an action with a duration.
         *
         * This command pauses an ongoing action, and shall change the action’s state to Paused. After the specified
         * Duration, the ongoing action will be automatically resumed. which shall change the action’s state to Active.
         *
         * Example: pause a dynamic lighting effect (the lights stay at their current color) for 10 minutes
         * (Duration=600).
         *
         * The difference between Pause/Resume and Disable/Enable is on the one hand semantic (the former is more of a
         * transitionary nature while the latter is more permanent) and on the other hand these can be implemented
         * slightly differently in the implementation of the action (e.g. a Pause would be automatically resumed after
         * some hours or during a nightly reset, while an Disable would remain in effect until explicitly enabled
         * again).
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.7
         */
        pauseActionWithDuration(request: PauseActionWithDurationRequest): MaybePromise;

        /**
         * This command is used to resume an action.
         *
         * This command resumes a previously paused action, and shall change the action’s state to Active.
         *
         * The difference between ResumeAction and StartAction is that ResumeAction will continue the action from the
         * state where it was paused, while StartAction will start the action from the beginning.
         *
         * Example: resume a dynamic lighting effect (the lights' colors will change gradually, continuing from the
         * point they were paused).
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.8
         */
        resumeAction(request: ResumeActionRequest): MaybePromise;

        /**
         * This command is used to enable an action.
         *
         * This command enables a certain action or automation. Afterwards, the action’s state shall be Active.
         *
         * Example: enable a motion sensor to control the lights in an area.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.9
         */
        enableAction(request: EnableActionRequest): MaybePromise;

        /**
         * This command is used to enable an action with a duration.
         *
         * This command enables a certain action or automation, and shall change the action’s state to be Active. After
         * the specified Duration, the action or automation will stop, and the action’s state shall change to Disabled.
         *
         * Example: enable a "presence mimicking" behavior for the lights in your home during a vacation; the Duration
         * field is used to indicated the length of your absence from home. After that period, the presence mimicking
         * behavior will no longer control these lights.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.10
         */
        enableActionWithDuration(request: EnableActionWithDurationRequest): MaybePromise;

        /**
         * This command is used to disable an action.
         *
         * This command disables a certain action or automation, and shall change the action’s state to Inactive.
         *
         * Example: disable a motion sensor to no longer control the lights in an area.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.11
         */
        disableAction(request: DisableActionRequest): MaybePromise;

        /**
         * This command is used to disable an action with a duration.
         *
         * This command disables a certain action or automation, and shall change the action’s state to Disabled. After
         * the specified Duration, the action or automation will re-start, and the action’s state shall change to either
         * Inactive or Active, depending on the actions (see Section 9.14.8.4, “Example 4: Wake-up routine” and Section
         * 9.14.8.6, “Example 6: Alarm system”).
         *
         * Example: disable a "wakeup" experience for a period of 1 week when going on holiday (to prevent them from
         * turning on in the morning while you’re not at home). After this period, the wakeup experience will control
         * the lights as before.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.12
         */
        disableActionWithDuration(request: DisableActionWithDurationRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link Actions}.
     */
    export interface Commands extends BaseCommands {}

    /**
     * {@link Actions} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when there is a change in the State of an ActionID during the execution of an
         * action and the most recent command using that ActionID used an InvokeID data field.
         *
         * It provides feedback to the client about the progress of the action.
         *
         * Example: When InstantActionWithTransition is invoked (with an InvokeID data field), two StateChanged events
         * will be generated:
         *
         *   - one when the transition starts (NewState=Active)
         *
         *   - one when the transition completed (NewState=Inactive)
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.1
         */
        stateChanged: StateChangedEvent;

        /**
         * This event shall be generated when there is some error which prevents the action from its normal planned
         * execution and the most recent command using that ActionID used an InvokeID data field.
         *
         * It provides feedback to the client about the non-successful progress of the action.
         *
         * Example: When InstantActionWithTransition is invoked (with an InvokeID data field), and another controller
         * changes the state of one or more of the involved endpoints during the transition, thus interrupting the
         * transition triggered by the action, two events would be generated:
         *
         *   - StateChanged when the transition starts (NewState=Active)
         *
         *   - ActionFailed when the interrupting command occurs (NewState=Inactive, Error=interrupted)
         *
         * Example: When InstantActionWithTransition is invoked (with an InvokeID data field = 1), and the same client
         * invokes an InstantAction with (the same or another ActionId and) InvokeID = 2, and this second command
         * interrupts the transition triggered by the first command, these events would be generated:
         *
         *   - StateChanged (InvokeID=1, NewState=Active) when the transition starts
         *
         *   - ActionFailed (InvokeID=2, NewState=Inactive, Error=interrupted) when the second command interrupts the
         *     transition
         *
         *   - StateChanged (InvokeID=2, NewState=Inactive) upon the execution of the action for the second command
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.2
         */
        actionFailed: ActionFailedEvent;
    }

    /**
     * Events that may appear in {@link Actions}.
     */
    export interface Events {
        /**
         * This event shall be generated when there is a change in the State of an ActionID during the execution of an
         * action and the most recent command using that ActionID used an InvokeID data field.
         *
         * It provides feedback to the client about the progress of the action.
         *
         * Example: When InstantActionWithTransition is invoked (with an InvokeID data field), two StateChanged events
         * will be generated:
         *
         *   - one when the transition starts (NewState=Active)
         *
         *   - one when the transition completed (NewState=Inactive)
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.1
         */
        stateChanged: StateChangedEvent;

        /**
         * This event shall be generated when there is some error which prevents the action from its normal planned
         * execution and the most recent command using that ActionID used an InvokeID data field.
         *
         * It provides feedback to the client about the non-successful progress of the action.
         *
         * Example: When InstantActionWithTransition is invoked (with an InvokeID data field), and another controller
         * changes the state of one or more of the involved endpoints during the transition, thus interrupting the
         * transition triggered by the action, two events would be generated:
         *
         *   - StateChanged when the transition starts (NewState=Active)
         *
         *   - ActionFailed when the interrupting command occurs (NewState=Inactive, Error=interrupted)
         *
         * Example: When InstantActionWithTransition is invoked (with an InvokeID data field = 1), and the same client
         * invokes an InstantAction with (the same or another ActionId and) InvokeID = 2, and this second command
         * interrupts the transition triggered by the first command, these events would be generated:
         *
         *   - StateChanged (InvokeID=1, NewState=Active) when the transition starts
         *
         *   - ActionFailed (InvokeID=2, NewState=Inactive, Error=interrupted) when the second command interrupts the
         *     transition
         *
         *   - StateChanged (InvokeID=2, NewState=Inactive) upon the execution of the action for the second command
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.2
         */
        actionFailed: ActionFailedEvent;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents }];

    /**
     * This data type holds the details of a single action, and contains the data fields below.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.6
     */
    export interface Action {
        /**
         * This field shall provide an unique identifier used to identify an action.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.6.1
         */
        actionId: number;

        /**
         * This field shall indicate the name (as assigned by the user or automatically by the server) associated with
         * this action. This can be used for identifying the action to the user by the client. Example: "my colorful
         * scene".
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.6.2
         */
        name: string;

        /**
         * This field shall indicate the type of action. The value of Type of an action, along with its
         * SupportedCommands can be used by the client in its UX or logic to determine how to present or use such
         * action. See ActionTypeEnum for details and examples.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.6.3
         */
        type: ActionType;

        /**
         * This field shall provide a reference to the associated endpoint list, which specifies the endpoints on this
         * Node which will be impacted by this ActionID.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.6.4
         */
        endpointListId: number;

        /**
         * This field is a bitmap which shall be used to indicate which of the cluster’s commands are supported for this
         * particular action, with a bit set to 1 for each supported command according to the table below. Other bits
         * shall be set to 0.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.6.5
         */
        supportedCommands: CommandBits;

        /**
         * This field shall indicate the current state of this action.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.6.6
         */
        state: ActionState;
    }

    /**
     * This data type holds the details of a single endpoint list, which relates to a set of endpoints that have some
     * logical relation, and contains the data fields below.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.7
     */
    export interface EndpointList {
        /**
         * This field shall provide an unique identifier used to identify the endpoint list.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.7.1
         */
        endpointListId: number;

        /**
         * This field shall indicate the name (as assigned by the user or automatically by the server) associated with
         * the set of endpoints in this list. This can be used for identifying the action to the user by the client.
         * Example: "living room".
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.7.2
         */
        name: string;

        /**
         * This field shall indicate the type of endpoint list, see EndpointListTypeEnum.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.7.3
         */
        type: EndpointListType;

        /**
         * This field shall provide a list of endpoint numbers.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.7.4
         */
        endpoints: EndpointNumber[];
    }

    /**
     * This command is used to trigger an instantaneous action.
     *
     * This command triggers an action (state change) on the involved endpoints, in a "fire and forget" manner.
     * Afterwards, the action’s state shall be Inactive.
     *
     * Example: recall a scene on a number of lights.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.1
     */
    export interface InstantActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to trigger an instantaneous action with a transition over a given time.
     *
     * It is recommended that, where possible (e.g., it is not possible for attributes with Boolean data type), a
     * gradual transition SHOULD take place from the old to the new state over this time period. However, the exact
     * transition is manufacturer dependent.
     *
     * This command triggers an action (state change) on the involved endpoints, with a specified time to transition
     * from the current state to the new state. During the transition, the action’s state shall be Active. Afterwards,
     * the action’s state shall be Inactive.
     *
     * Example: recall a scene on a number of lights, with a specified transition time.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.2
     */
    export interface InstantActionWithTransitionRequest {
        actionId: number;
        invokeId?: number;

        /**
         * This field shall indicate the transition time in 1/10th of seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.2.1
         */
        transitionTime: number;
    }

    /**
     * This command is used to trigger the commencement of an action.
     *
     * This command triggers the commencement of an action on the involved endpoints. Afterwards, the action’s state
     * shall be Active.
     *
     * Example: start a dynamic lighting pattern (such as gradually rotating the colors around the setpoints of the
     * scene) on a set of lights.
     *
     * Example: start a sequence of events such as a wake-up experience involving lights moving through several
     * brightness/color combinations and the window covering gradually opening.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.3
     */
    export interface StartActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to trigger the commencement of an action with a duration.
     *
     * This command triggers the commencement of an action on the involved endpoints, and shall change the action’s
     * state to Active. After the specified Duration, the action will stop, and the action’s state shall change to
     * Inactive.
     *
     * Example: start a dynamic lighting pattern (such as gradually rotating the colors around the setpoints of the
     * scene) on a set of lights for 1 hour (Duration=3600).
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.4
     */
    export interface StartActionWithDurationRequest {
        actionId: number;
        invokeId?: number;

        /**
         * This field shall indicate the requested duration in seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.4.1
         */
        duration: number;
    }

    /**
     * This command is used to stop an action.
     *
     * This command stops the ongoing action on the involved endpoints. Afterwards, the action’s state shall be
     * Inactive.
     *
     * Example: stop a dynamic lighting pattern which was previously started with StartAction.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.5
     */
    export interface StopActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to pause an action.
     *
     * This command pauses an ongoing action, and shall change the action’s state to Paused.
     *
     * Example: pause a dynamic lighting effect (the lights stay at their current color) which was previously started
     * with StartAction.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.6
     */
    export interface PauseActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to pause an action with a duration.
     *
     * This command pauses an ongoing action, and shall change the action’s state to Paused. After the specified
     * Duration, the ongoing action will be automatically resumed. which shall change the action’s state to Active.
     *
     * Example: pause a dynamic lighting effect (the lights stay at their current color) for 10 minutes (Duration=600).
     *
     * The difference between Pause/Resume and Disable/Enable is on the one hand semantic (the former is more of a
     * transitionary nature while the latter is more permanent) and on the other hand these can be implemented slightly
     * differently in the implementation of the action (e.g. a Pause would be automatically resumed after some hours or
     * during a nightly reset, while an Disable would remain in effect until explicitly enabled again).
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.7
     */
    export interface PauseActionWithDurationRequest {
        actionId: number;
        invokeId?: number;

        /**
         * This field shall indicate the requested duration in seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.7.1
         */
        duration: number;
    }

    /**
     * This command is used to resume an action.
     *
     * This command resumes a previously paused action, and shall change the action’s state to Active.
     *
     * The difference between ResumeAction and StartAction is that ResumeAction will continue the action from the state
     * where it was paused, while StartAction will start the action from the beginning.
     *
     * Example: resume a dynamic lighting effect (the lights' colors will change gradually, continuing from the point
     * they were paused).
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.8
     */
    export interface ResumeActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to enable an action.
     *
     * This command enables a certain action or automation. Afterwards, the action’s state shall be Active.
     *
     * Example: enable a motion sensor to control the lights in an area.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.9
     */
    export interface EnableActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to enable an action with a duration.
     *
     * This command enables a certain action or automation, and shall change the action’s state to be Active. After the
     * specified Duration, the action or automation will stop, and the action’s state shall change to Disabled.
     *
     * Example: enable a "presence mimicking" behavior for the lights in your home during a vacation; the Duration field
     * is used to indicated the length of your absence from home. After that period, the presence mimicking behavior
     * will no longer control these lights.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.10
     */
    export interface EnableActionWithDurationRequest {
        actionId: number;
        invokeId?: number;

        /**
         * This field shall indicate the requested duration in seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.10.1
         */
        duration: number;
    }

    /**
     * This command is used to disable an action.
     *
     * This command disables a certain action or automation, and shall change the action’s state to Inactive.
     *
     * Example: disable a motion sensor to no longer control the lights in an area.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.11
     */
    export interface DisableActionRequest {
        actionId: number;
        invokeId?: number;
    }

    /**
     * This command is used to disable an action with a duration.
     *
     * This command disables a certain action or automation, and shall change the action’s state to Disabled. After the
     * specified Duration, the action or automation will re-start, and the action’s state shall change to either
     * Inactive or Active, depending on the actions (see Section 9.14.8.4, “Example 4: Wake-up routine” and Section
     * 9.14.8.6, “Example 6: Alarm system”).
     *
     * Example: disable a "wakeup" experience for a period of 1 week when going on holiday (to prevent them from turning
     * on in the morning while you’re not at home). After this period, the wakeup experience will control the lights as
     * before.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.6.12
     */
    export interface DisableActionWithDurationRequest {
        actionId: number;
        invokeId?: number;

        /**
         * This field shall indicate the requested duration in seconds.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.6.12.1
         */
        duration: number;
    }

    /**
     * This event shall be generated when there is a change in the State of an ActionID during the execution of an
     * action and the most recent command using that ActionID used an InvokeID data field.
     *
     * It provides feedback to the client about the progress of the action.
     *
     * Example: When InstantActionWithTransition is invoked (with an InvokeID data field), two StateChanged events will
     * be generated:
     *
     *   - one when the transition starts (NewState=Active)
     *
     *   - one when the transition completed (NewState=Inactive)
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.7.1
     */
    export interface StateChangedEvent {
        /**
         * This field shall be set to the ActionID of the action which has changed state.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.1.1
         */
        actionId: number;

        /**
         * This field shall be set to the InvokeID which was provided to the most recent command referencing this
         * ActionID.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.1.2
         */
        invokeId: number;

        /**
         * This field shall be set to state that the action has changed to.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.1.3
         */
        newState: ActionState;
    }

    /**
     * This event shall be generated when there is some error which prevents the action from its normal planned
     * execution and the most recent command using that ActionID used an InvokeID data field.
     *
     * It provides feedback to the client about the non-successful progress of the action.
     *
     * Example: When InstantActionWithTransition is invoked (with an InvokeID data field), and another controller
     * changes the state of one or more of the involved endpoints during the transition, thus interrupting the
     * transition triggered by the action, two events would be generated:
     *
     *   - StateChanged when the transition starts (NewState=Active)
     *
     *   - ActionFailed when the interrupting command occurs (NewState=Inactive, Error=interrupted)
     *
     * Example: When InstantActionWithTransition is invoked (with an InvokeID data field = 1), and the same client
     * invokes an InstantAction with (the same or another ActionId and) InvokeID = 2, and this second command interrupts
     * the transition triggered by the first command, these events would be generated:
     *
     *   - StateChanged (InvokeID=1, NewState=Active) when the transition starts
     *
     *   - ActionFailed (InvokeID=2, NewState=Inactive, Error=interrupted) when the second command interrupts the
     *     transition
     *
     *   - StateChanged (InvokeID=2, NewState=Inactive) upon the execution of the action for the second command
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.7.2
     */
    export interface ActionFailedEvent {
        /**
         * This field shall be set to the ActionID of the action which encountered an error.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.2.1
         */
        actionId: number;

        /**
         * This field shall be set to the InvokeID which was provided to the most recent command referencing this
         * ActionID.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.2.2
         */
        invokeId: number;

        /**
         * This field shall be set to state that the action is in at the time of generating the event.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.2.3
         */
        newState: ActionState;

        /**
         * This field shall be set to indicate the reason for non-successful progress of the action.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.7.2.4
         */
        error: ActionError;
    }

    /**
     * Note - The bit allocation of this bitmap shall follow the ID’s of the Commands of this cluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.1
     */
    export interface CommandBits {
        /**
         * Indicate support for InstantAction command
         */
        instantAction?: boolean;

        /**
         * Indicate support for InstantActionWithTransition command
         */
        instantActionWithTransition?: boolean;

        /**
         * Indicate support for StartAction command
         */
        startAction?: boolean;

        /**
         * Indicate support for StartActionWithDuration command
         */
        startActionWithDuration?: boolean;

        /**
         * Indicate support for StopAction command
         */
        stopAction?: boolean;

        /**
         * Indicate support for PauseAction command
         */
        pauseAction?: boolean;

        /**
         * Indicate support for PauseActionWithDuration command
         */
        pauseActionWithDuration?: boolean;

        /**
         * Indicate support for ResumeAction command
         */
        resumeAction?: boolean;

        /**
         * Indicate support for EnableAction command
         */
        enableAction?: boolean;

        /**
         * Indicate support for EnableActionWithDuration command
         */
        enableActionWithDuration?: boolean;

        /**
         * Indicate support for DisableAction command
         */
        disableAction?: boolean;

        /**
         * Indicate support for DisableActionWithDuration command
         */
        disableActionWithDuration?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.2
     */
    export enum ActionType {
        /**
         * Use this only when none of the other values applies
         */
        Other = 0,

        /**
         * Bring the endpoints into a certain state
         *
         * Can be used to set a static state of the associated endpoints (typically using InstantAction or
         * InstantActionWithTransition), or to bring these endpoints into a more dynamic state (typically using
         * StartAction), where the endpoints would e.g. gradually cycle through certain colors for a pleasing effect. A
         * voice controller could use "set" (to map to InstantAction) or "play" (to map to StartAction) to trigger such
         * actions. Example: see Section 9.14.8.1, “Example 1: Scene recall” and Section 9.14.8.2, “Example 2: Set
         * dynamic light effect”.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.2.1
         */
        Scene = 1,

        /**
         * A sequence of states with a certain time pattern
         *
         * Indicates an action which involves a sequence of events/states of the associated endpoints, such as a wake-up
         * experience. Example: see Section 9.14.8.4, “Example 4: Wake-up routine”.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.2.2
         */
        Sequence = 2,

        /**
         * Control an automation (e.g. motion sensor controlling lights)
         *
         * Indications an automation (e.g. a motion sensor controlling lights, an alarm system) which can be e.g.
         * started, stopped, paused, resumed. Example: see Section 9.14.8.3, “Example 3: Pause sensor automation”.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.2.3
         */
        Automation = 3,

        /**
         * Sequence that will run when something doesn’t happen
         *
         * Indicates some action which the server will execute when a certain condition (which normally does not happen)
         * is not met. Example: lock the doors when the server’s system has detected no one is at home while the doors
         * are in the 'unlocked' state.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.2.4
         */
        Exception = 4,

        /**
         * Use the endpoints to send a message to user
         *
         * Indicates an action that can be triggered (e.g. by InstantAction) to notify the user. Example: play a pattern
         * on the lights in the living room if there is someone in the garden in the evening.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.2.5
         */
        Notification = 5,

        /**
         * Higher priority notification
         *
         * Similar to Notification but with a higher priority (and might override other endpoint states which
         * Type=Notification would not override). Example: flash all lights in the house when CO sensor triggers.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.2.6
         */
        Alarm = 6
    }

    /**
     * Note that some of these states are applicable only for certain actions, as determined by their SupportedCommands.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.3
     */
    export enum ActionState {
        /**
         * The action is not active
         */
        Inactive = 0,

        /**
         * The action is active
         */
        Active = 1,

        /**
         * The action has been paused
         */
        Paused = 2,

        /**
         * The action has been disabled
         */
        Disabled = 3
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.4
     */
    export enum ActionError {
        /**
         * Other reason not listed in the row(s) below
         */
        Unknown = 0,

        /**
         * The action was interrupted by another command or interaction
         */
        Interrupted = 1
    }

    /**
     * The Room and Zone values are provided for the cases where a user (or the system on behalf of the user) has
     * created logical grouping of the endpoints (e.g. bridged devices) based on location.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.14.4.5
     */
    export enum EndpointListType {
        /**
         * Another group of endpoints
         *
         * This value is provided for the case of an endpoint list which is tied specifically to this action i.e. not
         * independently created by the user. For Type=Other the Name may be empty. A Matter controller would typically
         * not use this for anything else than just to know which endpoints would be affected by the action.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.5.1
         */
        Other = 0,

        /**
         * User-configured group of endpoints where an endpoint can be in only one room
         *
         * Is used for the situation where an endpoint can only be part of one such rooms (e.g. physical mapping). Using
         * these exposed logical groups, a Matter controller who has a similar grouping concept can use it to place each
         * endpoint (bridged device) in the right room automatically, without user having to redo that setup for each
         * device in each system - both at first contact and upon later updates to the endpoints (e.g. user adds a
         * bridged device or creates a new room).
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.5.2
         */
        Room = 1,

        /**
         * User-configured group of endpoints where an endpoint can be in any number of zones
         *
         * Is a more general concept where an endpoint can be part of multiple zones, e.g. a light in the living room
         * can be part of the "reading corner" zone (subset of the lights in the living room) but also part of the
         * "downstairs" zone which contains all the lights on a floor, e.g. combining living room, kitchen and hallway.
         * This indicates that a user has defined this list of endpoints as something they logically would like to
         * control as a group, so Matter controllers could provide the user with a way to do as such.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.14.4.5.3
         */
        Zone = 2
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
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * @deprecated Use {@link Actions}.
     */
    export const Cluster: typeof Actions;

    /**
     * @deprecated Use {@link Actions}.
     */
    export const Complete: typeof Actions;

    export const Typing: Actions;
}

/**
 * @deprecated Use {@link Actions}.
 */
export declare const ActionsCluster: typeof Actions;

export interface Actions extends ClusterTyping {
    Attributes: Actions.Attributes;
    Commands: Actions.Commands;
    Events: Actions.Events;
    Components: Actions.Components;
}
