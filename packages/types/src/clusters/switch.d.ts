/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { Switch as SwitchModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the Switch cluster.
 */
export declare namespace Switch {
    /**
     * {@link Switch} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the maximum number of positions the switch has. Any kind of switch has a minimum of 2
             * positions. Also see Section 1.13.10, “Multi Position Details” for the case NumberOfPositions>2.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.5.1
             */
            readonly numberOfPositions: number;

            /**
             * Indicates the position of the switch.
             *
             * The valid range is zero to NumberOfPositions - 1.
             *
             * CurrentPosition value 0 shall be assigned to the default position of the switch: for example the "open"
             * state of a rocker switch, or the "idle" state of a push button switch.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.5.2
             */
            readonly currentPosition: number;
        }
    }

    /**
     * {@link Switch} supports these elements if it supports feature "MomentarySwitchMultiPress".
     */
    export namespace MomentarySwitchMultiPressComponent {
        export interface Attributes {
            /**
             * Indicates how many consecutive presses can be detected and reported by a momentary switch which supports
             * multi-press (MSM feature flag set).
             *
             * For example, a momentary switch supporting single press, double press and triple press, but not quad
             * press and beyond, would return the value 3.
             *
             * When more than MultiPressMax presses are detected within a multi-press sequence:
             *
             *   - The server for cluster revision < 2 SHOULD generate a MultiPressComplete event with the
             *     TotalNumberOfPressesCounted field set to the value of the MultiPressMax attribute, and avoid
             *     generating any further InitialPress and MultiPressOngoing events until the switch has become fully
             *     idle (i.e. no longer in the process of counting presses within the multipress).
             *
             *   - The server for cluster revision >= 2 shall generate a MultiPressComplete event with the
             *     TotalNumberOfPressesCounted field set to zero (indicating an aborted sequence), and shall NOT
             *     generate any further InitialPress and MultiPressOngoing events until the switch has become fully idle
             *     (i.e. no longer in the process of counting presses within the multipress).
             *
             * This approach avoids unintentionally causing intermediate actions where there is a very long sequence of
             * presses beyond MultiPressMax that may be taken in account specially by switches (e.g. to trigger special
             * behavior such as factory reset for which generating events towards the client is not appropriate).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.5.3
             */
            readonly multiPressMax: number;
        }

        export interface Events {
            /**
             * This event shall be generated to indicate how many times the momentary switch has been pressed in a
             * multi-press sequence, after it has been detected that the sequence has ended. See Section 1.13.8,
             * “Sequence of events for MultiPress”.
             *
             * The PreviousPosition field shall indicate the previous value of the CurrentPosition attribute, i.e. just
             * prior to release.
             *
             * The TotalNumberOfPressesCounted field shall contain:
             *
             *   - a value of 0 when there was an aborted multi-press sequence, where the number of presses goes beyond
             *     MultiPressMax presses,
             *
             *   - a value of 1 when there was exactly one press in a multi-press sequence (and the sequence has ended),
             *     i.e. there was no double press (or more),
             *
             *   - a value of 2 when there were exactly two presses in a multi-press sequence (and the sequence has
             *     ended),
             *
             *   - a value of 3 when there were exactly three presses in a multi-press sequence (and the sequence has
             *     ended),
             *
             *   - a value of N when there were exactly N presses in a multi-press sequence (and the sequence has
             *     ended).
             *
             *     > [!NOTE]
             *
             *     > The introduction of TotalNumberOfPressesCounted supporting the value 0 may impact clients of
             *       switches using cluster revision 1 since such servers would not use this value of
             *       TotalNumberOfPressesCounted to indicate an aborted sequence. Clients SHOULD always act using the
             *       TotalNumberOfPressesCounted field taken into account since for values from 1 to MultiPressMax, the
             *       user action that led to the event was different depending on the count.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.7
             */
            multiPressComplete: MultiPressCompleteEvent;
        }
    }

    /**
     * {@link Switch} supports these elements if it supports feature "LatchingSwitch".
     */
    export namespace LatchingSwitchComponent {
        export interface Events {
            /**
             * This event shall be generated, when the latching switch is moved to a new position. It may have been
             * delayed by debouncing within the switch.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.1
             */
            switchLatched: SwitchLatchedEvent;
        }
    }

    /**
     * {@link Switch} supports these elements if it supports feature "MomentarySwitch".
     */
    export namespace MomentarySwitchComponent {
        export interface Events {
            /**
             * This event shall be generated, when the momentary switch starts to be pressed (after debouncing).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.2
             */
            initialPress: InitialPressEvent;
        }
    }

    /**
     * {@link Switch} supports these elements if it supports feature "MomentarySwitchLongPress".
     */
    export namespace MomentarySwitchLongPressComponent {
        export interface Events {
            /**
             * This event shall be generated when the momentary switch has been pressed for a "long" time. The time
             * interval constituting a "long" time is manufacturer-determined, since it depends on the switch physics.
             *
             *   - When the AS feature flag is set, this event:
             *
             *     - shall NOT be generated during a multi-press sequence (since a long press is a separate cycle from
             *       any multi-press cycles);
             *
             *     - shall only be generated after the first InitialPress following a MultiPressComplete when a long
             *       press is detected after the idle time.
             *
             *   - Else, when the MSM feature flag is set, this event:
             *
             *     - shall NOT be generated during a multi-press sequence (since a long press is a separate cycle from
             *       any multi-press cycles);
             *
             *     - shall only be generated after the first InitialPress following a MultiPressComplete when a long
             *       press is detected after the idle time;
             *
             *     - shall NOT be generated after a MultiPressOngoing event without an intervening MultiPressComplete
             *       event.
             *
             * The above constraints imply that for a given activity detection cycle of a switch having MSM and/or MSL
             * feature flags set, the entire activity is either a single long press detection cycle of (InitialPress,
             * LongPress, LongRelease), or a single multi-press detection cycle (ending in MultiPressComplete), where
             * presses that would otherwise be reported as long presses are instead reported as a counted press in the
             * MultiPressComplete event, and as InitialPress/ShortRelease pairs otherwise (where applicable).
             *
             * The rationale for this constraint is the ambiguity of interpretation of events when mixing long presses
             * and multi-press events.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.3
             */
            longPress: LongPressEvent;

            /**
             * This event shall be generated, when the momentary switch has been released (after debouncing) and after
             * having been pressed for a long time, i.e. this event shall be generated when the switch is released if a
             * LongPress event has been generated since the previous InitialPress event. Also see Section 1.13.7,
             * “Sequence of generated events”.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.5
             */
            longRelease: LongReleaseEvent;
        }
    }

    /**
     * {@link Switch} supports these elements if it supports feature "MomentarySwitchRelease".
     */
    export namespace MomentarySwitchReleaseComponent {
        export interface Events {
            /**
             * If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all,
             * since setting the Action Switch feature flag forbids the Momentary Switch ShortRelease (MSR) feature flag
             * from being set. Otherwise, the following paragraphs describe the situations where this event is
             * generated.
             *
             * This event shall be generated, when the momentary switch has been released (after debouncing).
             *
             *   - If the server has the Momentary Switch LongPress (MSL) feature flag set, then this event shall be
             *     generated when the switch is released if no LongPress event had been generated since the previous
             *     InitialPress event.
             *
             *   - If the server does not have the Momentary Switch LongPress (MSL) feature flag set, this event shall
             *     be generated when the switch is released - even when the switch was pressed for a long time.
             *
             *   - Also see Section 1.13.7, “Sequence of generated events”.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.4
             */
            shortRelease: ShortReleaseEvent;
        }
    }

    /**
     * {@link Switch} supports these elements if it supports feature "MomentarySwitchMultiPressNotActionSwitch".
     */
    export namespace MomentarySwitchMultiPressNotActionSwitchComponent {
        export interface Events {
            /**
             * If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all.
             * Otherwise, the following paragraphs describe the situations where this event is generated.
             *
             * This event shall be generated to indicate how many times the momentary switch has been pressed in a
             * multi-press sequence, during that sequence. See Section 1.13.8, “Sequence of events for MultiPress”.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.6
             */
            multiPressOngoing: MultiPressOngoingEvent;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<MomentarySwitchMultiPressComponent.Attributes> {}
    export interface Events extends MomentarySwitchMultiPressComponent.Events, LatchingSwitchComponent.Events, MomentarySwitchComponent.Events, MomentarySwitchLongPressComponent.Events, MomentarySwitchReleaseComponent.Events, MomentarySwitchMultiPressNotActionSwitchComponent.Events {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        {
            flags: { momentarySwitchMultiPress: true },
            attributes: MomentarySwitchMultiPressComponent.Attributes,
            events: MomentarySwitchMultiPressComponent.Events
        },
        { flags: { latchingSwitch: true }, events: LatchingSwitchComponent.Events },
        { flags: { momentarySwitch: true }, events: MomentarySwitchComponent.Events },
        { flags: { momentarySwitchLongPress: true }, events: MomentarySwitchLongPressComponent.Events },
        { flags: { momentarySwitchRelease: true }, events: MomentarySwitchReleaseComponent.Events },
        {
            flags: { momentarySwitchMultiPress: true, actionSwitch: false },
            events: MomentarySwitchMultiPressNotActionSwitchComponent.Events
        }
    ];

    export type Features = "LatchingSwitch" | "MomentarySwitch" | "MomentarySwitchRelease" | "MomentarySwitchLongPress" | "MomentarySwitchMultiPress" | "ActionSwitch";

    /**
     * These are optional features supported by SwitchCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.4
     */
    export enum Feature {
        /**
         * LatchingSwitch (LS)
         *
         * This feature flag is for a switch that maintains its position after being pressed (or turned).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.4.1
         */
        LatchingSwitch = "LatchingSwitch",

        /**
         * MomentarySwitch (MS)
         *
         * This feature flag is for a switch that does not maintain its position after being pressed (or turned). After
         * releasing, it goes back to its idle position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.4.2
         */
        MomentarySwitch = "MomentarySwitch",

        /**
         * MomentarySwitchRelease (MSR)
         *
         * This feature flag is for a momentary switch that can distinguish and report release events.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.4.3
         */
        MomentarySwitchRelease = "MomentarySwitchRelease",

        /**
         * MomentarySwitchLongPress (MSL)
         *
         * This feature flag is for a momentary switch that can distinguish and report long presses from short presses.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.4.4
         */
        MomentarySwitchLongPress = "MomentarySwitchLongPress",

        /**
         * MomentarySwitchMultiPress (MSM)
         *
         * This feature flag is for a momentary switch that can distinguish and report double press and potentially
         * multiple presses with more events, such as triple press, etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.4.5
         */
        MomentarySwitchMultiPress = "MomentarySwitchMultiPress",

        /**
         * ActionSwitch (AS)
         *
         * This feature flag indicates simplified handling of events for multi-press-capable switches. See Section
         * 1.13.8, “Sequence of events for MultiPress”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.4.6
         */
        ActionSwitch = "ActionSwitch"
    }

    /**
     * This event shall be generated to indicate how many times the momentary switch has been pressed in a multi-press
     * sequence, after it has been detected that the sequence has ended. See Section 1.13.8, “Sequence of events for
     * MultiPress”.
     *
     * The PreviousPosition field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to
     * release.
     *
     * The TotalNumberOfPressesCounted field shall contain:
     *
     *   - a value of 0 when there was an aborted multi-press sequence, where the number of presses goes beyond
     *     MultiPressMax presses,
     *
     *   - a value of 1 when there was exactly one press in a multi-press sequence (and the sequence has ended), i.e.
     *     there was no double press (or more),
     *
     *   - a value of 2 when there were exactly two presses in a multi-press sequence (and the sequence has ended),
     *
     *   - a value of 3 when there were exactly three presses in a multi-press sequence (and the sequence has ended),
     *
     *   - a value of N when there were exactly N presses in a multi-press sequence (and the sequence has ended).
     *
     *     > [!NOTE]
     *
     *     > The introduction of TotalNumberOfPressesCounted supporting the value 0 may impact clients of switches using
     *       cluster revision 1 since such servers would not use this value of TotalNumberOfPressesCounted to indicate
     *       an aborted sequence. Clients SHOULD always act using the TotalNumberOfPressesCounted field taken into
     *       account since for values from 1 to MultiPressMax, the user action that led to the event was different
     *       depending on the count.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.7
     */
    export interface MultiPressCompleteEvent {
        previousPosition: number;
        totalNumberOfPressesCounted: number;
    }

    /**
     * This event shall be generated, when the latching switch is moved to a new position. It may have been delayed by
     * debouncing within the switch.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.1
     */
    export interface SwitchLatchedEvent {
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. after the move.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.1.1
         */
        newPosition: number;
    }

    /**
     * This event shall be generated, when the momentary switch starts to be pressed (after debouncing).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.2
     */
    export interface InitialPressEvent {
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.2.1
         */
        newPosition: number;
    }

    /**
     * This event shall be generated when the momentary switch has been pressed for a "long" time. The time interval
     * constituting a "long" time is manufacturer-determined, since it depends on the switch physics.
     *
     *   - When the AS feature flag is set, this event:
     *
     *     - shall NOT be generated during a multi-press sequence (since a long press is a separate cycle from any
     *       multi-press cycles);
     *
     *     - shall only be generated after the first InitialPress following a MultiPressComplete when a long press is
     *       detected after the idle time.
     *
     *   - Else, when the MSM feature flag is set, this event:
     *
     *     - shall NOT be generated during a multi-press sequence (since a long press is a separate cycle from any
     *       multi-press cycles);
     *
     *     - shall only be generated after the first InitialPress following a MultiPressComplete when a long press is
     *       detected after the idle time;
     *
     *     - shall NOT be generated after a MultiPressOngoing event without an intervening MultiPressComplete event.
     *
     * The above constraints imply that for a given activity detection cycle of a switch having MSM and/or MSL feature
     * flags set, the entire activity is either a single long press detection cycle of (InitialPress, LongPress,
     * LongRelease), or a single multi-press detection cycle (ending in MultiPressComplete), where presses that would
     * otherwise be reported as long presses are instead reported as a counted press in the MultiPressComplete event,
     * and as InitialPress/ShortRelease pairs otherwise (where applicable).
     *
     * The rationale for this constraint is the ambiguity of interpretation of events when mixing long presses and
     * multi-press events.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.3
     */
    export interface LongPressEvent {
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.3.1
         */
        newPosition: number;
    }

    /**
     * This event shall be generated, when the momentary switch has been released (after debouncing) and after having
     * been pressed for a long time, i.e. this event shall be generated when the switch is released if a LongPress event
     * has been generated since the previous InitialPress event. Also see Section 1.13.7, “Sequence of generated
     * events”.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.5
     */
    export interface LongReleaseEvent {
        /**
         * This field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to release.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.5.1
         */
        previousPosition: number;
    }

    /**
     * If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all, since
     * setting the Action Switch feature flag forbids the Momentary Switch ShortRelease (MSR) feature flag from being
     * set. Otherwise, the following paragraphs describe the situations where this event is generated.
     *
     * This event shall be generated, when the momentary switch has been released (after debouncing).
     *
     *   - If the server has the Momentary Switch LongPress (MSL) feature flag set, then this event shall be generated
     *     when the switch is released if no LongPress event had been generated since the previous InitialPress event.
     *
     *   - If the server does not have the Momentary Switch LongPress (MSL) feature flag set, this event shall be
     *     generated when the switch is released - even when the switch was pressed for a long time.
     *
     *   - Also see Section 1.13.7, “Sequence of generated events”.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.4
     */
    export interface ShortReleaseEvent {
        /**
         * This field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to release.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.4.1
         */
        previousPosition: number;
    }

    /**
     * If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all. Otherwise,
     * the following paragraphs describe the situations where this event is generated.
     *
     * This event shall be generated to indicate how many times the momentary switch has been pressed in a multi-press
     * sequence, during that sequence. See Section 1.13.8, “Sequence of events for MultiPress”.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.6
     */
    export interface MultiPressOngoingEvent {
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.6.1
         */
        newPosition: number;

        /**
         * This field shall contain:
         *
         *   - a value of 2 when the second press of a multi-press sequence has been detected,
         *
         *   - a value of 3 when the third press of a multi-press sequence has been detected,
         *
         *   - a value of N when the Nth press of a multi-press sequence has been detected.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.13.6.6.2
         */
        currentNumberOfPressesCounted: number;
    }

    export const id: ClusterId;
    export const name: "Switch";
    export const revision: 2;
    export const schema: typeof SwitchModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export const events: EventObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof Switch;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `Switch` instead of `Switch.Complete`)
     */
    export const Complete: typeof Switch;

    export const Typing: Switch;
}

export declare const SwitchCluster: typeof Switch;
export interface Switch extends ClusterTyping { Attributes: Switch.Attributes; Events: Switch.Events; Features: Switch.Features; Components: Switch.Components }
