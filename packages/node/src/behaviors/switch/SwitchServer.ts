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

        // Input reactors stay synchronous and unlocked so each input is decided when it occurs; only the resulting
        // events and position writes wait for the lock, and apply in that order
        this.reactTo(this.events.rawPosition$Changed, this.#handleRawPosition);
        this.reactTo(this.events.currentPosition$Changed, this.#handleWrittenPosition);
        this.reactTo(this.internal.debounceExpired, this.#handleDebouncedPosition);
        this.reactTo(this.internal.longPressExpired, this.#handleLongPress);
        this.reactTo(this.internal.multiPressExpired, this.#handleMultiPressComplete);
        this.reactTo(this.internal.resultsQueued, this.#applyQueuedResults, { lock: true });
    }

    /**
     * Method to reset the state of the Switch to start a clean new cycle. Mainly relevant for automated testing.
     *
     * Waits for the switch state lock, then drops pending debounced positions, timers and results not applied yet, so
     * nothing from before the reset is reported or written after it, and continues from the current position.
     */
    resetState(): MaybePromise<void> {
        return MaybePromise.then(this.context.transaction.lock(this), () => {
            this.internal.debounceTimer?.stop();
            this.internal.multiPressTimer?.stop();
            this.internal.longPressTimer?.stop();
            this.internal.results.length = 0;
            this.internal.positionBeingWritten = undefined;
            this.internal.previouslyReportedPosition = this.state.currentPosition;
            this.internal.currentLongPressPosition = null;
            this.internal.currentIsLongPress = false;
            this.internal.currentPressReported = false;
            this.#endMultiPressSequence();
            this.state.rawPosition = this.state.currentPosition;
            logger.info("State of Switch got reset");
        });
    }

    // TODO remove when Validator logic can assess that with 1.3 introduction
    #assertPositionInRange(position: number) {
        if (position < 0 || position >= this.state.numberOfPositions) {
            throw new StatusResponseError(`Position ${position} invalid`, Status.ConstraintError);
        }
    }

    #handleRawPosition(newPosition: number) {
        this.internal.debounceTimer?.stop();

        // Nothing is left to debounce for the decided position, such as after resetState() resynchronized rawPosition
        if (newPosition === this.internal.previouslyReportedPosition) {
            return;
        }

        // When a debounce delay is set then we debounce the raw position, else we use it immediately
        if (this.state.debounceDelay) {
            const { debounceExpired } = this.internal;
            this.internal.debounceTimer = Time.getTimer("debounce", this.state.debounceDelay, () =>
                debounceExpired.emit(newPosition),
            ).start();
            return;
        }

        // With nothing queued currentPosition equals the decided position, so a direct write is decided correctly
        if (this.internal.results.length) {
            this.#handleDebouncedPosition(newPosition);
        } else {
            this.state.currentPosition = newPosition;
        }
    }

    #handleDebouncedPosition(newPosition: number) {
        if (this.#queuePosition(newPosition)) {
            this.internal.resultsQueued.emit();
        }
    }

    /**
     * Decides a change to {@link newPosition} and queues its events and its write to currentPosition.
     *
     * @returns false if the position is unchanged
     */
    #queuePosition(newPosition: number) {
        if (newPosition === this.internal.previouslyReportedPosition) {
            return false;
        }
        this.#decidePosition(newPosition);
        this.internal.results.push({ kind: "position", position: newPosition });
        return true;
    }

    /**
     * A write to currentPosition by the application is an input of its own; the writes of this server were decided
     * when they were queued.
     */
    #handleWrittenPosition(newPosition: number) {
        if (newPosition === this.internal.positionBeingWritten) {
            this.internal.positionBeingWritten = undefined;
            return;
        }

        // The written position supersedes queued writes, which would revert it, but not the events queued before it
        this.internal.results = this.internal.results.filter(({ kind }) => kind === "event");

        if (newPosition !== this.internal.previouslyReportedPosition) {
            this.#decidePosition(newPosition);
        }
        this.#applyResults();
    }

    #applyQueuedResults() {
        if (this.#applyResults()) {
            this.internal.resultsQueued.emit();
        }
    }

    /**
     * Applies queued results in order, up to and including the next position write, so each write commits in a
     * transaction of its own and no change is coalesced away.
     *
     * @returns whether results remain queued
     */
    #applyResults() {
        const { results } = this.internal;
        for (let result = results.shift(); result !== undefined; result = results.shift()) {
            if (result.kind === "event") {
                result.emit(this);
                continue;
            }

            this.internal.positionBeingWritten = result.position;
            this.state.currentPosition = result.position;
            break;
        }
        return results.length > 0;
    }

    #queueEvent<T>(
        event: (events: SwitchBaseServer.Events) => { emit(payload: T, context: ActionContext): unknown } | undefined,
        payload: NoInfer<T>,
    ) {
        this.internal.results.push({
            kind: "event",
            emit: server => event(server.events)?.emit(payload, server.context),
        });
    }

    /** Decides the events of a change to {@link newPosition} and starts or stops the timers it affects. */
    #decidePosition(newPosition: number) {
        const previousPosition = this.internal.previouslyReportedPosition;
        this.internal.previouslyReportedPosition = newPosition;

        if (this.features.latchingSwitch) {
            // This event SHALL be generated, when the latching switch is moved to a new position.
            this.#queueEvent(events => events.switchLatched, { newPosition });
            return;
        }

        const neutralPosition = this.state.momentaryNeutralPosition;
        const isPressed = newPosition !== neutralPosition;

        // A move between two pressed positions, as with a joystick, continues the press instead of starting a new one
        const isMove = isPressed && previousPosition !== neutralPosition;

        const { actionSwitch } = this.features;

        // A press reported as long stays one press until its release; an action switch reports one press per cycle
        const isNewPress = actionSwitch
            ? !isMove && !this.internal.multiPressSequenceActive
            : !(isMove && this.internal.currentIsLongPress);

        // Momentary Switch
        if (isPressed && isNewPress) {
            if (!this.internal.multiPressReportingAborted) {
                // This event SHALL be generated, when the momentary switch starts to be pressed.
                this.#queueEvent(events => events.initialPress, { newPosition });
                this.internal.currentPressReported = true;
            } else if (!isMove) {
                this.internal.currentPressReported = false;
            }
        }

        if (this.features.momentarySwitchLongPress) {
            if (!isPressed) {
                if (this.internal.currentIsLongPress) {
                    // This event SHALL be generated, when the momentary switch has been released (after debouncing) and
                    // after having been pressed for a long time, i.e. this event SHALL be generated when the switch is
                    // released if a LongPress event has been generated since the previous InitialPress event.
                    this.#queueEvent(events => events.longRelease, { previousPosition });
                } else if (
                    this.internal.currentLongPressPosition !== null &&
                    !actionSwitch &&
                    this.internal.currentPressReported
                ) {
                    // If the server supports the Momentary Switch LongPress (MSL) feature, this event SHALL be generated
                    // when the switch is released if no LongPress event had been generated since the previous InitialPress
                    // event.
                    this.#queueEvent(events => events.shortRelease, { previousPosition });
                }

                this.internal.longPressTimer?.stop();
                this.internal.currentIsLongPress = false;
                this.internal.currentLongPressPosition = null;
            } else if (isMove && (actionSwitch || this.internal.currentIsLongPress)) {
                // Long press detection restarts with each InitialPress, which this move does not report
                this.internal.currentLongPressPosition = newPosition;
            } else {
                this.internal.longPressTimer?.stop();
                this.internal.currentIsLongPress = false;
                this.internal.currentLongPressPosition = newPosition;
                const { longPressExpired } = this.internal;
                this.internal.longPressTimer = Time.getTimer("longPress", this.state.longPressDelay, () =>
                    longPressExpired.emit(),
                ).start();
            }
        } else if (this.features.momentarySwitchRelease && !isPressed && this.internal.currentPressReported) {
            // If the server does not support the Momentary Switch LongPress (MSL) feature, this event SHALL be generated
            // when the switch is released - even when the switch was pressed for a long time.
            this.#queueEvent(events => events.shortRelease, { previousPosition });
        }

        if (!isPressed) {
            this.internal.currentPressReported = false;
        }

        if (this.features.momentarySwitchMultiPress) {
            if (!isPressed) {
                if (this.internal.multiPressSequenceActive) {
                    this.internal.previousMultiPressPosition = previousPosition;
                    const { multiPressExpired } = this.internal;
                    this.internal.multiPressTimer = Time.getTimer("multiPress", this.state.multiPressDelay, () =>
                        multiPressExpired.emit(),
                    ).start();
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
    }

    #countFurtherPress(newPosition: number) {
        this.internal.currentNumberOfPressesCounter++;
        const currentNumberOfPressesCounted = this.internal.currentNumberOfPressesCounter;

        if (this.state.multiPressMax !== undefined && currentNumberOfPressesCounted > this.state.multiPressMax) {
            this.internal.multiPressReportingAborted = true;
            return;
        }

        if (!this.features.actionSwitch) {
            this.#queueEvent(events => events.multiPressOngoing, { newPosition, currentNumberOfPressesCounted });
        }
    }

    /** The switch was held in one press for longPressDelay. */
    #handleLongPress() {
        // A long press only starts a cycle of its own; a long press inside a multi-press sequence counts as a press
        const newPosition = this.internal.currentLongPressPosition;
        if (newPosition === null || this.internal.currentNumberOfPressesCounter > 1) {
            return;
        }
        // This event SHALL be generated, when the momentary switch has been pressed for a "long" time.
        this.#queueEvent(events => events.longPress, { newPosition });
        this.internal.currentIsLongPress = true;
        this.#endMultiPressSequence();
        this.internal.resultsQueued.emit();
    }

    /** The switch stayed released for multiPressDelay. */
    #handleMultiPressComplete() {
        const previousPosition = this.internal.previousMultiPressPosition;
        if (previousPosition !== null) {
            this.#queueEvent(events => events.multiPressComplete, {
                previousPosition,
                totalNumberOfPressesCounted: this.internal.multiPressReportingAborted
                    ? 0
                    : this.internal.currentNumberOfPressesCounter,
            });
            this.internal.resultsQueued.emit();
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
    /** A decided consequence of a switch input, applied in the order the inputs occurred. */
    export type Result =
        | {
              /** Emits an event. */
              kind: "event";
              emit(server: SwitchBaseServer): void;
          }
        | {
              /** Writes the currentPosition attribute. */
              kind: "position";
              position: number;
          };

    export class Internal {
        /** Timer to debounce the raw position. */
        debounceTimer?: Timer;

        /** Timer to detect a long press. */
        longPressTimer?: Timer;

        /** Timer to detect the end of a multi press sequence; runs only while the switch is released. */
        multiPressTimer?: Timer;

        /** Emits the raw position that stayed stable for debounceDelay. */
        debounceExpired = Observable<[position: number]>();

        /** Emits when the switch was held in one press for longPressDelay. */
        longPressExpired = Observable();

        /** Emits when the switch stayed released for multiPressDelay. */
        multiPressExpired = Observable();

        /** Results in the order their inputs occurred that are not applied yet. */
        results = new Array<Result>();

        /** Emits when a result was queued. */
        resultsQueued = Observable();

        /** Position this server writes to currentPosition, whose change it decided already. */
        positionBeingWritten?: number;

        /** Indicator if a multi press sequence is in progress, from its first press until it ends. */
        multiPressSequenceActive = false;

        /** Counter to count the number of presses. */
        currentNumberOfPressesCounter: number = 1;

        /** Indicator if the multi press sequence was aborted. */
        multiPressReportingAborted = false;

        /** Indicator if the current press was reported with InitialPress; the release events refer to that report. */
        currentPressReported = false;

        /** Position of the latest decided change; it leads currentPosition while position writes are queued. */
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
