/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Event, Attribute } from "../cluster/Cluster.js";
import { TlvUInt8 } from "../tlv/TlvNumber.js";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Switch {
    /**
     * These are optional features supported by SwitchCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.4
     */
    export enum Feature {
        /**
         * LatchingSwitch (LS)
         *
         * This feature flag is for a switch that maintains its position after being pressed (or turned).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.1
         */
        LatchingSwitch = "LatchingSwitch",

        /**
         * MomentarySwitch (MS)
         *
         * This feature flag is for a switch that does not maintain its position after being pressed (or turned). After
         * releasing, it goes back to its idle position.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.2
         */
        MomentarySwitch = "MomentarySwitch",

        /**
         * MomentarySwitchRelease (MSR)
         *
         * This feature flag is for a momentary switch that can distinguish and report release events.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.3
         */
        MomentarySwitchRelease = "MomentarySwitchRelease",

        /**
         * MomentarySwitchLongPress (MSL)
         *
         * This feature flag is for a momentary switch that can distinguish and report long presses from short presses.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.4
         */
        MomentarySwitchLongPress = "MomentarySwitchLongPress",

        /**
         * MomentarySwitchMultiPress (MSM)
         *
         * This feature flag is for a momentary switch that can distinguish and report double press and potentially
         * multiple presses with more events, such as triple press, etc.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.5
         */
        MomentarySwitchMultiPress = "MomentarySwitchMultiPress",

        /**
         * ActionSwitch (AS)
         *
         * This feature flag indicates simplified handling of events for multi-press-capable switches. See Section
         * 1.13.8, “Sequence of events for MultiPress”.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.6
         */
        ActionSwitch = "ActionSwitch"
    }

    /**
     * Body of the Switch multiPressComplete event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.7
     */
    export const TlvMultiPressCompleteEvent = TlvObject({
        previousPosition: TlvField(0, TlvUInt8),
        totalNumberOfPressesCounted: TlvField(1, TlvUInt8)
    });

    /**
     * Body of the Switch multiPressComplete event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.7
     */
    export interface MultiPressCompleteEvent extends TypeFromSchema<typeof TlvMultiPressCompleteEvent> {}

    /**
     * Body of the Switch switchLatched event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.1
     */
    export const TlvSwitchLatchedEvent = TlvObject({
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. after the move.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.1.1
         */
        newPosition: TlvField(0, TlvUInt8)
    });

    /**
     * Body of the Switch switchLatched event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.1
     */
    export interface SwitchLatchedEvent extends TypeFromSchema<typeof TlvSwitchLatchedEvent> {}

    /**
     * Body of the Switch initialPress event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.2
     */
    export const TlvInitialPressEvent = TlvObject({
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.2.1
         */
        newPosition: TlvField(0, TlvUInt8)
    });

    /**
     * Body of the Switch initialPress event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.2
     */
    export interface InitialPressEvent extends TypeFromSchema<typeof TlvInitialPressEvent> {}

    /**
     * Body of the Switch longPress event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.3
     */
    export const TlvLongPressEvent = TlvObject({
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.3.1
         */
        newPosition: TlvField(0, TlvUInt8)
    });

    /**
     * Body of the Switch longPress event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.3
     */
    export interface LongPressEvent extends TypeFromSchema<typeof TlvLongPressEvent> {}

    /**
     * Body of the Switch longRelease event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.5
     */
    export const TlvLongReleaseEvent = TlvObject({
        /**
         * This field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to release.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.5.1
         */
        previousPosition: TlvField(0, TlvUInt8)
    });

    /**
     * Body of the Switch longRelease event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.5
     */
    export interface LongReleaseEvent extends TypeFromSchema<typeof TlvLongReleaseEvent> {}

    /**
     * Body of the Switch shortRelease event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.4
     */
    export const TlvShortReleaseEvent = TlvObject({
        /**
         * This field shall indicate the previous value of the CurrentPosition attribute, i.e. just prior to release.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.4.1
         */
        previousPosition: TlvField(0, TlvUInt8)
    });

    /**
     * Body of the Switch shortRelease event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.4
     */
    export interface ShortReleaseEvent extends TypeFromSchema<typeof TlvShortReleaseEvent> {}

    /**
     * Body of the Switch multiPressOngoing event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.6
     */
    export const TlvMultiPressOngoingEvent = TlvObject({
        /**
         * This field shall indicate the new value of the CurrentPosition attribute, i.e. while pressed.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.6.1
         */
        newPosition: TlvField(0, TlvUInt8),

        /**
         * This field shall contain:
         *
         *   • a value of 2 when the second press of a multi-press sequence has been detected,
         *
         *   • a value of 3 when the third press of a multi-press sequence has been detected,
         *
         *   • a value of N when the Nth press of a multi-press sequence has been detected.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.6.2
         */
        currentNumberOfPressesCounted: TlvField(1, TlvUInt8.bound({ min: 2 }))
    });

    /**
     * Body of the Switch multiPressOngoing event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.6
     */
    export interface MultiPressOngoingEvent extends TypeFromSchema<typeof TlvMultiPressOngoingEvent> {}

    /**
     * A SwitchCluster supports these elements if it supports feature MomentarySwitchMultiPress.
     */
    export const MomentarySwitchMultiPressComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates how many consecutive presses can be detected and reported by a momentary switch which supports
             * multi-press (MSM feature flag set).
             *
             * For example, a momentary switch supporting single press, double press and triple press, but not quad
             * press and beyond, would return the value 3.
             *
             * When more than MultiPressMax presses are detected within a multi-press sequence:
             *
             *   • The server for cluster revision < 2 SHOULD generate a MultiPressComplete event with the
             *     TotalNumberOfPressesCounted field set to the value of the MultiPressMax attribute, and avoid
             *     generating any further InitialPress and MultiPressOngoing events until the switch has become fully
             *     idle (i.e. no longer in the process of counting presses within the multipress).
             *
             *   • The server for cluster revision >= 2 shall generate a MultiPressComplete event with the
             *     TotalNumberOfPressesCounted field set to zero (indicating an aborted sequence), and shall NOT
             *     generate any further InitialPress and MultiPressOngoing events until the switch has become fully idle
             *     (i.e. no longer in the process of counting presses within the multipress).
             *
             * This approach avoids unintentionally causing intermediate actions where there is a very long sequence of
             * presses beyond MultiPressMax that may be taken in account specially by switches (e.g. to trigger special
             * behavior such as factory reset for which generating events towards the client is not appropriate).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.5.3
             */
            multiPressMax: FixedAttribute(0x2, TlvUInt8.bound({ min: 2 }))
        },

        events: {
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
             *   • a value of 0 when there was an aborted multi-press sequence, where the number of presses goes beyond
             *     MultiPressMax presses,
             *
             *   • a value of 1 when there was exactly one press in a multi-press sequence (and the sequence has ended),
             *     i.e. there was no double press (or more),
             *
             *   • a value of 2 when there were exactly two presses in a multi-press sequence (and the sequence has
             *     ended),
             *
             *   • a value of 3 when there were exactly three presses in a multi-press sequence (and the sequence has
             *     ended),
             *
             *   • a value of N when there were exactly N presses in a multi-press sequence (and the sequence has
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
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.7
             */
            multiPressComplete: Event(0x6, Priority.Info, TlvMultiPressCompleteEvent)
        }
    });

    /**
     * A SwitchCluster supports these elements if it supports feature LatchingSwitch.
     */
    export const LatchingSwitchComponent = MutableCluster.Component({
        events: {
            /**
             * This event shall be generated, when the latching switch is moved to a new position. It may have been
             * delayed by debouncing within the switch.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.1
             */
            switchLatched: Event(0x0, Priority.Info, TlvSwitchLatchedEvent)
        }
    });

    /**
     * A SwitchCluster supports these elements if it supports feature MomentarySwitch.
     */
    export const MomentarySwitchComponent = MutableCluster.Component({
        events: {
            /**
             * This event shall be generated, when the momentary switch starts to be pressed (after debouncing).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.2
             */
            initialPress: Event(0x1, Priority.Info, TlvInitialPressEvent)
        }
    });

    /**
     * A SwitchCluster supports these elements if it supports feature MomentarySwitchLongPress.
     */
    export const MomentarySwitchLongPressComponent = MutableCluster.Component({
        events: {
            /**
             * This event shall be generated when the momentary switch has been pressed for a "long" time. The time
             * interval constituting a "long" time is manufacturer-determined, since it depends on the switch physics.
             *
             *   • When the AS feature flag is set, this event:
             *
             *     ◦ shall NOT be generated during a multi-press sequence (since a long press is a separate cycle from
             *       any multi-press cycles);
             *
             *     ◦ shall only be generated after the first InitialPress following a MultiPressComplete when a long
             *       press is detected after the idle time.
             *
             *   • Else, when the MSM feature flag is set, this event:
             *
             *     ◦ shall NOT be generated during a multi-press sequence (since a long press is a separate cycle from
             *       any multi-press cycles);
             *
             *     ◦ shall only be generated after the first InitialPress following a MultiPressComplete when a long
             *       press is detected after the idle time;
             *
             *     ◦ shall NOT be generated after a MultiPressOngoing event without an intervening MultiPressComplete
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
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.3
             */
            longPress: Event(0x2, Priority.Info, TlvLongPressEvent),

            /**
             * This event shall be generated, when the momentary switch has been released (after debouncing) and after
             * having been pressed for a long time, i.e. this event shall be generated when the switch is released if a
             * LongPress event has been generated since the previous InitialPress event. Also see Section 1.13.7,
             * “Sequence of generated events”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.5
             */
            longRelease: Event(0x4, Priority.Info, TlvLongReleaseEvent)
        }
    });

    /**
     * A SwitchCluster supports these elements if it supports feature MomentarySwitchRelease.
     */
    export const MomentarySwitchReleaseComponent = MutableCluster.Component({
        events: {
            /**
             * If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all,
             * since setting the Action Switch feature flag forbids the Momentary Switch ShortRelease (MSR) feature flag
             * from being set. Otherwise, the following paragraphs describe the situations where this event is
             * generated.
             *
             * This event shall be generated, when the momentary switch has been released (after debouncing).
             *
             *   • If the server has the Momentary Switch LongPress (MSL) feature flag set, then this event shall be
             *     generated when the switch is released if no LongPress event had been generated since the previous
             *     InitialPress event.
             *
             *   • If the server does not have the Momentary Switch LongPress (MSL) feature flag set, this event shall
             *     be generated when the switch is released - even when the switch was pressed for a long time.
             *
             *   • Also see Section 1.13.7, “Sequence of generated events”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.4
             */
            shortRelease: Event(0x3, Priority.Info, TlvShortReleaseEvent)
        }
    });

    /**
     * A SwitchCluster supports these elements if it supports feature MomentarySwitchMultiPress and it doesn't support
     * feature AS.
     */
    export const MomentarySwitchMultiPressNotActionSwitchComponent = MutableCluster.Component({
        events: {
            /**
             * If the server has the Action Switch (AS) feature flag set, this event shall NOT be generated at all.
             * Otherwise, the following paragraphs describe the situations where this event is generated.
             *
             * This event shall be generated to indicate how many times the momentary switch has been pressed in a
             * multi-press sequence, during that sequence. See Section 1.13.8, “Sequence of events for MultiPress”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.6.6
             */
            multiPressOngoing: Event(0x5, Priority.Info, TlvMultiPressOngoingEvent)
        }
    });

    /**
     * These elements and properties are present in all Switch clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x3b,
        name: "Switch",
        revision: 2,

        features: {
            /**
             * This feature flag is for a switch that maintains its position after being pressed (or turned).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.1
             */
            latchingSwitch: BitFlag(0),

            /**
             * This feature flag is for a switch that does not maintain its position after being pressed (or turned).
             * After releasing, it goes back to its idle position.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.2
             */
            momentarySwitch: BitFlag(1),

            /**
             * This feature flag is for a momentary switch that can distinguish and report release events.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.3
             */
            momentarySwitchRelease: BitFlag(2),

            /**
             * This feature flag is for a momentary switch that can distinguish and report long presses from short
             * presses.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.4
             */
            momentarySwitchLongPress: BitFlag(3),

            /**
             * This feature flag is for a momentary switch that can distinguish and report double press and potentially
             * multiple presses with more events, such as triple press, etc.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.5
             */
            momentarySwitchMultiPress: BitFlag(4),

            /**
             * This feature flag indicates simplified handling of events for multi-press-capable switches. See Section
             * 1.13.8, “Sequence of events for MultiPress”.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.4.6
             */
            actionSwitch: BitFlag(5)
        },

        attributes: {
            /**
             * Indicates the maximum number of positions the switch has. Any kind of switch has a minimum of 2
             * positions. Also see Section 1.13.10, “Multi Position Details” for the case NumberOfPositions>2.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.5.1
             */
            numberOfPositions: FixedAttribute(0x0, TlvUInt8.bound({ min: 2 })),

            /**
             * Indicates the position of the switch. The valid range is zero to NumberOfPositions - 1.
             *
             * CurrentPosition value 0 shall be assigned to the default position of the switch: for example the "open"
             * state of a rocker switch, or the "idle" state of a push button switch.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 1.13.5.2
             */
            currentPosition: Attribute(0x1, TlvUInt8, { persistent: true })
        },

        /**
         * This metadata controls which SwitchCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { momentarySwitchMultiPress: true }, component: MomentarySwitchMultiPressComponent },
            { flags: { latchingSwitch: true }, component: LatchingSwitchComponent },
            { flags: { momentarySwitch: true }, component: MomentarySwitchComponent },
            { flags: { momentarySwitchLongPress: true }, component: MomentarySwitchLongPressComponent },
            { flags: { momentarySwitchRelease: true }, component: MomentarySwitchReleaseComponent },
            {
                flags: { momentarySwitchMultiPress: true, actionSwitch: false },
                component: MomentarySwitchMultiPressNotActionSwitchComponent
            },
            { flags: { momentarySwitchRelease: true, momentarySwitch: false }, component: false },
            { flags: { momentarySwitchRelease: true, actionSwitch: true }, component: false },
            { flags: { momentarySwitchLongPress: true, momentarySwitch: false }, component: false },
            {
                flags: { momentarySwitchLongPress: true, momentarySwitchRelease: false, actionSwitch: false },
                component: false
            },
            { flags: { actionSwitch: true, momentarySwitchMultiPress: false }, component: false },
            {
                flags: { actionSwitch: false, momentarySwitchMultiPress: true, momentarySwitch: false },
                component: false
            },
            {
                flags: { actionSwitch: false, momentarySwitchMultiPress: true, momentarySwitchRelease: false },
                component: false
            },
            { flags: { actionSwitch: true, momentarySwitch: false }, component: false },
            { flags: { latchingSwitch: true, momentarySwitch: true }, component: false },
            { flags: { latchingSwitch: false, momentarySwitch: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster exposes interactions with a switch device, for the purpose of using those interactions by other
     * devices.
     *
     * Two types of switch devices are supported: latching switch (e.g. rocker switch) and momentary switch (e.g. push
     * button), distinguished with their feature flags.
     *
     * Interactions with the switch device are exposed as attributes (for the latching switch) and as events (for both
     * types of switches).
     *
     * An interested client may subscribe to these attributes/events and thus be informed of the interactions, and can
     * perform actions based on this, for example by sending commands to perform an action such as controlling a light
     * or a window shade.
     *
     * Per the Matter specification you cannot use {@link SwitchCluster} without enabling certain feature combinations.
     * You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 1.13
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const MSM = { momentarySwitchMultiPress: true };
    const LS = { latchingSwitch: true };
    const MS = { momentarySwitch: true };
    const MSL = { momentarySwitchLongPress: true };
    const MSR = { momentarySwitchRelease: true };
    const MSM_NOT_AS = { momentarySwitchMultiPress: true, actionSwitch: false };

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
            multiPressMax: MutableCluster.AsConditional(
                MomentarySwitchMultiPressComponent.attributes.multiPressMax,
                { mandatoryIf: [MSM] }
            )
        },

        events: {
            switchLatched: MutableCluster.AsConditional(
                LatchingSwitchComponent.events.switchLatched,
                { mandatoryIf: [LS] }
            ),
            initialPress: MutableCluster.AsConditional(
                MomentarySwitchComponent.events.initialPress,
                { mandatoryIf: [MS] }
            ),
            longPress: MutableCluster.AsConditional(
                MomentarySwitchLongPressComponent.events.longPress,
                { mandatoryIf: [MSL] }
            ),
            shortRelease: MutableCluster.AsConditional(
                MomentarySwitchReleaseComponent.events.shortRelease,
                { mandatoryIf: [MSR] }
            ),
            longRelease: MutableCluster.AsConditional(
                MomentarySwitchLongPressComponent.events.longRelease,
                { mandatoryIf: [MSL] }
            ),
            multiPressOngoing: MutableCluster.AsConditional(
                MomentarySwitchMultiPressNotActionSwitchComponent.events.multiPressOngoing,
                { mandatoryIf: [MSM_NOT_AS] }
            ),
            multiPressComplete: MutableCluster.AsConditional(
                MomentarySwitchMultiPressComponent.events.multiPressComplete,
                { mandatoryIf: [MSM] }
            )
        }
    });

    /**
     * This cluster supports all Switch features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type SwitchCluster = Switch.Cluster;
export const SwitchCluster = Switch.Cluster;
ClusterRegistry.register(Switch.Complete);
