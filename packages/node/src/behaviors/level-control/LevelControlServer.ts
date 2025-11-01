/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { Transitions } from "#behavior/Transitions.js";
import { ColorControlServer } from "#behaviors/color-control";
import { GeneralDiagnosticsBehavior } from "#behaviors/general-diagnostics";
import { OnOffServer } from "#behaviors/on-off";
import { ScenesManagementServer } from "#behaviors/scenes-management";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { LevelControl } from "#clusters/level-control";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AsyncObservable, cropValueRange, Identity, Logger, MaybePromise, Millis } from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { Val } from "#protocol";
import { ClusterType, StatusCode, StatusResponseError, TypeFromPartialBitSchema } from "#types";
import { LevelControlBehavior } from "./LevelControlBehavior.js";

const logger = Logger.get("LevelControlServer");

const LevelControlBase = LevelControlBehavior.with(LevelControl.Feature.OnOff, LevelControl.Feature.Lighting);

/**
 * This is the default server implementation of {@link LevelControlBehavior}.
 *
 * You should use {@link LevelControlServer.with} to specialize the class for the features your implementation supports.
 *
 * This implementation includes all features of {@link LevelControl.Cluster} and all mandatory commands. It also handles
 * the OnOff cluster dependency and the ColorControl dependency as defined by the Matter specification.
 *
 * By default, this implementation ignores transition times and sets levels immediately.  You can set
 * {@link LevelControl.State#managedTransitionTimeHandling} to enable higher-level logic in Matter.js to manage level
 * changes.
 *
 * If your hardware supports transitions natively, you may override {@link createTransitions} to return a
 * {@link Transitions} implementation adapted to your hardware.  This allows matter.js to handle Matter requirements
 * such as remaining time and level reporting.
 *
 * Alternatively, you may override the following methods in this class to implement lower-level logic yourself.
 * Implementing a cluster in this way will disable much of the logic matter.js implements for you in the default
 * implementations.
 *
 * * {@link LevelControlBaseServer.moveToLevelLogic} moves the value to a defined level with a transition time
 * * {@link LevelControlBaseServer.moveLogic} moves the value up or down with a defined rate
 * * {@link LevelControlBaseServer.stepLogic} steps the value up or down with a defined step size and transition
 * * {@link LevelControlBaseServer.stopLogic} stops any currently running transitions
 * * {@link LevelControlBaseServer.couple} couples the current level with other clusters (e.g. ColorControl)
 * * {@link LevelControlBaseServer.handleOnOffChange} transition to onLevel when device turns on or off
 *
 * All overridable methods may be implemented sync or async by returning a Promise.
 */
export class LevelControlBaseServer extends LevelControlBase {
    declare protected internal: LevelControlBaseServer.Internal;
    declare state: LevelControlBaseServer.State;
    declare events: LevelControlBaseServer.Events;

    /** Returns the minimum level, including feature specific fallback value handling. */
    get minLevel() {
        return this.state.minLevel ?? (this.features.lighting ? 1 : 0);
    }

    /** Returns the maximum level, including feature specific fallback value handling. */
    get maxLevel() {
        return this.state.maxLevel ?? 0xfe;
    }

    /**
     * The current level value as number.
     *
     * Throws a StatusResponse Error when null.
     */
    get currentLevel(): number {
        if (this.state.currentLevel === null) {
            throw new StatusResponseError(
                "The currentLevel value is null, so we cannot operate on it.",
                StatusCode.Failure,
            );
        }
        return this.state.currentLevel;
    }

    override initialize(): MaybePromise {
        // As a virtual attribute remaining time change only emits when we do so manually.  This works out well because
        // as a continuous value it should only emit under limited circumstances defined by spec
        //
        // We disable normal "quieter" suppression so it always emits when we emit manually
        if (this.events.remainingTime$Changed !== undefined) {
            this.events.remainingTime$Changed.quiet.config = {
                suppressionEnabled: false,
            };
        }

        // Configure transition management
        this.internal.transitions = this.#initializeTransitions();

        // Configure lighting feature
        if (this.features.lighting) {
            this.initializeLighting();
        }

        // Configure on/off feature
        if (this.features.onOff && this.agent.has(OnOffServer)) {
            this.initializeOnOff();
        }

        this.agent.maybeGet(ScenesManagementServer)?.implementScenes(this, this.#applySceneValues);
    }

    /**
     * Create transition management instance.
     *
     * We manage transitions using {@link Transitions} if
     * {@link LevelControlBaseServer.State#managedTransitionTimeHandling} is true.
     *
     * You may override this method to replace the {@link Transitions} implementation customized for your application.
     * The provided configuration object is the default one used for Level Control transitions, but can be adjusted
     * if needed.
     */
    protected createTransitions<B extends Behavior>(config: Transitions.Configuration<B>) {
        return new Transitions(this.endpoint, config);
    }

    #initializeTransitions() {
        const { endpoint } = this;

        // Transitions read continuously from their configuration object so the values need to be dynamic.  To make
        // this efficient we use the read-only view of our state provided by the endpoint as it is always available
        const readOnlyState = (endpoint.state as Record<string, unknown>).levelControl as LevelControlBaseServer.State;

        return this.createTransitions({
            type: LevelControlBaseServer,

            remainingTimeEvent: this.events.remainingTime$Changed,

            get manageTransitions() {
                return readOnlyState.managedTransitionTimeHandling;
            },

            get transitionEndTimeMs() {
                return readOnlyState.transitionEndTimeMs;
            },

            get stepInterval() {
                return readOnlyState.transitionStepInterval;
            },

            properties: {
                currentLevel: {
                    get min() {
                        return readOnlyState.minLevel;
                    },

                    get max() {
                        return readOnlyState.maxLevel;
                    },
                },
            },
        });
    }

    /**
     * Initialize lighting features.
     *
     * This only applies if the Level Control cluster has the "LT" feature enabled.
     */
    protected initializeLighting() {
        if (this.state.currentLevel === 0) {
            logger.warn(
                `The currentLevel value of ${this.state.currentLevel} is invalid according to Matter specification. The value must not be 0.`,
            );
        }
        if (this.minLevel !== 1) {
            logger.warn(
                `The minLevel value of ${this.minLevel} is invalid according to Matter specification. The value should be 1.`,
            );
        }
        if (this.maxLevel !== 0xfe) {
            logger.warn(
                `The maxLevel value of ${this.maxLevel} is invalid according to Matter specification. The value should be 254.`,
            );
        }

        if (this.#getBootReason() !== GeneralDiagnostics.BootReason.SoftwareUpdateCompleted) {
            const startUpLevelValue = this.state.startUpCurrentLevel ?? null;
            const currentLevelValue = this.state.currentLevel;
            let targetLevelValue: number | null;

            switch (startUpLevelValue) {
                case 0:
                    targetLevelValue = this.minLevel;
                    break;
                case null:
                    targetLevelValue = currentLevelValue;
                    break;
                default:
                    targetLevelValue = startUpLevelValue;
                    break;
            }

            if (targetLevelValue !== currentLevelValue) {
                this.state.currentLevel = asIntOrNull(targetLevelValue);
            }
        }
    }

    /**
     * Initialize On/Off cluster integration.
     *
     * This only applies if the Level Control cluster has the "OO" feature enabled.
     */
    protected initializeOnOff() {
        this.reactTo(this.agent.get(OnOffServer).events.onOff$Changed, this.handleOnOffChange);
    }

    /**
     * Default command implementation.
     *
     * After checking input we use {@link moveToLevelLogic} method to set the level.  To replace the default logic,
     * override {@link moveToLevelLogic} which also implements {@link moveToLevelWithOnOff}.
     */
    override moveToLevel({
        level,
        transitionTime,
        optionsMask,
        optionsOverride,
    }: LevelControl.MoveToLevelRequest): MaybePromise {
        const effectiveOptions = this.#calculateEffectiveOptions(optionsMask, optionsOverride);
        if (!this.#optionsAllowExecution(effectiveOptions)) {
            return;
        }

        level = cropValueRange(level, this.minLevel, this.maxLevel);

        this.#invalidateScenes();
        return this.moveToLevelLogic(level, transitionTime, false, effectiveOptions);
    }

    /**
     * Default command implementation.
     *
     * To replace this logic, override {@link moveToLevelLogic} whicih also implements {@link moveToLevel}.
     */
    override moveToLevelWithOnOff({ level, transitionTime }: LevelControl.MoveToLevelRequest): MaybePromise {
        level = cropValueRange(level, this.minLevel, this.maxLevel);

        this.#invalidateScenes();
        return this.moveToLevelLogic(level, transitionTime, true);
    }

    /**
     * Assert the rate value, throws error on invalid values and set default value if null
     */
    #assertRateValue(rate: number | null) {
        if (rate === 0) {
            throw new StatusResponseError(`Illegal move rate of 0`, StatusCode.InvalidCommand);
        }
        if (rate === null) {
            return this.state.defaultMoveRate ?? null;
        }
        return rate;
    }

    /**
     * Default "MoveToLevel" implementation.
     *
     * When a transition time is not null the implementation uses a step based logic to manage the move. It also checks
     * if the level is within min/max range and sets the level accordingly.
     *
     * @param level Level to set
     * @param transitionTime transition time
     * @param withOnOff true if the method is called by a "WithOnOff" command variant
     * @param options Options for the command
     */
    protected moveToLevelLogic(
        level: number,
        transitionTime: number | null,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
    ): MaybePromise {
        const effectiveTransitionTime = transitionTime ?? this.state.onOffTransitionTime ?? null;

        let effectiveRate;
        if (effectiveTransitionTime) {
            // Delay the calculation of the effective rate because the coupling to OnOff might change the currentLevel
            effectiveRate = (currentLevel: number) => ((level - currentLevel) / effectiveTransitionTime) * 10;
        }

        this.#invalidateScenes();
        return this.transition(level, effectiveRate, withOnOff, options);
    }

    /**
     * Default command implementation.
     *
     * After checking input we use {@link moveLogic} method to set the level.
     *
     * To replace default behavior, override {@link moveLogic} which also implements {@link moveWithOnOff}.
     */
    override move({ moveMode, rate, optionsMask, optionsOverride }: LevelControl.MoveRequest): MaybePromise {
        rate = this.#assertRateValue(rate);

        const effectiveOptions = this.#calculateEffectiveOptions(optionsMask, optionsOverride);
        if (!this.#optionsAllowExecution(effectiveOptions)) {
            return;
        }

        this.#invalidateScenes();
        return this.moveLogic(moveMode, rate, false, effectiveOptions);
    }

    /**
     * Default command implementation.
     *
     * We use {@link moveLogic} method to set the level.
     *
     * To replace default behavior, override {@link moveLogic} which also implements {@link move}.
     */
    override moveWithOnOff({ moveMode, rate }: LevelControl.MoveRequest): MaybePromise {
        rate = this.#assertRateValue(rate);

        this.#invalidateScenes();
        return this.moveLogic(moveMode, rate, true);
    }

    /**
     * Default implementation of the "Move" commands.
     *
     * When move rate is null and there is no default move rate, we move to to the min or max level directly. Otherwise
     * we apply step logic and increase or decrease by step size for every step.
     *
     * @param moveMode Mode (Up/Down) of the move action
     * @param rate Rate of the move action, null if no rate is provided and the default should be used
     * @param withOnOff true if the method is called by a *WithOnOff command
     * @param options Options for the command
     */
    protected moveLogic(
        moveMode: LevelControl.MoveMode,
        rate: number | null,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
    ): MaybePromise {
        let targetLevel;
        if (moveMode === LevelControl.MoveMode.Up) {
            targetLevel = Infinity;
        } else {
            targetLevel = -Infinity;
            if (rate) {
                rate *= -1;
            }
        }

        return this.transition(targetLevel, rate, withOnOff, options);
    }

    /**
     * Default command implementation.
     *
     * After checking options we use {@link stepLogic} to set the level.
     *
     * To replace default beahavior, override {@link stepLogic} which also implements {@link stepWithOnOff}.
     */
    override step({
        stepMode,
        stepSize,
        transitionTime,
        optionsMask,
        optionsOverride,
    }: LevelControl.StepRequest): MaybePromise {
        const effectiveOptions = this.#calculateEffectiveOptions(optionsMask, optionsOverride);
        if (!this.#optionsAllowExecution(effectiveOptions)) {
            return;
        }

        this.#invalidateScenes();
        return this.stepLogic(stepMode, stepSize, transitionTime, false, effectiveOptions);
    }

    /**
     * Default command implementation.
     *
     * To replace default beahavior, override {@link stepLogic} which also implements {@link step}.
     */
    override stepWithOnOff({ stepMode, stepSize, transitionTime }: LevelControl.StepRequest): MaybePromise {
        this.#invalidateScenes();
        return this.stepLogic(stepMode, stepSize, transitionTime, true);
    }

    /**
     * Default step implementation.
     *
     * When transition time is null, we move immediately to the min or max level. Otherwise we increase or decrease the
     * level by the step size for each step.
     *
     * @param stepMode Mode (Up/Down) of the step action
     * @param stepSize Size of the step action
     * @param transitionTime Time of the step action in 10th of a second
     * @param withOnOff true if the method is called by a *WithOnOff command
     * @param options Options for the command
     */
    protected stepLogic(
        stepMode: LevelControl.StepMode,
        stepSize: number,
        transitionTime: number | null,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
    ): MaybePromise {
        const direction = stepMode === LevelControl.StepMode.Up ? 1 : -1;

        let effectiveRate;
        if (transitionTime !== null) {
            effectiveRate = (stepSize / transitionTime) * 10 * direction;
        }

        return this.transition(this.currentLevel + stepSize * direction, effectiveRate, withOnOff, options);
    }

    override stop({ optionsMask, optionsOverride }: LevelControl.StopRequest): MaybePromise {
        const effectiveOptions = this.#calculateEffectiveOptions(optionsMask, optionsOverride);
        if (!this.#optionsAllowExecution(effectiveOptions)) {
            return;
        }

        this.#invalidateScenes();
        return this.stopLogic(effectiveOptions);
    }

    override stopWithOnOff(request: LevelControl.StopRequest): MaybePromise {
        return this.stop(request);
    }

    /**
     * Default stop logic. This aborts any level transition currently underway and sets the remaining time to 0.
     */
    protected stopLogic(_options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {}): MaybePromise {
        this.internal.transitions?.stop();
    }

    /**
     * Change to a designated level.
     *
     * @param targetLevel the new level once transition completes; if omitted transition will stop at min or max value
     * @param changePerS the move rate; 0 or nullish means transition instantly; use function to calculate rate based on current level after coupling logics
     * @param withOnOff if true follows rules for On/Off command variants
     * @param options additional options supplied by the client
     */
    protected transition(
        targetLevel?: number,
        changePerS?: number | null | ((currentLevel: number) => number),
        withOnOff = false,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
    ): MaybePromise {
        return MaybePromise.then(this.couple(withOnOff, options, targetLevel), () => {
            if (typeof changePerS === "function") {
                changePerS = changePerS(this.currentLevel);
            }
            this.internal.transitions?.start({
                name: "currentLevel",
                owner: this,
                changePerS,
                targetValue: targetLevel,

                onStep() {
                    this.couple(withOnOff, options, targetLevel);
                },
            });
        });
    }

    /**
     * Configure the current transaction to synchronize state with other clusters.
     *
     * This handles of on/off state in the On/Off cluster and color temperature in the Color Control cluster.
     */
    couple(
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
        targetLevel?: number,
    ): MaybePromise {
        let result: MaybePromise = undefined;

        // Couple with On/Off state
        if (this.features.onOff && withOnOff && this.agent.has(OnOffServer)) {
            if (targetLevel === undefined) {
                targetLevel = this.currentLevel;
            }

            if (targetLevel === this.minLevel) {
                // When moving to off, coupling occurs at end of transaction
                this.context.transaction.addParticipants({
                    preCommit: () => {
                        if (this.currentLevel === this.minLevel) {
                            const onOff = this.agent.get(OnOffServer);
                            if (onOff.state.onOff) {
                                onOff.state.onOff = false;
                                return true;
                            }
                        }

                        return false;
                    },
                });
            } else {
                // When moving toward on, coupling has immediate affect (this is required by CHIP tests)
                const onOff = this.agent.get(OnOffServer);
                if (!onOff.state.onOff) {
                    onOff.state.onOff = true;

                    if (this.state.onLevel !== null) {
                        // Ensure we move to "on" level before initiating any transition
                        result = this.handleOnOffChange(true);
                        this.internal.blockOnOffCouplingOnce = true; // But block the second call by listener
                        this.context.transaction.addParticipants({
                            postCommit: () => {
                                if (this.internal.blockOnOffCouplingOnce) {
                                    this.internal.blockOnOffCouplingOnce = false;
                                }
                            },
                        });
                    }
                }
            }
        }

        // Couple with ColorControl temp
        if (this.features.lighting && options.coupleColorTempToLevel && this.agent.has(ColorControlServer)) {
            this.context.transaction.addParticipants({
                preCommit: () => {
                    const colorControl = this.agent.get(ColorControlServer);
                    const prevTemp = colorControl.mireds;

                    const promise = colorControl.syncColorTemperatureWithLevel(this.currentLevel);
                    if (promise) {
                        return promise.then(() => colorControl.mireds !== prevTemp);
                    }

                    return colorControl.mireds !== prevTemp;
                },
            });
        }

        return result;
    }

    /**
     * Implement mandatory interaction with the OnOff cluster on the same endpoint when "OnOff" feature is enabled
     *
     * By default we set the current level to the onLevel value when the device is turned on.
     *
     * Other fading up/down logic required by the {@link MatterSpecification.v12.Cluster} §1.6.4.1.1 needs to be
     * implemented in a specialized implementation if needed.
     *
     * @param onOff The new onOff state
     */
    protected handleOnOffChange(onOff: boolean): MaybePromise {
        if (this.internal.blockOnOffCouplingOnce) {
            this.internal.blockOnOffCouplingOnce = false;
            return;
        }

        if (!onOff || this.state.onLevel === null) {
            return;
        }

        logger.debug(`OnOff changed to ON, setting level to onLevel value of ${this.state.onLevel}`);
        this.state.currentLevel = this.state.onLevel;
    }

    #calculateEffectiveOptions(
        optionsMask: TypeFromPartialBitSchema<typeof LevelControl.Options>,
        optionsOverride: TypeFromPartialBitSchema<typeof LevelControl.Options>,
    ): TypeFromPartialBitSchema<typeof LevelControl.Options> {
        const options = this.state.options ?? {};
        return {
            executeIfOff: optionsMask.executeIfOff ? optionsOverride.executeIfOff : options.executeIfOff,
            coupleColorTempToLevel: this.features.lighting
                ? optionsMask.coupleColorTempToLevel
                    ? optionsOverride.coupleColorTempToLevel
                    : options.coupleColorTempToLevel
                : false,
        };
    }

    #optionsAllowExecution(options: TypeFromPartialBitSchema<typeof LevelControl.Options>) {
        return (
            options.executeIfOff ||
            !this.features.onOff ||
            !this.agent.has(OnOffServer) ||
            this.agent.get(OnOffServer).state.onOff
        );
    }

    #getBootReason() {
        const rootEndpoint = this.env.get(ServerNode);
        if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
            return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
        }
    }

    /** Apply Scene values when requested from ScenesManagement cluster */
    #applySceneValues(values: Val.Struct, transitionTime: number): MaybePromise {
        const level = values.currentLevel;
        // If no number (including null), or already current level or outside our range, ignore
        // This is the only supported sceneable attribute in Level Control, so ignore all others for now
        if (
            typeof level !== "number" ||
            this.state.currentLevel === level ||
            cropValueRange(level, this.minLevel, this.maxLevel) !== level
        ) {
            return;
        }
        return this.moveToLevelLogic(level, transitionTime / 100, false, { executeIfOff: true });
    }

    /** Invalidate all stored scenes manually for this endpoint in the Scenesmanagement cluster because SDK behavior. */
    #invalidateScenes() {
        this.agent.maybeGet(ScenesManagementServer)?.makeAllFabricSceneInfoEntriesInvalid();
    }

    override async [Symbol.asyncDispose]() {
        if (this.internal.transitions) {
            await this.internal.transitions.close();
            this.internal.transitions = undefined;
        }
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace LevelControlBaseServer {
    export class Internal {
        /** Transition management. */
        transitions?: Transitions<LevelControlBaseServer>;

        /** Internal flag to avoid on/off coupling during transitions */
        blockOnOffCouplingOnce = false;
    }

    export class State extends LevelControlBase.State {
        /**
         * The default implementation always set the target level immediately and so ignores all transition times
         * requested or configured.
         *
         * Set this to true to manage transition changes using {@link Transitions}.  You should only use this if your
         * hardware doesn't support transition management on its own.
         */
        managedTransitionTimeHandling = false;

        /**
         * If transition management is disabled you may specify this as the "end time" for transitions.  The remaining
         * time attribute will then report correctly.
         */
        transitionEndTimeMs = undefined;

        /**
         * When managing transitions, this is the interval at which steps occur in ms.
         */
        transitionStepInterval = Millis(100);

        [Val.properties](endpoint: Endpoint) {
            // Only return remaining time if the attribute is defined in the endpoint
            if (
                (endpoint.behaviors.optionsFor(LevelControlBaseServer) as Record<string, unknown>)?.remainingTime ===
                    undefined &&
                (endpoint.behaviors.defaultsFor(LevelControlBaseServer) as Record<string, unknown>)?.remainingTime ===
                    undefined
            ) {
                return {};
            }
            return {
                set remainingTime(value: number) {
                    const transition = endpoint.behaviors.internalsOf(LevelControlBaseServer).transitions;
                    if (transition) {
                        transition.remainingTime = value;
                    }
                },

                get remainingTime() {
                    return endpoint.behaviors.internalsOf(LevelControlBaseServer).transitions?.remainingTime ?? 0;
                },
            };
        }
    }

    export class Events extends LevelControlBase.Events {
        transitionEndTime$Changed = AsyncObservable<[value: number, oldValue: number, context: ActionContext]>();
    }

    export declare const ExtensionInterface: {
        moveToLevelLogic(
            level: number,
            transitionTime: number | null,
            withOnOff: boolean,
            options: TypeFromPartialBitSchema<typeof LevelControl.Options>,
        ): MaybePromise;
        moveLogic(
            moveMode: LevelControl.MoveMode,
            rate: number | null,
            withOnOff: boolean,
            options: TypeFromPartialBitSchema<typeof LevelControl.Options>,
        ): MaybePromise;
        stepLogic(
            stepMode: LevelControl.StepMode,
            stepSize: number,
            transitionTime: number | null,
            withOnOff: boolean,
            options: TypeFromPartialBitSchema<typeof LevelControl.Options>,
        ): MaybePromise;
        stopLogic(options: TypeFromPartialBitSchema<typeof LevelControl.Options>): MaybePromise;
        couple(withOnOff: boolean, options: TypeFromPartialBitSchema<typeof LevelControl.Options>): MaybePromise;
        handleOnOffChange(onOff: boolean): MaybePromise;
        createTransitions<B extends Behavior>(config: Transitions.Configuration<B>): Transitions<B>;
    };
}

// We had turned on some more features to provide the default implementation, but export the cluster with no
// Features again.
export class LevelControlServer extends LevelControlBaseServer.for(ClusterType(LevelControl.Base)) {}

function asIntOrNull(value: number | null) {
    if (value === null) {
        return null;
    }

    return Math.round(value);
}

export interface LevelControlServerConstructor extends Identity<typeof LevelControlServer> {}
