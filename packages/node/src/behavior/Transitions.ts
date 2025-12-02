/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import {
    addValueWithOverflow,
    AsyncObservable,
    cropValueRange,
    Diagnostic,
    Duration,
    ImplementationError,
    Logger,
    MaybePromise,
    Millis,
    ObserverGroup,
    Time,
    Timer,
    Timespan,
    Timestamp,
} from "#general";
import { Behavior } from "./Behavior.js";
import { ClusterEvents } from "./cluster/ClusterEvents.js";
import { Events } from "./Events.js";
import { BehaviorBacking } from "./internal/BehaviorBacking.js";

const logger = Logger.get("Transition");

/**
 * Attribute transition management.
 *
 * This utility supports updates of one or more attributes of a single behavior when the change occurs gradually over
 * time.
 *
 * The nuances of integrating Matter transition semantics with a device can be complicated.  Matter specifies the
 * frequency of updates for levels and "remaining time" attributes.  These semantics may not map well to your device.
 *
 * This class attempts to offer implementors significant flexibility.  To that end, we offer several integration
 * approaches:
 *
 * 1. If you instantiate with {@link Transitions.Configuration.manageTransitions} as false, no transition occurs and
 *    device state updates instantly.
 *
 * 2. If you enable transition management but provide no other options, matter.js will perform transitions for you,
 *    updating values using a timer.  You probably do not want to use this option if your device supports transitions
 *    natively.
 *
 * 3. If you implement transitions in hardware or a bridged device, you can still use matter.js to track ongoing
 *    transitions and report remaining time.  To do this, extend this class and implement {@link transitionImmediately}
 *    and {@link transitionGradually}.  matter.js will report changes as you update local state and report transition
 *    completion when all attributes reach their target value or when you invoke {@link finish}.
 *
 * 4. You can also allow matter.js to operate a transition timer but apply value updates directly to hardware by
 *    overriding {@link applyUpdates} (and use `determineUpdates()` if needed) or {@link step}.  This is useful if your
 *    device does not support transitions natively, but you want to ensure that matter.js does not report values that
 *    do not reflect hardware state.
 *
 * Whichever approach you take, matter.js attempts to implement the Matter protocol as accurately as possible with the
 * information available.
 */
export class Transitions<B extends Behavior> {
    #endpoint: Endpoint;
    #timer?: Timer;
    #config: Transitions.Configuration<B>;
    #outstandingTick?: MaybePromise<void>;
    #staticRemainingTime = 0;
    #prevPublishedRemainingTime = 0;
    #propertyStates = {} as Record<string, Transitions.PropertyState<B>>;
    #observers?: ObserverGroup;
    #instrumentedProperties?: Set<string>;

    constructor(endpoint: Endpoint, config: Transitions.Configuration<B>) {
        this.#config = config;
        this.#endpoint = endpoint;
    }

    /**
     * Iterate over all active transitions.
     */
    [Symbol.iterator]() {
        return Object.values(this.#propertyStates)[Symbol.iterator]();
    }

    /**
     * Get iteration state for a specific property.
     */
    stateOf(name: Transitions.PropertyOf<B>): Transitions.PropertyState<B> | undefined {
        return this.#propertyStates[name];
    }

    /**
     * Calculate the distance between two values in a cyclic range. This is the default implementation only caring
     * about normal upwards and downwards transitions.
     */
    protected calculateCyclicDistance(
        currentValue: number,
        targetValue: number,
        changePerS: number,
        min: number,
        max: number,
    ): number {
        if (changePerS > 0) {
            // We want to transition upwards to target value or to max and then from min to target value
            if (currentValue > targetValue) {
                return Math.abs(currentValue - max) + Math.abs(max - targetValue);
            }
        } else if (currentValue < targetValue) {
            // We want to transition downwards to target value or to min and then from max to target value
            return Math.abs(currentValue - min) + Math.abs(min - targetValue);
        }
        return Math.abs(currentValue - targetValue);
    }

    /**
     * Initiate transition of an attribute.
     */
    start(transition: Transitions.Transition<B>) {
        const { name, owner, changePerS } = transition;
        let { targetValue } = transition;

        this.stop(name);

        const currentValue = (owner.state as Record<string, number>)[name];

        if (currentValue === targetValue) {
            return;
        }

        // Handle immediate transition
        if (!this.#config.manageTransitions || !changePerS || !Number.isFinite(changePerS)) {
            if (targetValue === undefined || targetValue === null) {
                return;
            }

            const { min, max } = this.#config.properties[name] ?? {};
            if (min !== undefined && targetValue < min) {
                targetValue = min;
            } else if (max !== undefined && targetValue > max) {
                targetValue = max;
            }

            logger.info(this.#logPrefix, "Set", Diagnostic.strong(name), "to", Diagnostic.strong(targetValue));

            return this.transitionImmediately(owner, name, targetValue);
        }

        const { min, max, cyclic } = this.#config.properties[name] ?? {};
        let distanceLeft: number | undefined = undefined;
        if (cyclic && targetValue !== undefined) {
            if (min === undefined || max === undefined) {
                throw new ImplementationError("Cyclic transition requires min and max values");
            }
            if (!transition.calculateCyclicDistance) {
                // Install default cyclic distance function if not customized
                transition.calculateCyclicDistance = (currentValue, targetValue) =>
                    this.calculateCyclicDistance(currentValue, targetValue, changePerS, min, max);
            }
            distanceLeft = Math.abs(transition.calculateCyclicDistance(currentValue, targetValue));
            if (distanceLeft === 0) {
                return;
            }
        } else if (min !== undefined && max !== undefined) {
            if ((changePerS < 0 && currentValue === min) || (changePerS > 0 && currentValue === max)) {
                return;
            }
        }

        this.#instrumentProperty(name);

        const attr: Transitions.PropertyState<B> = {
            name,
            configuration: transition,
            currentValue,
            changePerMs: changePerS / 1000,
            prevStepAt: Timestamp(Time.nowMs - (this.#config.stepInterval ?? Transitions.DEFAULT_STEP_INTERVAL)),
            distanceLeft,
        };

        this.#propertyStates[name] = attr;

        logger.info(
            this.#logPrefix,
            "Transitioning",
            Diagnostic.strong(name),
            Diagnostic.dict({
                from: currentValue,
                to: targetValue,
                rate: `${changePerS.toFixed(3)}/s`,
                distance: cyclic ? distanceLeft : undefined,
            }),
        );

        this.transitionGradually(attr);

        const { remainingTimeEvent } = this.#config;
        if (!remainingTimeEvent) {
            return;
        }

        const remainingTime = this.remainingTime;
        if (remainingTime < 10) {
            // For commands with a transition time or changes to the transition time less than 1 second, changes
            // to this attribute SHALL NOT be reported.
            attr.suppressReportingRemainingTimeOnFinish = true;
            return;
        }
        this.#updateRemainingTime(remainingTime, true);
    }

    #updateRemainingTime(newRemainingTime?: number, fromCommand = false) {
        if (newRemainingTime === undefined) {
            newRemainingTime = this.remainingTime;
        }

        // Only report if it changes from 0 to any value higher than 10
        if (this.#prevPublishedRemainingTime === 0 && newRemainingTime <= 10) {
            return;
        }

        // Only report if it changes, with a delta larger than 10, caused by an invoke of a command
        if (fromCommand && Math.abs(this.#prevPublishedRemainingTime - newRemainingTime) <= 10) {
            return;
        }

        const previousRemainingTime = this.#prevPublishedRemainingTime;
        this.#prevPublishedRemainingTime = newRemainingTime;
        this.#config.remainingTimeEvent?.emit(newRemainingTime, previousRemainingTime, undefined);
    }

    /**
     * Immediately change to a target value.
     *
     * The default implementation updates the local state value and calls `applyUpdates()`.
     */
    protected transitionImmediately(owner: B, name: Transitions.PropertyOf<B>, targetValue: number): MaybePromise {
        const result = this.applyUpdates(owner, { [name]: targetValue } as unknown as Partial<Transitions.StateOf<B>>);
        return MaybePromise.then(result, () => {});
    }

    /**
     * Initiate gradual transition to a target value.
     *
     * The default implementation starts a timer to drive transitions over time.
     */
    protected transitionGradually(_attr: Transitions.PropertyState<B>) {
        if (this.#timer === undefined) {
            this.#timer = Time.getPeriodicTimer(
                `transition-${this.#endpoint}-${this.#config.type.name}`,
                this.#config.stepInterval ?? Transitions.DEFAULT_STEP_INTERVAL,
                this.#step.bind(this),
            );

            this.#timer.start();
        }
    }

    /**
     * Stop transition of one or all attributes.
     */
    stop(name?: Transitions.PropertyOf<B>) {
        if (name === undefined) {
            this.#propertyStates = {} as Record<any, any>;
        } else {
            if (!(name in this.#propertyStates)) {
                return;
            }

            delete this.#propertyStates[name];

            if (Object.keys(this.#propertyStates).length) {
                // Other transitions are ongoing
                return;
            }
        }

        // We only get here if all transitions have stopped
        if (this.#timer) {
            this.#timer.stop();
            this.#timer = undefined;
        }
    }

    /**
     * Stop a transition of one or more attributes that has completed successfully.
     */
    finish(name?: Transitions.PropertyOf<B>): void {
        /**
         * Finish a single transition. Returns a boolean whether to emit remaining time of zero or not.
         */
        const finishOne = (state: Transitions.PropertyState<B>): boolean => {
            const { name } = state;
            logger.debug(this.#logPrefix, "Transition of", Diagnostic.strong(name), "finished");

            const { suppressReportingRemainingTimeOnFinish } = this.#propertyStates[name] ?? {};

            this.stop(state.name);

            const event = (this.#endpoint.events as Events.Generic<ClusterEvents.ChangedObservable<any>>)[
                this.#config.type.id
            ]?.[`${name}$Changed`];

            // Per specification, quieter events always emit at end of transition.  This will need an option in the
            // property configuration if this is ever not the case
            if (event?.isQuieter) {
                event.quiet.emitNow();
            }
            return !suppressReportingRemainingTimeOnFinish;
        };

        let reportRemainingTime = false;
        if (typeof name === "string") {
            const state = this.#propertyStates[name];
            if (state === undefined) {
                return;
            }

            reportRemainingTime = finishOne(state);
        } else {
            for (const state of this) {
                reportRemainingTime = reportRemainingTime || finishOne(state);
            }
        }

        // When all transitions are finished, emit remaining time of zero per specification
        if (!Object.keys(this.#propertyStates).length && reportRemainingTime) {
            this.#updateRemainingTime(0);
        }
    }

    /**
     * Free resources.
     */
    async close() {
        this.stop();

        if (this.#outstandingTick) {
            await this.#outstandingTick;
        }

        if (this.#observers) {
            this.#observers.close();
            this.#observers = undefined;
        }
        this.#instrumentedProperties = undefined;
    }

    /**
     * Set the static version of remaining time used when transition management is disabled.
     */
    set remainingTime(value: number) {
        this.#staticRemainingTime = this.#internalTimeOf(value);
    }

    /**
     * Determine time remaining in transition in (possibly fractional) seconds.
     *
     * This is computed dynamically based on the longest running individual attribute transition.
     */
    get remainingTime() {
        if (this.#config.manageTransitions === false) {
            if (this.#config.transitionEndTimeMs !== undefined) {
                const remaining = Timespan(Time.nowMs, this.#config.transitionEndTimeMs).duration;
                if (remaining < 0) {
                    return 0;
                }
                return this.#externalTimeOf(remaining);
            }

            return this.#externalTimeOf(this.#staticRemainingTime);
        }

        let remainingTime = 0;

        for (const name in this.#propertyStates) {
            const attrState = this.#propertyStates[name];

            const distanceLeft = this.#determineDistanceLeft(attrState);
            if (distanceLeft === undefined) {
                continue;
            }
            const attrRemainingTime = Math.abs(distanceLeft / attrState.changePerMs);
            if (attrRemainingTime > remainingTime) {
                remainingTime = attrRemainingTime;
            }
        }

        return this.#externalTimeOf(remainingTime);
    }

    #determineDistanceLeft(state: Transitions.PropertyState<B>) {
        const { distanceLeft, currentValue } = state;
        if (distanceLeft !== undefined) {
            return distanceLeft;
        }
        const { targetValue } = this.#determineTargetValue(state);
        if (targetValue === undefined) {
            return undefined;
        }
        return Math.abs(currentValue - targetValue);
    }

    /**
     * Update transitioning attributes for a behavior.
     *
     * You may override this method if you want matter.js to run a timer, but you want to handle value updates yourself.
     */
    protected async step(behavior: B) {
        const now = Time.nowMs;

        // Compute updated values for all transitioning attributes
        for (const prop of this) {
            const { currentValue, name, changePerMs } = prop;
            if (typeof currentValue !== "number") {
                this.#stepError(prop.name, "value is not numeric");
                continue;
            }
            const { cyclic, min, max } = this.#config.properties[name] ?? {};

            if (cyclic && (min === undefined || max === undefined)) {
                this.#stepError(prop.name, "min/max defined for cyclic property must be set");
                continue;
            }

            // Determine the unclamped next value
            const msSinceLastStep = now - prop.prevStepAt;
            const changeSinceLastStep = changePerMs * msSinceLastStep;
            let nextValue = cyclic
                ? addValueWithOverflow(currentValue, changeSinceLastStep, min!, max!)
                : min !== undefined && max !== undefined
                  ? cropValueRange(currentValue + changeSinceLastStep, min, max)
                  : currentValue + changeSinceLastStep;

            const { targetValue, targetDescription } = this.#determineTargetValue(prop);

            if (cyclic) {
                let distanceLeft = this.#determineDistanceLeft(prop);
                if (distanceLeft !== undefined && targetValue !== undefined) {
                    distanceLeft -= Math.abs(changeSinceLastStep);
                    if (distanceLeft <= 0) {
                        // We reached the target value
                        nextValue = targetValue;
                        prop.distanceLeft = 0;
                    } else {
                        prop.distanceLeft = distanceLeft;
                    }
                }
            } else {
                // Clamp nextValue to valid range
                if (prop.changePerMs < 0) {
                    if (targetValue !== undefined && nextValue < targetValue) {
                        nextValue = targetValue;
                    }
                } else if (prop.changePerMs > 0) {
                    if (targetValue !== undefined && nextValue > targetValue) {
                        nextValue = targetValue;
                    }
                } else {
                    // This shouldn't happen
                    this.#stepError(prop.name, "rate is zero");
                    continue;
                }

                // If there is no target value and no min/max value it is a configuration error and we do not step as this
                // would be infinite, which is only allowed for cyclic transitions
                if (targetValue === undefined) {
                    this.#stepError(prop.name, `there is no target value or ${targetDescription}`);
                    continue;
                }
            }

            prop.currentValue = nextValue;

            // Invoke step callback, if any
            const callbackPromise = prop.configuration.onStep?.call(behavior, nextValue);
            if (callbackPromise !== undefined) {
                await callbackPromise;
            }

            prop.prevStepAt = now;
        }

        const applyPromise = this.applyUpdates(behavior, this.determineUpdates(behavior));
        if (MaybePromise.is(applyPromise)) {
            await applyPromise;
        }
    }

    /** Determine the changes to be applied to the behavior and return as key-value object. */
    protected determineUpdates(behavior: B) {
        const state = behavior.state as Record<string, number | null>;
        const changes = {} as Partial<Transitions.StateOf<B>>;

        for (const prop of this) {
            const { name, currentValue } = prop;

            const nextValue = Math.round(currentValue);
            if (state[name] !== nextValue && (nextValue === null || typeof nextValue === "number")) {
                //logger.debug(this.#logPrefix, "Stepping", Diagnostic.strong(name), "to", nextValue);
                changes[name] = nextValue as unknown as Transitions.StateOf<B>[Transitions.PropertyOf<B>];
            }
        }

        return changes;
    }

    /**
     * This method is called to apply the changes to the behavior.
     * The default implementation detects the changed attributes using the method `determineChanges()`and updates the
     * state of the behavior.  It also returns them as an key-value object, which can be useful when just requiring the
     * changes values in an extended class.
     */
    protected applyUpdates(
        behavior: B,
        changes: Partial<Transitions.StateOf<B>>,
    ): MaybePromise<Partial<Transitions.StateOf<B>>> {
        const state = behavior.state as Record<string, number | null>;

        for (const name in changes) {
            const value = changes[name as Transitions.PropertyOf<B>];
            if (value !== undefined && (value === null || typeof value === "number")) {
                state[name] = value;
            }
        }

        return changes;
    }

    #step() {
        // Skip steps when callbacks overrun the tick interval
        if (this.#outstandingTick) {
            return;
        }

        const executeStep = async (agent: Agent) => {
            const behavior = agent.get(this.#config.type);

            // Obtain exclusive lock
            agent.context.transaction.addResourcesSync(behavior);
            await agent.context.transaction.begin();

            await this.step(behavior);
        };

        // Create a behavior to perform actual stepping
        const promise = (this.#outstandingTick = Promise.resolve(this.#endpoint.act("transition", executeStep))
            .catch(error => {
                logger.error(
                    this.#logPrefix,
                    "Aborting transition due to unhandled error during step management:",
                    error,
                );
                this.stop();
            })
            .finally(() => {
                if (this.#outstandingTick === promise) {
                    this.#outstandingTick = undefined;
                }
            }));
    }

    #stepError(name: string, message: string) {
        logger.warn(this.#logPrefix, "Not transitioning", Diagnostic.strong(name), "because", message);
        this.stop(name as Transitions.PropertyOf<B>);
    }

    #determineTargetValue(state: Transitions.PropertyState<B>) {
        const { name } = state.configuration;
        let { targetValue } = state.configuration;
        const { cyclic, min: minValue, max: maxValue } = this.#config.properties[name] ?? {};
        let targetDescription = "target value";

        if (!cyclic) {
            // Determine the actual target value and clamp nextValue to valid range
            if (state.changePerMs < 0) {
                if (targetValue === undefined || (minValue !== undefined && targetValue < minValue)) {
                    targetDescription = "min value";
                    targetValue = minValue;
                }
            } else if (state.changePerMs > 0) {
                if (targetValue === undefined || (maxValue !== undefined && targetValue > maxValue)) {
                    targetDescription = "max value";
                    targetValue = maxValue;
                }
            }
        }

        return {
            targetDescription,
            targetValue,
        };
    }

    get #logPrefix() {
        return Diagnostic.squash(Diagnostic.strong(`${this.#endpoint}#${this.#config.type.name}`), `:`);
    }

    #externalTimeOf(ms: number) {
        return Math.round(ms / (this.#config.externalTimeUnit ?? Transitions.DEFAULT_EXTERNAL_TIME_UNIT));
    }

    #internalTimeOf(externalUnits: number) {
        return Millis(externalUnits * (this.#config.externalTimeUnit ?? Transitions.DEFAULT_EXTERNAL_TIME_UNIT));
    }

    /**
     * We add event handlers for any property we transition.  If the property reaches the target value we end the
     * transition.
     *
     * This allows us to detect "end of transition" independent of the means of transition.
     */
    #instrumentProperty(name: Transitions.PropertyOf<B>) {
        if (this.#instrumentedProperties === undefined) {
            this.#instrumentedProperties = new Set();
        }

        if (this.#instrumentedProperties.has(name)) {
            return;
        }

        this.#instrumentedProperties.add(name);

        const event = (this.#endpoint.events as Events.Generic<ClusterEvents.ChangedObservable<any>>)[
            this.#config.type.id
        ]?.[`${name}$Changed`];
        if (!event) {
            return;
        }

        if (!this.#observers) {
            this.#observers = new ObserverGroup();
        }

        this.#observers.on(event, newValue => {
            const state = this.#propertyStates[name];
            if (state === undefined) {
                return;
            }

            const { targetValue } = this.#determineTargetValue(state);

            if (newValue === targetValue) {
                return this.finish(name);
            }
        });
    }
}

export namespace Transitions {
    export const DEFAULT_STEP_INTERVAL = Millis(100);
    export const DEFAULT_EXTERNAL_TIME_UNIT = Millis(100);

    /**
     * A valid transitionable attribute name for the specified type.
     */
    export type AttrOf<T extends Behavior.Type> = keyof {
        [K in keyof InstanceType<T>["state"]]: T[K] extends number | undefined | null ? true : never;
    };

    /**
     * Transition configuration.
     *
     * The {@link Transitions} accesses this configuration on-demand so values that change after initial construction
     * will affect ongoing behavior.
     */
    export interface Configuration<B extends Behavior> {
        /**
         * The behavior type this configuration applies to.
         */
        readonly type: Behavior.Type & { new (agent: Agent, backing: BehaviorBacking): B };

        /**
         * If this is false we do not manage transitions and "remaining time" behaves like a normal static value.
         *
         * Default is true.
         */
        readonly manageTransitions?: boolean;

        /**
         * Interval per external time unit.  Defaults to 100ms which is appropriate for CC & LVL "remaining time"
         * attribute that is defined as 10ths of a second.
         */
        readonly externalTimeUnit?: Duration;

        /**
         * The internal tick rate for transitions.
         *
         * This is the smallest time increment between value adjustments.
         *
         * Defaults to {@link DEFAULT_STEP_INTERVAL}.
         */
        readonly stepInterval?: Duration;

        /**
         * The end time for a transition if transition management is disabled.
         */
        readonly transitionEndTimeMs?: number;

        /**
         * An observable associated with the "remaining time" value.
         *
         * If present, the {@link Transitions} forces an emit under conditions defined in spec for the "RemainingTime"
         * attribute of Level Control & Color Control clusters.
         *
         * This should also support Valve Configuration & Control cluster's "RemainingDuration" attribute with
         * additional options to support small variations in logic.
         */
        readonly remainingTimeEvent?: AsyncObservable<[oldValue: number, newValue: number, context: undefined]>;

        /**
         * The state properties that support transition.
         */
        readonly properties: Partial<Record<PropertyOf<B>, PropertyConfiguration>>;
    }

    /**
     * Configures a state property to support transitions.  This is typically an attribute but we support transition of
     * any numeric property.
     */
    export interface PropertyConfiguration {
        /**
         * A lower bound on the transition value.
         */
        readonly min?: number | undefined;

        /**
         * An upper bound on the transition value.
         */
        readonly max?: number | undefined;

        /**
         * Is the property transitioning ina cyclic manner? means it overflows to the min value when it reaches the max
         */
        cyclic?: boolean;
    }

    export type StateOf<B extends Behavior> = {
        [N in string & keyof B["state"]]: B[N] extends number | null | undefined ? true : never;
    };

    export type PropertyOf<B extends Behavior> = keyof StateOf<B>;

    /**
     * Configuration for transition of a specific attribute.
     */
    export interface Transition<B extends Behavior> {
        /**
         * The attribute to transition.
         */
        readonly name: PropertyOf<B>;

        /**
         * The behavior instance requesting transition.
         */
        readonly owner: B;

        /**
         * The amount to change the attribute per second.
         */
        readonly changePerS?: number | null;

        /**
         * The target value for the transition.
         *
         * If the property is not transitioning "cyclic" the following rules apply:
         *
         * * If undefined, transitions to the min/max value.
         *
         * * If no min or max is defined and no target value is supplied the transition will not run.
         *
         * If the property is transitioning "cyclic" the following rules apply:
         *
         * * If undefined, the transition will be endless and needs to be stopped manually.
         *
         * * If a target value is defined, the transition logic calculates the distance to the target value and stops
         *   on the target value once this distance was processed. By default, the distance is calculated linearly, but
         *   this behavior can be overridden with the custom function below.
         */
        readonly targetValue?: number;

        /**
         * A function to calculate the distance between the current value and the target value.
         */
        calculateCyclicDistance?: (currentValue: number, targetValue: number) => number;

        /**
         * Invoked every time the transitioning value changes before committing the mutating transaction.
         */
        onStep?: (this: B, value: number) => MaybePromise<void>;
    }

    /**
     * Internal state related to actively transitioning attributes.
     */
    export interface PropertyState<B extends Behavior> {
        /**
         * The property name.
         */
        name: PropertyOf<B>;

        /**
         * Configuration for any active transition.
         */
        configuration: Transition<B>;

        /**
         * The current value for the transition.
         *
         * We track separately from canonical value because we transition using floats but values are typically
         * integers.  This allows us to avoid rounding errors.
         */
        currentValue: number;

        /**
         * The change in value per millisecond.
         */
        changePerMs: number;

        /**
         * The distance left in the transition for cyclic properties.
         */
        distanceLeft?: number;

        /**
         * The time of the last step.
         */
        prevStepAt: Timestamp;

        /**
         * Set to true when the reporting of remaining time should be suppressed when finishing the transition.
         * This usually is used for transitions that are faster than 1s.
         */
        suppressReportingRemainingTimeOnFinish?: boolean;
    }
}
