/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Actions } from "#clusters/actions";

export namespace ActionsInterface {
    export interface Base {
        /**
         * This command is used to trigger an instantaneous action.
         *
         * This command triggers an action (state change) on the involved endpoints, in a "fire and forget" manner.
         * Afterwards, the action’s state shall be Inactive.
         *
         * Example: recall a scene on a number of lights.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.1
         */
        instantAction(request: Actions.InstantActionRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.2
         */
        instantActionWithTransition(request: Actions.InstantActionWithTransitionRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.3
         */
        startAction(request: Actions.StartActionRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.4
         */
        startActionWithDuration(request: Actions.StartActionWithDurationRequest): MaybePromise;

        /**
         * This command is used to stop an action.
         *
         * This command stops the ongoing action on the involved endpoints. Afterwards, the action’s state shall be
         * Inactive.
         *
         * Example: stop a dynamic lighting pattern which was previously started with StartAction.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.5
         */
        stopAction(request: Actions.StopActionRequest): MaybePromise;

        /**
         * This command is used to pause an action.
         *
         * This command pauses an ongoing action, and shall change the action’s state to Paused.
         *
         * Example: pause a dynamic lighting effect (the lights stay at their current color) which was previously
         * started with StartAction.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.6
         */
        pauseAction(request: Actions.PauseActionRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.7
         */
        pauseActionWithDuration(request: Actions.PauseActionWithDurationRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.8
         */
        resumeAction(request: Actions.ResumeActionRequest): MaybePromise;

        /**
         * This command is used to enable an action.
         *
         * This command enables a certain action or automation. Afterwards, the action’s state shall be Active.
         *
         * Example: enable a motion sensor to control the lights in an area.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.9
         */
        enableAction(request: Actions.EnableActionRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.10
         */
        enableActionWithDuration(request: Actions.EnableActionWithDurationRequest): MaybePromise;

        /**
         * This command is used to disable an action.
         *
         * This command disables a certain action or automation, and shall change the action’s state to Inactive.
         *
         * Example: disable a motion sensor to no longer control the lights in an area.
         *
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.11
         */
        disableAction(request: Actions.DisableActionRequest): MaybePromise;

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
         * @see {@link MatterSpecification.v141.Core} § 9.14.6.12
         */
        disableActionWithDuration(request: Actions.DisableActionWithDurationRequest): MaybePromise;
    }
}

export type ActionsInterface = { components: [{ flags: {}, methods: ActionsInterface.Base }] };
