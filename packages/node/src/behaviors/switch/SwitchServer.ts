/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { Switch } from "#clusters/switch";
import { Duration, Logger, MaybePromise, Millis, Observable, Seconds, Time, Timer } from "#general";
import { FieldElement } from "#model";
import { ClusterType, StatusCode, StatusResponseError } from "#types";
import { SwitchBehavior } from "./SwitchBehavior.js";

const DEFAULT_MULTIPRESS_DELAY = Millis(300);
const DEFAULT_LONG_PRESS_DELAY = Seconds(2);

const logger = Logger.get("SwitchServer");

const SwitchServerBase = SwitchBehavior.for(Switch.Complete).with(
    Switch.Feature.LatchingSwitch,
    Switch.Feature.MomentarySwitch,
    Switch.Feature.MomentarySwitchRelease,
    Switch.Feature.MomentarySwitchLongPress,
    Switch.Feature.MomentarySwitchMultiPress,
    Switch.Feature.ActionSwitch,
);

// Enhance Schema to define conformance for some of the additional state attributes
const schema = SwitchServerBase.schema!.extend({
    children: [
        FieldElement({
            name: "longPressDelay",
            type: "epoch-s",
            quality: "M",
            conformance: "MSL",
            default: DEFAULT_LONG_PRESS_DELAY,
        }),
        FieldElement({
            name: "multiPressDelay",
            type: "epoch-s",
            quality: "M",
            conformance: "MSM",
            default: DEFAULT_MULTIPRESS_DELAY,
        }),
        FieldElement({ name: "momentaryNeutralPosition", type: "uint8", quality: "O", conformance: "MS", default: 0 }),
    ],
});

/**
 * This is the default server implementation of {@link SwitchBehavior}.
 *
 * This implementation includes all features of {@link Switch.Cluster} and implements all mandatory commands.
 * You should use {@link SwitchServer.with} to specialize the class for the features your implementation
 * supports.
 *
 * To support all features and events the implementation adds some custom state attributes that can - or are required
 * to - be used. These are:
 * * `rawPosition` - The raw position of the switch. This is the position as reported by the device and is not yet
 *  debounced. If the position is already debounced, just set the `currentPosition` attribute. The debouncing uses the
 *  `debounceDelay` attribute value as timeframe in milliseconds and sets the `currentPosition` attribute when the value
 *  is stable for this timeframe.
 * * `debounceDelay` - The timeframe in milliseconds to wait until a newly reported position is considered stable.
 * * `longPressDelay` - The timeframe in milliseconds to wait until a position is considered "long" pressed. This
 *  attribute is REQUIRED if the device supports the Momentary Switch LongPress (MSL) feature.
 * * `multiPressDelay` - The timeframe in milliseconds starting with a stable release to detect multi-presses. This
 *  attribute is REQUIRED if the device supports the Momentary Switch MultiPress (MSM) feature.
 * * `momentaryNeutralPosition` - The number of the position considered as the neutral position for the momentary switch.
 *  This defaults to position 0 but can be changed by settings this attribute. it is available as soon as the Momentary
 *  Switch (MS) feature is used.
 */
export class SwitchBaseServer extends SwitchServerBase {
    declare protected internal: SwitchBaseServer.Internal;
    declare state: SwitchBaseServer.State;
    declare events: SwitchBaseServer.Events;
    static override readonly schema = schema;

    override initialize(): MaybePromise {
        this.state.rawPosition = this.state.currentPosition;
        this.internal.currentUnstablePosition = this.state.currentPosition;
        this.internal.previouslyReportedPosition = this.state.currentPosition;

        // Validate positions set to respect constraints, TODO: Remove with 1.3 update
        this.reactTo(this.events.rawPosition$Changing, this.#assertPositionInRange);
        this.reactTo(this.events.currentPosition$Changing, this.#assertPositionInRange);

        // Debounce raw position changes
        this.reactTo(this.events.rawPosition$Changed, this.#debounceRawPosition);

        // Handle switch position changes
        this.reactTo(this.events.currentPosition$Changed, this.#handleSwitchPositionChange);
    }

    /** Method to reset the state of the Switch to start a clean new cycle. Mainly relevant for automated testing. */
    resetState() {
        const neutralPosition = this.state.momentaryNeutralPosition;
        this.internal.currentUnstablePosition = neutralPosition;
        this.internal.previouslyReportedPosition = neutralPosition;
        this.internal.multiPressReportingAborted = false;
        this.internal.currentNumberOfPressesCounter = 1;
        this.internal.previousMultiPressPosition = null;
        this.internal.currentLongPressPosition = null;
        this.internal.currentIsLongPress = false;
        this.internal.multiPressTimer?.stop();
        this.internal.longPressTimer?.stop();
        logger.info("State of Switch got reset");
    }

    // TODO remove when Validator logic can assess that with 1.3 introduction
    #assertPositionInRange(position: number) {
        if (position < 0 || position >= this.state.numberOfPositions) {
            throw new StatusResponseError(`Position ${position} invalid`, StatusCode.ConstraintError);
        }
    }

    #debounceRawPosition(newPosition: number) {
        // When a debounce delay is set then we debounce the raw position, else we set the current position immediately
        if (this.state.debounceDelay) {
            this.internal.debounceTimer?.stop();

            this.internal.currentUnstablePosition = newPosition;
            this.internal.debounceTimer = Time.getTimer(
                "debounce",
                this.state.debounceDelay,
                this.callback(this.#setCurrentPositionAfterDebounce, { lock: true }),
            ).start();
        } else {
            this.state.currentPosition = newPosition;
        }
    }

    #setCurrentPositionAfterDebounce() {
        this.state.currentPosition = this.internal.currentUnstablePosition;
    }

    #handleSwitchPositionChange(newPosition: number) {
        // Latching Switch
        if (this.features.latchingSwitch) {
            // This event SHALL be generated, when the latching switch is moved to a new position.
            this.events.switchLatched?.emit({ newPosition }, this.context);
            return;
        }

        let pressSequenceFinished = false;

        // Momentary Switch
        if (
            newPosition !== this.state.momentaryNeutralPosition &&
            !this.internal.multiPressReportingAborted &&
            (!this.features.actionSwitch || !this.internal.multiPressTimer?.isRunning)
        ) {
            // This event SHALL be generated, when the momentary switch starts to be pressed.
            this.events.initialPress?.emit({ newPosition }, this.context);
        }

        if (this.features.momentarySwitchLongPress) {
            if (newPosition === this.state.momentaryNeutralPosition) {
                if (this.internal.longPressTimer?.isRunning) {
                    if (!this.features.actionSwitch) {
                        // If the server supports the Momentary Switch LongPress (MSL) feature, this event SHALL be generated
                        // when the switch is released if no LongPress event had been generated since the previous InitialPress
                        // event.
                        this.events.shortRelease?.emit(
                            { previousPosition: this.internal.previouslyReportedPosition },
                            this.context,
                        );
                    }
                } else if (this.internal.currentIsLongPress) {
                    // This event SHALL be generated, when the momentary switch has been released (after debouncing) and
                    // after having been pressed for a long time, i.e. this event SHALL be generated when the switch is
                    // released if a LongPress event has been generated since the previous InitialPress event.
                    this.events.longRelease?.emit(
                        { previousPosition: this.internal.previouslyReportedPosition },
                        this.context,
                    );
                    this.internal.multiPressTimer?.stop();
                    pressSequenceFinished = true;
                }
            }

            this.internal.longPressTimer?.stop();
            this.internal.currentIsLongPress = false;
            this.internal.currentLongPressPosition = null;

            if (newPosition !== this.state.momentaryNeutralPosition) {
                this.internal.currentLongPressPosition = newPosition;
                this.internal.longPressTimer = Time.getTimer(
                    "longPress",
                    this.state.longPressDelay ?? DEFAULT_LONG_PRESS_DELAY,
                    this.callback(this.#handleLongPress, { lock: true }),
                ).start();
            }
        } else if (this.features.momentarySwitchRelease && newPosition === this.state.momentaryNeutralPosition) {
            // If the server does not support the Momentary Switch LongPress (MSL) feature, this event SHALL be generated
            // when the switch is released - even when the switch was pressed for a long time.
            this.events.shortRelease?.emit(
                { previousPosition: this.internal.previouslyReportedPosition },
                this.context,
            );
        }

        if (this.features.momentarySwitchMultiPress) {
            if (
                this.internal.multiPressTimer?.isRunning &&
                newPosition !== this.state.momentaryNeutralPosition &&
                !this.internal.multiPressReportingAborted &&
                !this.internal.currentIsLongPress &&
                !pressSequenceFinished
            ) {
                // The Button is at the same position as the time before, so it is a multiPress
                // Increment the number of presses
                this.internal.currentNumberOfPressesCounter++;

                if (!this.features.actionSwitch) {
                    // Emit MultiPressOngoing event
                    this.events.multiPressOngoing?.emit(
                        {
                            newPosition,
                            currentNumberOfPressesCounted: this.internal.currentNumberOfPressesCounter,
                        },
                        this.context,
                    );
                }

                if (
                    this.state.multiPressMax !== undefined &&
                    this.internal.currentNumberOfPressesCounter > this.state.multiPressMax
                ) {
                    this.internal.multiPressReportingAborted = true;
                    this.events.multiPressComplete?.emit(
                        {
                            previousPosition: newPosition,
                            totalNumberOfPressesCounted: 0,
                        },
                        this.context,
                    );
                    pressSequenceFinished = true;
                }
            }
            this.internal.multiPressTimer?.stop();

            if (!pressSequenceFinished) {
                this.internal.multiPressTimer = Time.getTimer(
                    "multiPress",
                    this.state.multiPressDelay ?? DEFAULT_MULTIPRESS_DELAY,
                    this.callback(this.#handleMultiPressComplete, { lock: true }),
                ).start();
            }
            if (this.internal.previouslyReportedPosition !== this.state.momentaryNeutralPosition) {
                this.internal.previousMultiPressPosition = this.internal.previouslyReportedPosition;
            }
        }
        // Store the currently processed position to be used as "previous" in some events
        this.internal.previouslyReportedPosition = newPosition;
    }

    // Method is called by a timer, so no change to the position for longPressDelay
    #handleLongPress() {
        if (this.internal.currentLongPressPosition === null || this.internal.currentNumberOfPressesCounter > 1) {
            return;
        }
        // This event SHALL be generated, when the momentary switch has been pressed for a "long" time.
        this.events.longPress?.emit({ newPosition: this.internal.currentLongPressPosition }, this.context);
        this.internal.currentIsLongPress = true;
        this.internal.multiPressTimer?.stop();
    }

    #handleMultiPressComplete() {
        if (this.internal.previousMultiPressPosition === null || this.internal.longPressTimer?.isRunning) {
            return;
        }
        if (!this.internal.multiPressReportingAborted) {
            this.events.multiPressComplete?.emit(
                {
                    previousPosition: this.internal.previousMultiPressPosition,
                    totalNumberOfPressesCounted: this.internal.currentNumberOfPressesCounter,
                },
                this.context,
            );
        }

        // Reset the number of presses
        this.internal.currentNumberOfPressesCounter = 1;
        this.internal.multiPressReportingAborted = false;
        this.internal.previousMultiPressPosition = null;
    }

    override async [Symbol.asyncDispose]() {
        this.internal.debounceTimer?.stop();
        this.internal.longPressTimer?.stop();
        this.internal.multiPressTimer?.stop();
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace SwitchBaseServer {
    export class Internal {
        /** Timer to debounce the raw position. */
        debounceTimer?: Timer;

        /** Timer to detect a long press. */
        longPressTimer?: Timer;

        /** Timer to detect multi presses. */
        multiPressTimer?: Timer;

        /** Counter to count the number of presses. */
        currentNumberOfPressesCounter: number = 1;

        /** Indicator if the multi press sequence was aborted. */
        multiPressReportingAborted = false;

        /** Position previously reported in events. */
        previouslyReportedPosition: number = 0;

        /** Position of the previous multi press. */
        previousMultiPressPosition: number | null = null;

        /** Position of the current long press. */
        currentLongPressPosition: number | null = null;

        /** Flag to indicate if the current press is a long press. */
        currentIsLongPress: boolean = false;

        /** Position of the current unstable position which is debounced */
        currentUnstablePosition: number = 0;
    }

    export class State extends SwitchServerBase.State {
        /** Raw position of the switch. Set this to debounce the value. */
        rawPosition: number = 0;

        /**
         * Debounce Delay to wait until a newly reported raw position is considered stable and written to the
         * currentPosition attribute.
         */
        debounceDelay?: Duration;

        /** Time to wait until a value is considered "long" pressed */
        longPressDelay?: Duration;

        /** Timeframe starting with a stable release to detect multi-presses. */
        multiPressDelay?: Duration;

        /** Number of the position considered as the neutral position for the momentary switch. */
        momentaryNeutralPosition: number = 0;
    }

    /** Enhance the relevant events for rawPosition attribute. */
    export class Events extends SwitchServerBase.Events {
        rawPosition$Changed = Observable<[value: number, oldValue: number, context?: ActionContext]>();
        rawPosition$Changing = Observable<[value: number, oldValue: number, context?: ActionContext]>();
    }
}

// Reset all Features
export class SwitchServer extends SwitchBaseServer.for(ClusterType(Switch.Base)) {}
