/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { Duration, Logger, MaybePromise, Millis, Observable, Seconds, Time, Timer } from "@matter/general";
import { FieldElement } from "@matter/model";
import { Status, StatusResponseError } from "@matter/types";
import { Switch } from "@matter/types/clusters/switch";
import { SwitchBehavior } from "./SwitchBehavior.js";

const DEFAULT_MULTIPRESS_DELAY = Millis(300);
const DEFAULT_LONG_PRESS_DELAY = Seconds(2);

const logger = Logger.get("SwitchServer");

const SwitchServerBase = SwitchBehavior.with(
    Switch.Feature.LatchingSwitch,
    Switch.Feature.MomentarySwitch,
    Switch.Feature.MomentarySwitchRelease,
    Switch.Feature.MomentarySwitchLongPress,
    Switch.Feature.MomentarySwitchMultiPress,
);

// Enhance Schema to define conformance for some of the additional state attributes
const schema = SwitchServerBase.schema.extend({
    children: [
        FieldElement({
            name: "longPressDelay",
            type: "duration",
            conformance: "MSL",
            default: DEFAULT_LONG_PRESS_DELAY,
        }),
        FieldElement({
            name: "multiPressDelay",
            type: "duration",
            conformance: "MSM",
            default: DEFAULT_MULTIPRESS_DELAY,
        }),
        FieldElement({
            name: "momentaryNeutralPosition",
            type: "uint8",
            conformance: "[MS]",
            default: 0,
        }),
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
 *  is stable for this timeframe. Report positions either through `rawPosition` or through `currentPosition`, not both;
 *  mixing them leaves the order of events undefined.
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
    declare readonly state: SwitchBaseServer.State;
    declare readonly events: SwitchBaseServer.Events;
    static override readonly schema = schema;

    override initialize(): MaybePromise {
        this.state.rawPosition = this.state.currentPosition;
        this.internal.previouslyReportedPosition = this.state.currentPosition;

        // Validate positions set to respect constraints, TODO: Remove with 1.3 update
        this.reactTo(this.events.rawPosition$Changing, this.#assertPositionInRange);
        this.reactTo(this.events.currentPosition$Changing, this.#assertPositionInRange);

        // Debounce raw position changes
        this.reactTo(this.events.rawPosition$Changed, this.#debounceRawPosition);

        // Handle switch position changes and timer expiries in the order they occurred
        this.reactTo(this.events.currentPosition$Changed, this.#handleCommittedPosition);
        this.reactTo(this.internal.inputQueued, this.#processQueuedInputs, { lock: true });
    }

    /**
     * Method to reset the state of the Switch to start a clean new cycle. Mainly relevant for automated testing.
     *
     * Drops pending debounced positions and timer expiries, so nothing from before the reset is reported or written
     * after it, and continues from the current position.
     */
    resetState(): MaybePromise<void> {
        this.internal.debounceTimer?.stop();
        this.internal.multiPressTimer?.stop();
        this.internal.longPressTimer?.stop();
        this.internal.inputs.length = 0;
        this.internal.previouslyReportedPosition = this.state.currentPosition;
        this.internal.currentLongPressPosition = null;
        this.internal.currentIsLongPress = false;
        this.#endMultiPressSequence();
        logger.info("State of Switch got reset");

        // The commit of a debounced position may still hold the lock
        return MaybePromise.then(this.context.transaction.lock(this), () => {
            this.state.rawPosition = this.state.currentPosition;
        });
    }

    // TODO remove when Validator logic can assess that with 1.3 introduction
    #assertPositionInRange(position: number) {
        if (position < 0 || position >= this.state.numberOfPositions) {
            throw new StatusResponseError(`Position ${position} invalid`, Status.ConstraintError);
        }
    }

    #debounceRawPosition(newPosition: number) {
        this.internal.debounceTimer?.stop();

        // When a debounce delay is set then we debounce the raw position, else we set the current position immediately
        if (this.state.debounceDelay) {
            this.internal.debounceTimer = this.#startInputTimer("debounce", this.state.debounceDelay, {
                kind: "position",
                position: newPosition,
            });
        } else {
            this.state.currentPosition = newPosition;
        }
    }

    /**
     * Starts a timer that queues {@link input} when it expires.
     *
     * The input is queued synchronously, so it is processed in expiry order relative to every other input even when
     * the locked reaction runs later.
     */
    #startInputTimer(name: string, delay: Duration, input: SwitchBaseServer.Input) {
        const { inputs, inputQueued } = this.internal;
        return Time.getTimer(name, delay, () => {
            inputs.push(input);
            inputQueued.emit();
        }).start();
    }

    #processQueuedInputs() {
        this.#processInputs(true);
    }

    /**
     * Processes queued inputs in the order they occurred.
     *
     * @param writePositions whether to write debounced positions to the currentPosition attribute; false while a later
     * committed position is being handled, which a write would revert
     */
    #processInputs(writePositions: boolean) {
        const { inputs } = this.internal;
        for (let input = inputs.shift(); input !== undefined; input = inputs.shift()) {
            switch (input.kind) {
                case "position":
                    this.#handleSwitchPositionChange(input.position);
                    if (writePositions) {
                        this.state.currentPosition = input.position;

                        // Each debounced position commits in a transaction of its own so no change is coalesced away
                        if (inputs.length) {
                            this.internal.inputQueued.emit();
                        }
                        return;
                    }
                    break;

                case "longPress":
                    this.#handleLongPress();
                    break;

                case "multiPress":
                    this.#handleMultiPressComplete();
                    break;
            }
        }
    }

    #handleCommittedPosition(newPosition: number) {
        // This server handled the positions it wrote itself before writing them
        if (newPosition === this.internal.previouslyReportedPosition) {
            return;
        }

        // Inputs queued before this write precede it
        this.#processInputs(false);
        this.#handleSwitchPositionChange(newPosition);
    }

    #handleSwitchPositionChange(newPosition: number) {
        const previousPosition = this.internal.previouslyReportedPosition;
        if (newPosition === previousPosition) {
            return;
        }

        if (this.features.latchingSwitch) {
            // This event SHALL be generated, when the latching switch is moved to a new position.
            this.events.switchLatched?.emit({ newPosition }, this.context);
            this.internal.previouslyReportedPosition = newPosition;
            return;
        }

        const neutralPosition = this.state.momentaryNeutralPosition;
        const isPressed = newPosition !== neutralPosition;

        // A move between two pressed positions, as with a joystick, continues the press instead of starting a new one
        const isMove = isPressed && previousPosition !== neutralPosition;

        const { actionSwitch } = this.features;

        // Momentary Switch
        if (
            isPressed &&
            !this.internal.multiPressReportingAborted &&
            (!actionSwitch || (!isMove && !this.internal.multiPressSequenceActive))
        ) {
            // This event SHALL be generated, when the momentary switch starts to be pressed.
            this.events.initialPress?.emit({ newPosition }, this.context);
        }

        if (this.features.momentarySwitchLongPress) {
            if (!isPressed) {
                if (this.internal.currentIsLongPress) {
                    // This event SHALL be generated, when the momentary switch has been released (after debouncing) and
                    // after having been pressed for a long time, i.e. this event SHALL be generated when the switch is
                    // released if a LongPress event has been generated since the previous InitialPress event.
                    this.events.longRelease?.emit({ previousPosition }, this.context);
                } else if (this.internal.currentLongPressPosition !== null && !actionSwitch) {
                    // If the server supports the Momentary Switch LongPress (MSL) feature, this event SHALL be generated
                    // when the switch is released if no LongPress event had been generated since the previous InitialPress
                    // event.
                    this.events.shortRelease?.emit({ previousPosition }, this.context);
                }

                this.internal.longPressTimer?.stop();
                this.internal.currentIsLongPress = false;
                this.internal.currentLongPressPosition = null;
            } else if (isMove && (actionSwitch || this.internal.currentIsLongPress)) {
                // Long press detection restarts with each InitialPress, which an action switch does not report for a
                // move; a press reported as long stays long until its release
                this.internal.currentLongPressPosition = newPosition;
            } else {
                this.internal.longPressTimer?.stop();
                this.internal.currentIsLongPress = false;
                this.internal.currentLongPressPosition = newPosition;
                this.internal.longPressTimer = this.#startInputTimer("longPress", this.state.longPressDelay, {
                    kind: "longPress",
                });
            }
        } else if (this.features.momentarySwitchRelease && !isPressed) {
            // If the server does not support the Momentary Switch LongPress (MSL) feature, this event SHALL be generated
            // when the switch is released - even when the switch was pressed for a long time.
            this.events.shortRelease?.emit({ previousPosition }, this.context);
        }

        if (this.features.momentarySwitchMultiPress) {
            if (!isPressed) {
                if (this.internal.multiPressSequenceActive) {
                    this.internal.previousMultiPressPosition = previousPosition;
                    this.internal.multiPressTimer = this.#startInputTimer("multiPress", this.state.multiPressDelay, {
                        kind: "multiPress",
                    });
                }
            } else if (!isMove) {
                this.internal.multiPressTimer?.stop();

                if (!this.internal.multiPressSequenceActive) {
                    this.internal.multiPressSequenceActive = true;
                } else if (!this.internal.multiPressReportingAborted) {
                    this.#countFurtherPress(newPosition);
                }
            }
        }

        this.internal.previouslyReportedPosition = newPosition;
    }

    #countFurtherPress(newPosition: number) {
        this.internal.currentNumberOfPressesCounter++;

        if (
            this.state.multiPressMax !== undefined &&
            this.internal.currentNumberOfPressesCounter > this.state.multiPressMax
        ) {
            this.internal.multiPressReportingAborted = true;
            return;
        }

        if (!this.features.actionSwitch) {
            this.events.multiPressOngoing?.emit(
                {
                    newPosition,
                    currentNumberOfPressesCounted: this.internal.currentNumberOfPressesCounter,
                },
                this.context,
            );
        }
    }

    /** The switch was held in one press for longPressDelay. */
    #handleLongPress() {
        // A long press only starts a cycle of its own; a long press inside a multi-press sequence counts as a press
        if (this.internal.currentLongPressPosition === null || this.internal.currentNumberOfPressesCounter > 1) {
            return;
        }
        // This event SHALL be generated, when the momentary switch has been pressed for a "long" time.
        this.events.longPress?.emit({ newPosition: this.internal.currentLongPressPosition }, this.context);
        this.internal.currentIsLongPress = true;
        this.#endMultiPressSequence();
    }

    /** The switch stayed released for multiPressDelay. */
    #handleMultiPressComplete() {
        if (this.internal.previousMultiPressPosition !== null) {
            this.events.multiPressComplete?.emit(
                {
                    previousPosition: this.internal.previousMultiPressPosition,
                    totalNumberOfPressesCounted: this.internal.multiPressReportingAborted
                        ? 0
                        : this.internal.currentNumberOfPressesCounter,
                },
                this.context,
            );
        }

        this.#endMultiPressSequence();
    }

    #endMultiPressSequence() {
        this.internal.multiPressSequenceActive = false;
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
    /** An input that decides which events the switch generates, other than a write to currentPosition. */
    export type Input =
        | {
              /** A raw position stayed stable for debounceDelay. */
              kind: "position";
              position: number;
          }
        | {
              /** The switch was held in one press for longPressDelay. */
              kind: "longPress";
          }
        | {
              /** The switch stayed released for multiPressDelay. */
              kind: "multiPress";
          };

    export class Internal {
        /** Timer to debounce the raw position. */
        debounceTimer?: Timer;

        /** Timer to detect a long press. */
        longPressTimer?: Timer;

        /** Timer to detect the end of a multi press sequence; runs only while the switch is released. */
        multiPressTimer?: Timer;

        /** Inputs in the order they occurred whose consequences are not processed yet. */
        inputs = new Array<Input>();

        /** Emits when an input was queued. */
        inputQueued = Observable();

        /** Indicator if a multi press sequence is in progress, from its first press until it ends. */
        multiPressSequenceActive = false;

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
    }

    export class State extends SwitchServerBase.State {
        /** Raw position of the switch. Set this to debounce the value; do not also set `currentPosition` directly. */
        rawPosition: number = 0;

        /**
         * Debounce Delay to wait until a newly reported raw position is considered stable and written to the
         * currentPosition attribute.
         */
        debounceDelay?: Duration;

        /** Time to wait until a value is considered "long" pressed */
        longPressDelay: Duration = DEFAULT_LONG_PRESS_DELAY;

        /** Timeframe starting with a stable release to detect multi-presses. */
        multiPressDelay: Duration = DEFAULT_MULTIPRESS_DELAY;

        /** Number of the position considered as the neutral position for the momentary switch. */
        momentaryNeutralPosition: number = 0;

        // These are mandatory; provide reasonable defaults
        override numberOfPositions = 2;
        override multiPressMax = 2;
    }

    /** Enhance the relevant events for rawPosition attribute. */
    export class Events extends SwitchServerBase.Events {
        rawPosition$Changed = Observable<[value: number, oldValue: number, context?: ActionContext]>();
        rawPosition$Changing = Observable<[value: number, oldValue: number, context?: ActionContext]>();
    }
}

// Drop the features the base implementation enables internally so consumers select their own
export class SwitchServer extends SwitchBaseServer.with() {}
