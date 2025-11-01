/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import { Transitions } from "#behavior/Transitions.js";
import { GeneralDiagnosticsBehavior } from "#behaviors/general-diagnostics";
import { OnOffServer } from "#behaviors/on-off";
import { ScenesManagementServer } from "#behaviors/scenes-management";
import { ColorControl } from "#clusters/color-control";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { Endpoint } from "#endpoint/Endpoint.js";
import {
    addValueWithOverflow,
    AsyncObservable,
    cropValueRange,
    ImplementationError,
    Logger,
    MaybePromise,
    Millis,
} from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { Val } from "#protocol";
import { ClusterType, StatusCode, StatusResponseError, TypeFromPartialBitSchema } from "#types";
import { ColorControlBehavior } from "./ColorControlBehavior.js";
import {
    hsvToMireds,
    hsvToXy,
    kelvinToMireds,
    miredsToHsv,
    miredsToKelvin,
    miredsToXy,
    xyToMireds,
} from "./ColorConversionUtils.js";

const logger = Logger.get("ColorControlServer");

const ColorControlBase = ColorControlBehavior.with(
    ColorControl.Feature.HueSaturation,
    ColorControl.Feature.EnhancedHue,
    ColorControl.Feature.ColorLoop,
    ColorControl.Feature.Xy,
    ColorControl.Feature.ColorTemperature,
);

const MIN_CIE_XY_VALUE = 0;
const MAX_CIE_XY_VALUE = 0xfeff; // this value comes directly from the ZCL specification table 5.3

const MIN_TEMPERATURE_VALUE = 0;
const MAX_TEMPERATURE_VALUE = 0xfeff;

const MIN_HUE_VALUE = 0;
const MAX_HUE_VALUE = 0xfe;
const MAX_ENHANCED_HUE_VALUE = 0xffff;

const MIN_SATURATION_VALUE = 0;
const MAX_SATURATION_VALUE = 0xfe;

const MIN_CURRENT_LEVEL = 0x01;
const MAX_CURRENT_LEVEL = 0xfe;

/**
 * This is the default server implementation of {@link ColorControlBehavior}.
 *
 * This implementation includes all features of {@link ColorControl.Cluster} and implements all mandatory commands. You
 * should use {@link ColorControlServer.with} to specialize the class for the features your implementation supports.
 *
 * This default implementation also handles together with the LevelControl cluster the currentLevel dependency as
 * defined by the Matter specification automatically.
 *
 * This implementation ignores by default all transition times and sets the new color immediately. Alternatively, you
 * can set the {@link ColorControl.State#managedTransitionTimeHandling} state attribute to true to have matter.js manage
 * transition times by changing the level value step-wise every second. This might be an intermediate solution if you
 * develop independently of defined hardware.
 *
 * If your hardware supports transitions natively, you may override {@link createTransitions} to return a
 * {@link Transitions} implementation adapted to your hardware.  This allows matter.js to handle Matter requirements
 * such as remaining time and level reporting.
 *
 * Alternatively, you may override the following methods in this class to implement lower-level logic yourself.
 * Implementing a cluster in this way will disable much of the logic matter.js implements for you in the default
 * implementations.
 *
 * * {@link ColorControlBaseServer.moveToHueLogic} Logic to move the hue to a defined value in a defined time
 * * {@link ColorControlBaseServer.moveHueLogic} Logic to move the hue by a defined rate/second
 * * {@link ColorControlBaseServer.stepHueLogic} Logic to move the hue one defined step in a defined time
 * * {@link ColorControlBaseServer.moveToSaturationLogic} Logic to move the saturation to a defined value in a defined
 *   time
 * * {@link ColorControlBaseServer.moveSaturationLogic} Logic to move the saturation by a defined rate/second
 * * {@link ColorControlBaseServer.stepSaturationLogic} Logic to move the saturation one defined step in a defined time
 * * {@link ColorControlBaseServer.moveToHueAndSaturationLogic} Logic to move the hue and saturation to a defined value
 *   in a defined time
 * * {@link ColorControlBaseServer.moveToColorLogic} Logic to move the x/y color to a defined value in a defined time
 * * {@link ColorControlBaseServer.moveColorLogic} Logic to move the x/y color by a defined rate/second
 * * {@link ColorControlBaseServer.stepColorLogic} Logic to move the x/y color one defined step in a defined time
 * * {@link ColorControlBaseServer.moveToColorTemperatureLogic} Logic to move the color temperature to a defined value
 *   in a defined time
 * * {@link ColorControlBaseServer.moveToEnhancedHueAndSaturationLogic} Logic to move the enhanced hue and saturation
 *   to a defined value in a defined time
 * * {@link ColorControlBaseServer.moveColorTemperatureLogic} Logic to move the color temperature by a defined
 *   rate/second
 * * {@link ColorControlBaseServer.stepColorTemperatureLogic} Logic to move the color temperature one defined step in a
 *   defined time
 * * {@link ColorControlBaseServer.stopHueAndSaturationMovement} Logic to stop any hue and saturation movements
 * * {@link ColorControlBaseServer.stopAllColorMovement} Logic to stop any color movements
 * * {@link ColorControlBaseServer.startColorLoopLogic} Logic to start the color loop (looping enhanced hue endlessly)
 * * {@link ColorControlBaseServer.stopColorLoopLogic} Logic to stop the color loop
 * * {@link ColorControlBaseServer.stopMoveStepLogic} Logic to stop all movements beside color loops
 * * {@link ColorControlBaseServer.switchColorMode} Logic to switch the color mode and to set the current attributes of
 *   the new mode
 *
 * All overridable methods may be implemented sync or async by returning a Promise.
 *
 * For own implementations you can use:
 *
 * * {@link ColorControlBaseServer#setColorMode} to set the color mode
 * * {@link ColorControlBaseServer#setEnhancedColorMode} to set the enhanced color mode
 *
 * The default implementation of {@link ColorControlBaseServer.switchColorMode} tries to convert the color values
 * between the different modi. When switching from color temperature mode to any other mode the value can be converted
 * when the color temperature was between 1000K and 20.000K. For other values no conversion takes place.
 *
 * The method {@link ColorControlBaseServer.syncColorTemperatureWithLevelLogic} is handling the sync between the
 * LevelControl and ColorControl cluster when the color temperature is used.
 *
 * Additionally there are some convenience properties to access the current attribute values for all relevant color
 * attributes (x,y, hue, saturation, mireds/kelvin, colorTemperatur, ...) in their CIE value format instead the matter
 * data ranges.
 */
export class ColorControlBaseServer extends ColorControlBase {
    declare protected internal: ColorControlBaseServer.Internal;
    declare state: ColorControlBaseServer.State;
    declare events: ColorControlBaseServer.Events;

    /*
     * The following block contains some convenience methods to allow to easily work with the CIE color space values
     * as usual and hide the matter specific data model.
     */

    /** Returns the current X value as decimal number according to CIE in the range 0..1. */
    get x() {
        return this.#returnAsXyValue(this.state.currentX);
    }

    /**
     * Sets the current X value as decimal number according to CIE in the range 0..1 and converts into Matter number
     * range.
     */
    set x(value: number) {
        this.#setFromXyValue("currentX", value);
    }

    /** Returns the current Y value as decimal number according to CIE in the range 0..1. */
    get y() {
        return this.#returnAsXyValue(this.state.currentY);
    }

    /**
     * Sets the current Y value as decimal number according to CIE in the range 0..1 and converts into Matter number
     * range.
     */
    set y(value: number) {
        this.#setFromXyValue("currentY", value);
    }

    /**
     * Returns the current hue value as decimal number in the range 0..360.
     */
    get hue() {
        return (this.state.currentHue * 360) / 254;
    }

    /**
     * Sets the current hue value as decimal number in the range 0..360 and converts into Matter number range.
     */
    set hue(value: number) {
        this.state.currentHue = cropValueRange(Math.round((value * 254) / 360), MIN_HUE_VALUE, MAX_HUE_VALUE);
    }

    /** Returns the current enhanced hue value as decimal number in the range 0..0xFFFF. */
    get enhancedHue() {
        return this.state.enhancedCurrentHue;
    }

    /**
     * Sets the current enhanced hue value as decimal number in the range 0..0xFFFF and converts into Matter number range.
     */
    set enhancedHue(value: number) {
        this.state.enhancedCurrentHue = cropValueRange(value, MIN_HUE_VALUE, MAX_ENHANCED_HUE_VALUE);
    }

    /** Returns the current saturation value as decimal number in the range 0..1. */
    get saturation() {
        return this.state.currentSaturation / 254;
    }

    /**
     * Sets the current saturation value as decimal number in the range 0..1 and converts into Matter number range.
     */
    set saturation(value: number) {
        this.state.currentSaturation = cropValueRange(
            Math.round(value * 254),
            MIN_SATURATION_VALUE,
            MAX_SATURATION_VALUE,
        );
    }

    /** Returns the current color temperature value in Mireds (0..0xFFFF). */
    get mireds() {
        return this.state.colorTemperatureMireds;
    }

    /**
     * Sets the current color temperature value in Mireds (0..0xFFFF) and converts into Matter number range.
     */
    set mireds(value: number) {
        this.state.colorTemperatureMireds = this.#cropColorTemperature(value);
    }

    /** Returns the current color temperature value in Kelvin (from internal Mireds). */
    get kelvin() {
        return miredsToKelvin(this.mireds);
    }

    /** Sets the current color temperature value in Kelvin and updates the internal mireds value. */
    set kelvin(value: number) {
        this.mireds = kelvinToMireds(value);
    }

    /**
     * Returns the minimum color temperature value in Mireds (0..0xFFFF). This automatically handled the case that no
     * physical minimum value is defined.
     */
    get minimumColorTemperatureMireds() {
        return this.state.colorTempPhysicalMinMireds === 0
            ? MIN_TEMPERATURE_VALUE
            : this.state.colorTempPhysicalMinMireds;
    }

    /**
     * Returns the maximum color temperature value in Mireds (0..0xFFFF). This automatically handled the case that no
     * physical maximum value is defined.
     */
    get maximumColorTemperatureMireds() {
        return this.state.colorTempPhysicalMaxMireds === 0
            ? MAX_TEMPERATURE_VALUE
            : this.state.colorTempPhysicalMaxMireds;
    }

    /** Returns the current whitePoint X value as decimal number according to CIE in the range 0..1. */
    get whitePointX() {
        return this.#returnAsOptionalXyValue(this.state.whitePointX);
    }

    /**
     * Sets the current whitePoint X value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set whitePointX(value: number | undefined) {
        this.#setFromXyValue("whitePointX", value);
    }

    /** Returns the current whitePoint Y value as decimal number according to CIE in the range 0..1. */
    get whitePointY() {
        return this.#returnAsOptionalXyValue(this.state.whitePointY);
    }

    /**
     * Sets the current whitePoint Y value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set whitePointY(value: number | undefined) {
        this.#setFromXyValue("whitePointY", value);
    }

    /** Returns the current colorPoint Rx value as decimal number according to CIE in the range 0..1. */
    get colorPointRx() {
        return this.#returnAsOptionalXyValue(this.state.colorPointRx);
    }

    /**
     * Sets the current colorPoint Rx value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set colorPointRx(value: number | undefined) {
        this.#setFromXyValue("colorPointRx", value);
    }

    /** Returns the current colorPoint Ry value as decimal number according to CIE in the range 0..1. */
    get colorPointRy() {
        return this.#returnAsOptionalXyValue(this.state.colorPointRy);
    }

    /**
     * Sets the current colorPoint Ry value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set colorPointRy(value: number | undefined) {
        this.#setFromXyValue("colorPointRy", value);
    }

    /** Returns the current colorPoint Gx value as decimal number according to CIE in the range 0..1. */
    get colorPointGx() {
        return this.#returnAsOptionalXyValue(this.state.colorPointGx);
    }

    /**
     * Sets the current colorPoint Gx value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set colorPointGx(value: number | undefined) {
        this.#setFromXyValue("colorPointGx", value);
    }

    /** Returns the current colorPoint Gy value as decimal number according to CIE in the range 0..1. */
    get colorPointGy() {
        return this.#returnAsOptionalXyValue(this.state.colorPointGy);
    }

    /**
     * Sets the current colorPoint Gy value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set colorPointGy(value: number | undefined) {
        this.#setFromXyValue("colorPointGy", value);
    }

    /** Returns the current colorPoint Bx value as decimal number according to CIE in the range 0..1. */
    get colorPointBx() {
        return this.#returnAsOptionalXyValue(this.state.colorPointBx);
    }

    /**
     * Sets the current colorPoint Bx value as decimal number according to CIE in the range 0..1 and converts into Matter
     * number range.
     */
    set colorPointBx(value: number | undefined) {
        this.#setFromXyValue("colorPointBx", value);
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

        // Sync the colorCapabilities with the features for convenience
        this.state.colorCapabilities = this.features;

        // Configure Color Temperature Feature
        if (this.features.colorTemperature) {
            this.initializeColorTemperature();
        }

        if (this.agent.has(ScenesManagementServer)) {
            this.agent.get(ScenesManagementServer).implementScenes(this, this.#applySceneValues);
        }
    }

    /**
     * Initialize Color Temperature features.
     *
     * This only applies if the Color Control cluster has the "CT" feature enabled.
     */
    protected initializeColorTemperature() {
        // Handle startup color Temperature when the color Temperature feature is supported
        if (this.#getBootReason() !== GeneralDiagnostics.BootReason.SoftwareUpdateCompleted) {
            const startUpMiredsValue = this.state.startUpColorTemperatureMireds ?? null;
            const currentMiredsValue = this.state.colorTemperatureMireds;
            let targetMiredsValue: number | null;
            switch (startUpMiredsValue) {
                case null:
                    targetMiredsValue = this.#cropColorTemperature(currentMiredsValue);
                    break;
                default:
                    targetMiredsValue = startUpMiredsValue;
                    break;
            }
            if (targetMiredsValue !== currentMiredsValue) {
                this.state.colorMode = ColorControl.ColorMode.ColorTemperatureMireds;
                this.state.enhancedColorMode = ColorControl.EnhancedColorMode.ColorTemperatureMireds;
                this.state.colorTemperatureMireds = targetMiredsValue;
            }
        }
    }

    /**
     * Default implementation notes:
     * This method ignores the transition time provided by the command and just sets the hue value to the
     * requested value. After the options and value checks and the potential color mode switch it uses the
     * {@link moveToHueLogic} method to set the hue. If you want to implement own logic just override
     * {@link moveToHueLogic} with is also used for {@link enhancedMoveToHue}, {@link moveToHueAndSaturation} and
     * {@link enhancedMoveToHueAndSaturation}.
     */
    override moveToHue({
        optionsMask,
        optionsOverride,
        hue,
        direction,
        transitionTime,
    }: ColorControl.MoveToHueRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () =>
            this.moveToHueLogic(hue, direction, transitionTime),
        );
    }

    /**
     * Default implementation of the moveToHue logic. When a transition time is specified the implementation uses a
     * step based to manage the move. The method handled hue and enhanced-Hue changes depending on the last parameter.
     *
     * @param targetHue The target hue value to move to (in range of the matter hue or enhanced hue ranges)
     * @param direction The direction to move to the target hue
     * @param transitionTime The time in seconds to move to the target hue. 0 means "as fast as possible"
     * @param isEnhancedHue If true the enhanced hue is handled, otherwise the normal hue
     * @protected
     */
    protected moveToHueLogic(
        targetHue: number,
        direction: ColorControl.Direction,
        transitionTime: number,
        isEnhancedHue = false,
    ): MaybePromise {
        const currentHue = isEnhancedHue ? this.state.enhancedCurrentHue : this.state.currentHue;
        const maxHue = isEnhancedHue ? MAX_ENHANCED_HUE_VALUE : MAX_HUE_VALUE;

        const effectiveRate =
            (this.#getHueDistanceByDirection(currentHue, targetHue, direction, maxHue) / transitionTime) * 10;
        return this.#startTransition({
            name: isEnhancedHue ? "enhancedCurrentHue" : "currentHue",
            owner: this,
            changePerS: effectiveRate,
            targetValue: targetHue,
            calculateCyclicDistance: (current, target) =>
                this.#getHueDistanceByDirection(current, target, direction, maxHue),
        });
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveHueLogic} method to set the hue.
     * If you want to implement own logic just override {@link moveHueLogic} with is also used for {@link enhancedMoveHue}.
     * If a currently running movement should be stopped {@link stopHueAndSaturationMovement} is used which can also be
     * overridden.
     * The logic is implemented as follows: Depending on the provided rate the server will move as fast as possible, but
     * increase only one rate directly if the managed transition is not used. Else the step logic is applied and the
     * level is increased or decreased by the step size every second.
     */
    override moveHue({ optionsMask, optionsOverride, moveMode, rate }: ColorControl.MoveHueRequest) {
        this.#assertRate(moveMode, rate);
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () => {
            if (moveMode === ColorControl.MoveMode.Stop) {
                return this.stopHueAndSaturationMovement();
            }

            return this.moveHueLogic(moveMode, rate);
        });
    }

    /**
     * Default implementation of the moveHue logic. The method handled hue and enhanced-Hue changes depending on the
     * last parameter.
     * If the managed transition time handling is disabled the method directly increases the hue value by one rate step.
     * So without managed transition not too much happens.
     * Otherwise, the method initiates a transition with the given rate.
     *
     * @param moveMode Move Mode to move the hue up or down (Stop should not be provided in here because already handled)
     * @param rate The rate to move the hue up or down. 0 should never be provided her because handled here.
     * @param isEnhancedHue If true the enhanced hue is handled, otherwise the normal hue
     * @protected
     */
    protected moveHueLogic(moveMode: ColorControl.MoveMode, rate: number, isEnhancedHue = false): MaybePromise {
        const name = isEnhancedHue ? "enhancedCurrentHue" : "currentHue";

        return this.#startTransition({
            name,
            owner: this,
            changePerS: rate * (moveMode === ColorControl.MoveMode.Up ? 1 : -1),
        });
    }

    /**
     * Default implementation notes:
     * This method is called to stop any hue, enhanced hue and/or saturation movements potentially in progress. Override
     * this method with hardware specific logic to implement this functionality.
     * @protected
     */
    protected stopHueAndSaturationMovement(): MaybePromise {
        this.internal.transitions?.stop("currentHue");
        this.internal.transitions?.stop("enhancedCurrentHue");
        this.internal.transitions?.stop("currentSaturation");
    }

    #assertStepSize(stepSize: number, errorContext: string) {
        if (stepSize === 0) {
            throw new StatusResponseError(`${errorContext} step size must not be 0`, StatusCode.InvalidCommand);
        }
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link stepHueLogic} method to set the hue.
     * If you want to implement own logic just override {@link stepHueLogic} with is also used for {@link enhancedStepHue}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set to min/max directly. Else the step logic is applied and the hue is increased or decreased
     * by the step size every transition time interval.
     */
    override stepHue({
        optionsMask,
        optionsOverride,
        stepMode,
        stepSize,
        transitionTime,
    }: ColorControl.StepHueRequest) {
        this.#assertStepSize(stepSize, "Hue");
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () =>
            this.stepHueLogic(stepMode, stepSize, transitionTime),
        );
    }

    /**
     * Default implementation of the stepHue logic. The method handled hue and enhanced-Hue changes depending on the
     * last parameter.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set to current Hue +/- stepSize directly. Else the step logic is applied and the hue is increased
     * or decreased by the step size every transition time interval.
     * @param stepMode The step mode to move the hue up or down
     * @param stepSize The step size to move the hue up or down
     * @param transitionTime The time in seconds to move the hue. 0 means "as fast as possible"
     * @param isEnhancedHue If true the enhanced hue is handled, otherwise the normal hue
     * @protected
     */
    protected stepHueLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        isEnhancedHue = false,
    ): MaybePromise {
        const currentHue = isEnhancedHue ? this.state.enhancedCurrentHue : this.state.currentHue;
        const maxHue = isEnhancedHue ? MAX_ENHANCED_HUE_VALUE : MAX_HUE_VALUE;

        const direction = stepMode === ColorControl.StepMode.Up ? 1 : -1;
        const effectiveRate = (stepSize / transitionTime) * 10 * direction;

        const targetValue = addValueWithOverflow(currentHue, stepSize * direction, MIN_HUE_VALUE, maxHue);

        return this.#startTransition({
            name: isEnhancedHue ? "enhancedCurrentHue" : "currentHue",
            owner: this,
            changePerS: effectiveRate,
            targetValue,
            calculateCyclicDistance: (current, target) =>
                this.#getHueDistanceByDirection(
                    current,
                    target,
                    stepMode === ColorControl.StepMode.Up ? ColorControl.Direction.Up : ColorControl.Direction.Down,
                    maxHue,
                ),
        });
    }

    /**
     * Default implementation notes:
     * After the options checks and potentially switching the color mode it uses the {@link moveToSaturationLogic}
     * method to set the hue.
     * If you want to implement own logic just override {@link moveToSaturationLogic} with is also used for
     * {@link moveToHueAndSaturation}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the saturation is increased or
     * decreased by the step size every transition time interval.
     */
    override moveToSaturation({
        optionsMask,
        optionsOverride,
        saturation,
        transitionTime,
    }: ColorControl.MoveToSaturationRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () =>
            this.moveToSaturationLogic(saturation, transitionTime),
        );
    }

    /**
     * Default implementation of the moveToSaturation logic.
     * If the managed transition time handling is disabled the method directly sets the new saturation value.
     * Otherwise, the method initiates a transition with the given rate.
     *
     * @param targetSaturation The target saturation value to move to
     * @param transitionTime The time in seconds to move to the target saturation. 0 means "as fast as possible"
     * @protected
     */
    protected moveToSaturationLogic(targetSaturation: number, transitionTime: number): MaybePromise {
        const effectiveRate = ((targetSaturation - this.state.currentSaturation) / transitionTime) * 10;
        return this.#startTransition({
            name: "currentSaturation",
            owner: this,
            changePerS: effectiveRate,
            targetValue: targetSaturation,
        });
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveSaturationLogic} method to set the hue.
     * If you want to implement own logic just override {@link moveSaturationLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set to min/max directly. Else the step logic is applied and the saturation is increased or
     * decreased by the step size every transition time interval.
     */
    override moveSaturation({ optionsMask, optionsOverride, moveMode, rate }: ColorControl.MoveSaturationRequest) {
        this.#assertRate(moveMode, rate);
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () => {
            if (moveMode === ColorControl.MoveMode.Stop) {
                return this.stopHueAndSaturationMovement();
            }

            return this.moveSaturationLogic(moveMode, rate);
        });
    }

    /**
     * Default implementation of the moveSaturation logic.
     * If the managed transition time handling is disabled the method directly sets the new saturation value.
     * Otherwise the method initiates a transition with the given rate.
     *
     * @param moveMode Move Mode to move the saturation up or down
     * @param rate The rate to move the saturation up or down
     * @protected
     */
    protected moveSaturationLogic(moveMode: ColorControl.MoveMode, rate: number): MaybePromise {
        return this.#startTransition({
            name: "currentSaturation",
            owner: this,
            changePerS: rate * (moveMode === ColorControl.MoveMode.Up ? 1 : -1),
        });
    }

    /**
     * Default implementation notes:
     * After the options checks and potentially switching the color mode it uses the {@link stepSaturationLogic}
     * method to set the hue.
     * If you want to implement own logic just override {@link stepSaturationLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target values directly. Else the step logic is applied and the hue and saturation are
     * increased or decreased by the step size every transition time interval.
     */
    override stepSaturation({
        optionsMask,
        optionsOverride,
        stepMode,
        stepSize,
        transitionTime,
    }: ColorControl.StepSaturationRequest) {
        this.#assertStepSize(stepSize, "Saturation");
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () =>
            this.stepSaturationLogic(stepMode, stepSize, transitionTime),
        );
    }

    /**
     * Default implementation of the stepSaturation logic.
     * If the managed transition time handling is disabled the method directly sets the new saturation value.
     * Otherwise the method initiates a transition with the given rate.
     *
     * @param stepMode The step mode to move the saturation up or down
     * @param stepSize The step size to move the saturation up or down
     * @param transitionTime The time in seconds to move the saturation. 0 means "as fast as possible"
     * @protected
     */
    protected stepSaturationLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
    ): MaybePromise {
        const direction = stepMode === ColorControl.StepMode.Up ? 1 : -1;

        const effectiveRate = (stepSize / transitionTime) * 10 * direction;

        return this.#startTransition({
            name: "currentSaturation",
            owner: this,
            changePerS: effectiveRate,
            targetValue: this.state.currentSaturation + stepSize * direction,
        });
    }

    /**
     * Default implementation notes:
     * After the options checks and potentially switching the color mode it uses the {@link moveToHueAndSaturationLogic}
     * method to set the hue.
     * If you want to implement own logic just override {@link moveToHueAndSaturationLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target values directly. Else the step logic is applied and the hue and saturation is
     * increased or decreased by the step size every transition time interval.
     */
    override moveToHueAndSaturation({
        optionsOverride,
        optionsMask,
        saturation,
        hue,
        transitionTime,
    }: ColorControl.MoveToHueAndSaturationRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation), () =>
            this.moveToHueAndSaturationLogic(hue, saturation, transitionTime),
        );
    }

    /**
     * Default implementation of the moveToHueAndSaturation logic.
     * If the managed transition time handling is disabled the method directly sets the new hue and saturation values.
     * Otherwise the method initiates a transition with the given rate.
     * This method internally uses {@link moveToHueLogic} and {@link moveToSaturationLogic} to handle the hue and
     * saturation changes, so if you have implemented them already you might not need to override this method.
     *
     * @param targetHue The target hue value to move to
     * @param targetSaturation The target saturation value to move to
     * @param transitionTime The time in seconds to move to the target hue and saturation. 0 means "as fast as possible"
     * @protected
     */
    protected moveToHueAndSaturationLogic(
        targetHue: number,
        targetSaturation: number,
        transitionTime: number,
    ): MaybePromise {
        return MaybePromise.then(
            this.moveToHueLogic(targetHue, ColorControl.Direction.Shortest, transitionTime, false),
            () => this.moveToSaturationLogic(targetSaturation, transitionTime),
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveToColorLogic} method to set the x and y value.
     * If you want to implement own logic just override {@link moveToColorLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target values directly. Else the step logic is applied and the x and y is
     * increased or decreased by the step size every transition time interval.
     */
    override moveToColor({
        optionsMask,
        optionsOverride,
        colorX,
        colorY,
        transitionTime,
    }: ColorControl.MoveToColorRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentXAndCurrentY), () =>
            this.moveToColorLogic(colorX, colorY, transitionTime),
        );
    }

    /**
     * Default implementation of the moveToColor logic.
     * If the managed transition time handling is disabled the method directly sets the new x and y values.
     * Otherwise the method initiates a transition with the given rate.
     * This method internally uses {@link moveToColorLogic} to handle the x and y changes, so if you have implemented it
     * already you might not need to override this method.
     *
     * @param targetX The target x value to move to
     * @param targetY The target y value to move to
     * @param transitionTime The time in seconds to move to the target x and y. 0 means "as fast as possible"
     * @protected
     */
    protected moveToColorLogic(targetX: number, targetY: number, transitionTime: number): MaybePromise {
        return MaybePromise.then(
            this.#startTransition({
                name: "currentX",
                owner: this,
                changePerS: ((targetX - this.state.currentX) / transitionTime) * 10,
                targetValue: targetX,
            }),
            () =>
                this.#startTransition({
                    name: "currentY",
                    owner: this,
                    changePerS: ((targetY - this.state.currentY) / transitionTime) * 10,
                    targetValue: targetY,
                }),
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveColorLogic} method to set the x and y value.
     * If you want to implement own logic just override {@link moveColorLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target values directly. Else the step logic is applied and the x and y is
     * increased or decreased by the step size every transition time interval.
     */
    override moveColor({ optionsOverride, optionsMask, rateX, rateY }: ColorControl.MoveColorRequest): MaybePromise {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }

        if (rateX === 0 && rateY === 0) {
            return this.stopAllColorMovement();
        }

        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentXAndCurrentY), () =>
            this.moveColorLogic(rateX, rateY),
        );
    }

    /**
     * Default implementation notes:
     * This method is called to stop any color movements potentially in progress, including any x/y, hue, saturation and
     * color temperature transitions. Override this method with hardware specific logic to implement this functionality.
     * @protected
     */
    protected stopAllColorMovement(): MaybePromise {
        this.internal.transitions?.stop("currentX");
        this.internal.transitions?.stop("currentY");
        this.internal.transitions?.stop("colorTemperatureMireds");
        return this.stopHueAndSaturationMovement();
    }

    /**
     * Default implementation of the moveColor logic.
     * If the managed transition time handling is disabled the method directly sets the new x and y values.
     * Otherwise the method initiates a transition with the given rate.
     *
     * @param rateX The rate to move the x value up or down (positive values mean up, negative down)
     * @param rateY The rate to move the y value up or down (positive values mean up, negative down)
     * @protected
     */
    protected moveColorLogic(rateX: number, rateY: number): MaybePromise {
        return MaybePromise.then(
            () => {
                if (rateX !== 0) {
                    return this.#startTransition({
                        name: "currentX",
                        owner: this,
                        changePerS: rateX,
                    });
                }
            },
            () => {
                if (rateY !== 0) {
                    return this.#startTransition({
                        name: "currentY",
                        owner: this,
                        changePerS: rateY,
                    });
                }
            },
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link stepColorLogic} method to set the x and y value.
     * If you want to implement own logic just override {@link stepColorLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target values directly. Else the step logic is applied and the x and y is
     * increased or decreased by the step size every transition time interval.
     */
    override stepColor({
        optionsOverride,
        optionsMask,
        stepX,
        stepY,
        transitionTime,
    }: ColorControl.StepColorRequest): MaybePromise {
        if (stepX === 0 && stepY === 0) {
            throw new StatusResponseError("Color step sizes must not be 0", StatusCode.InvalidCommand);
        }
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.CurrentXAndCurrentY), () =>
            this.stepColorLogic(stepX, stepY, transitionTime),
        );
    }

    /**
     * Default implementation of the stepColor logic.
     * If the managed transition time handling is disabled the method directly sets the new x and y values.
     * Otherwise, the method initiates a transition with the given rate.
     *
     * @param stepX The step size to move the x value up or down
     * @param stepY The step size to move the y value up or down
     * @param transitionTime The time in seconds to move the x and y. 0 means "as fast as possible"
     * @protected
     */
    protected stepColorLogic(stepX: number, stepY: number, transitionTime: number): MaybePromise {
        return MaybePromise.then(
            () => {
                if (stepX !== 0) {
                    return this.#startTransition({
                        name: "currentX",
                        owner: this,
                        changePerS: (stepX / transitionTime) * 10,
                        targetValue: this.state.currentX + stepX,
                    });
                }
            },
            () => {
                if (stepY !== 0) {
                    return this.#startTransition({
                        name: "currentY",
                        owner: this,
                        changePerS: (stepY / transitionTime) * 10,
                        targetValue: this.state.currentY + stepY,
                    });
                }
            },
        );
    }

    /**
     * Default implementation notes:
     * After the option checks it uses the {@link moveToColorTemperatureLogic} method to set the color temperature.
     * If you want to implement own logic just override {@link moveToColorTemperatureLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the color temperature is
     * increased or decreased by the step size every transition time interval.
     */
    override moveToColorTemperature({
        optionsOverride,
        optionsMask,
        colorTemperatureMireds,
        transitionTime,
    }: ColorControl.MoveToColorTemperatureRequest): MaybePromise {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.ColorTemperatureMireds), () =>
            this.moveToColorTemperatureLogic(colorTemperatureMireds, transitionTime),
        );
    }

    /**
     * Default implementation of the moveToColorTemperature logic.
     * If the managed transition time handling is disabled the method directly sets the new color temperature value.
     * Otherwise the method initiates a transition with the given rate.
     *
     * @param targetMireds The target color temperature value to move to
     * @param transitionTime The time in seconds to move to the target color temperature. 0 means "as fast as possible"
     * @protected
     */
    protected moveToColorTemperatureLogic(targetMireds: number, transitionTime: number): MaybePromise {
        return this.#startTransition({
            name: "colorTemperatureMireds",
            owner: this,
            changePerS: ((targetMireds - this.state.colorTemperatureMireds) / transitionTime) * 10,
            targetValue: targetMireds,
        });
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveToHueLogic} method to set the enhanced hue.
     * If you want to implement own logic just override {@link moveToHueLogic} which is used together with
     * {@link moveToHue}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the color temperature is
     * increased or decreased by the step size every transition time interval.
     */
    override enhancedMoveToHue({
        optionsMask,
        optionsOverride,
        enhancedHue,
        direction,
        transitionTime,
    }: ColorControl.EnhancedMoveToHueRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(
            this.setEnhancedColorMode(ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation),
            () => this.moveToHueLogic(enhancedHue, direction, transitionTime, true),
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveHueLogic} method to set the enhanced hue.
     * If you want to implement own logic just override {@link moveHueLogic} which is used together with
     * {@link moveHue}.
     * The logic is implemented as follows: Depending on the provided rate the server will move as fast as possible, but
     * increase only one rate directly if the managed transition is not used. Else the step logic is applied and the
     * level is increased or decreased by the step size every second.
     */
    override enhancedMoveHue({ optionsMask, optionsOverride, moveMode, rate }: ColorControl.EnhancedMoveHueRequest) {
        this.#assertRate(moveMode, rate);
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(
            this.setEnhancedColorMode(ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation),
            () => {
                if (moveMode === ColorControl.MoveMode.Stop) {
                    return this.stopHueAndSaturationMovement();
                }

                return this.moveHueLogic(moveMode, rate, true);
            },
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link stepHueLogic} method to set the enhanced hue.
     * If you want to implement own logic just override {@link stepHueLogic} which is used together with
     * {@link stepHue}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the hue is increased or
     * decreased by the step size every transition time interval.
     */
    override enhancedStepHue({
        optionsMask,
        optionsOverride,
        stepMode,
        stepSize,
        transitionTime,
    }: ColorControl.EnhancedStepHueRequest) {
        this.#assertStepSize(stepSize, "Enhanced Hue");
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(
            this.setEnhancedColorMode(ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation),
            () => this.stepHueLogic(stepMode, stepSize, transitionTime, true),
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveToEnhancedHueAndSaturationLogic} method to set the enhanced hue
     * and saturation.
     * If you want to implement own logic just override {@link moveToEnhancedHueAndSaturationLogic}.
     * The logic is implemented as follows: Depending on the provided rate the server will move as fast as possible, so
     * we set to min/max directly if the managed transition is not used. Else the step logic is applied and the
     * level is increased or decreased by the step size every second.
     */
    override enhancedMoveToHueAndSaturation({
        optionsOverride,
        optionsMask,
        enhancedHue,
        saturation,
        transitionTime,
    }: ColorControl.EnhancedMoveToHueAndSaturationRequest): MaybePromise {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(
            this.setEnhancedColorMode(ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation),
            () => this.moveToEnhancedHueAndSaturationLogic(enhancedHue, saturation, transitionTime),
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link moveToHueLogic} and {@link moveToSaturationLogic} methods to set the
     * hue and saturation.
     * Both methods are also used for other commands, so it maybe is not needed to override this method.
     * The logic is implemented as follows: Depending on the provided rate the server will move as fast as possible, so
     * we set to min/max directly if the managed transition is not used. Else the step logic is applied and the
     * level is increased or decreased by the step size every second.
     */
    protected moveToEnhancedHueAndSaturationLogic(
        targetEnhancedHue: number,
        targetSaturation: number,
        transitionTime: number,
    ): MaybePromise {
        return MaybePromise.then(
            this.moveToHueLogic(targetEnhancedHue, ColorControl.Direction.Shortest, transitionTime, true),
            () => this.moveToSaturationLogic(targetSaturation, transitionTime),
        );
    }

    /**
     * Default implementation notes:
     * After the options checks and potentially switching the color mode it uses the {@link stopColorLoopLogic}
     * method to stop color loops or {@link startColorLoopLogic} to start a color loop at a defined enhanced hue value.
     * If you want to implement own logic just override these methods.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the color temperature is
     * increased or decreased by the step size every transition time interval.
     */
    override colorLoopSet({
        optionsMask,
        optionsOverride,
        updateFlags,
        action,
        direction,
        time,
        startHue,
    }: ColorControl.ColorLoopSetRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }

        let loopConfigChanged = false;
        if (updateFlags.updateDirection) {
            if (this.state.colorLoopDirection !== direction) {
                this.state.colorLoopDirection = direction as unknown as ColorControl.ColorLoopDirection;
                loopConfigChanged = true;
            }
        }
        if (updateFlags.updateTime) {
            if (this.state.colorLoopTime !== time) {
                this.state.colorLoopTime = time;
                loopConfigChanged = true;
            }
        }
        if (updateFlags.updateStartHue) {
            this.state.colorLoopStartEnhancedHue = startHue;
        }
        if (updateFlags.updateAction) {
            if (action === ColorControl.ColorLoopAction.Deactivate) {
                if (this.state.colorLoopActive === ColorControl.ColorLoopActive.Active) {
                    return this.#stopColorLoop();
                }
            } else {
                return MaybePromise.then(
                    this.setEnhancedColorMode(ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation),
                    () => {
                        this.state.colorLoopStoredEnhancedHue = this.state.enhancedCurrentHue;
                        this.state.colorLoopActive = ColorControl.ColorLoopActive.Active;
                        if (action === ColorControl.ColorLoopAction.ActivateFromColorLoopStartEnhancedHue) {
                            return this.startColorLoopLogic(this.state.colorLoopStartEnhancedHue);
                        } else if (action === ColorControl.ColorLoopAction.ActivateFromEnhancedCurrentHue) {
                            return this.startColorLoopLogic(this.state.enhancedCurrentHue);
                        }
                    },
                );
            }
        } else if (loopConfigChanged && this.state.colorLoopActive === ColorControl.ColorLoopActive.Active) {
            // If the loop config changed while the loop is running, we need to restart from current value
            return this.startColorLoopLogic(this.state.enhancedCurrentHue);
        }
    }

    /**
     * Internal method to step the color loop and sync the internal ColorLoopActive state and restore the stored
     * enhanced hue. It uses {@link stopColorLoopLogic} to execute the stop.
     */
    #stopColorLoop() {
        return MaybePromise.then(this.stopColorLoopLogic(), () => {
            if (this.state.colorLoopActive === ColorControl.ColorLoopActive.Active) {
                this.state.colorLoopActive = ColorControl.ColorLoopActive.Inactive;
                this.state.enhancedCurrentHue = this.state.colorLoopStoredEnhancedHue;
            }
        });
    }

    /**
     * Default implementation notes:
     * Implement stopping the color loop here if any special hardware specific logic is needed.
     * @protected
     */
    protected stopColorLoopLogic(): MaybePromise {
        this.internal.transitions?.stop("enhancedCurrentHue");
    }

    /**
     * Default implementation notes:
     * This method uses {@link moveHueLogic} to start a enhanced color loop and sets the required start hue beforehand.
     * If this is sufficient for your implementation you might not need to override this method.
     *
     * @param startHue The hue to start the color loop at
     * @protected
     */
    protected startColorLoopLogic(startHue: number): MaybePromise {
        this.state.enhancedCurrentHue = startHue;

        return this.moveHueLogic(
            this.state.colorLoopDirection === ColorControl.ColorLoopDirection.Decrement
                ? ColorControl.MoveMode.Down
                : ColorControl.MoveMode.Up,
            Math.floor(MAX_ENHANCED_HUE_VALUE / this.state.colorLoopTime),
            true,
        );
    }

    /**
     * Default implementation notes:
     * After the options checks it uses the {@link stopMoveStepLogic} method to stop any ongoing color movement.
     * If you want to implement own logic just override {@link stopMoveStepLogic}.
     */
    override stopMoveStep({ optionsOverride, optionsMask }: ColorControl.StopMoveStepRequest) {
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return this.stopMoveStepLogic();
    }

    /**
     * Default implementation notes:
     * Implement stopping any ongoing color movement here if any special hardware specific logic is needed. In fact this
     * needs to stop any ongoing saturation, color temperature, x or y movement. Hue transitions should only be stopped
     * when they do not belong to a color loop.
     * @protected
     */
    protected stopMoveStepLogic(): MaybePromise {
        if (this.state.colorLoopActive === ColorControl.ColorLoopActive.Inactive) {
            this.internal.transitions?.stop("enhancedCurrentHue");
        }
        this.internal.transitions?.stop("currentHue");
        this.internal.transitions?.stop("currentSaturation");
        this.internal.transitions?.stop("currentX");
        this.internal.transitions?.stop("currentY");
        this.internal.transitions?.stop("colorTemperatureMireds");
    }

    /**
     * Default implementation notes:
     * After the options checks and potentially changing the color mode it uses the {@link moveColorTemperatureLogic}
     * method to set the color temperature.
     * If the current movement should be stopped {@link stopHueAndSaturationMovement} is used.
     * If you want to implement own logic just override {@link moveColorTemperatureLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the color temperature is
     * increased or decreased by the step size every transition time interval.
     */
    override moveColorTemperature({
        optionsOverride,
        optionsMask,
        moveMode,
        colorTemperatureMinimumMireds,
        colorTemperatureMaximumMireds,
        rate,
    }: ColorControl.MoveColorTemperatureRequest): MaybePromise {
        this.#assertRate(moveMode, rate);
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.ColorTemperatureMireds), () => {
            if (moveMode === ColorControl.MoveMode.Stop) {
                return this.stopHueAndSaturationMovement();
            }

            // If no min/max values are provided, use the device limits
            if (colorTemperatureMinimumMireds === 0) {
                colorTemperatureMinimumMireds = this.minimumColorTemperatureMireds;
            }
            if (colorTemperatureMaximumMireds === 0) {
                colorTemperatureMaximumMireds = this.maximumColorTemperatureMireds;
            }
            colorTemperatureMinimumMireds = this.#cropColorTemperature(colorTemperatureMinimumMireds);
            colorTemperatureMaximumMireds = this.#cropColorTemperature(colorTemperatureMaximumMireds);

            return this.moveColorTemperatureLogic(
                moveMode,
                rate,
                colorTemperatureMinimumMireds,
                colorTemperatureMaximumMireds,
            );
        });
    }

    /**
     * Default implementation of the moveColorTemperature logic.
     * If the managed transition time handling is disabled the method directly sets the min or max color temperature value.
     * Otherwise the method initiates a transition with the given rate.
     *
     * @param moveMode
     * @param rate
     * @param colorTemperatureMinimumMireds
     * @param colorTemperatureMaximumMireds
     * @protected
     */
    protected moveColorTemperatureLogic(
        moveMode: ColorControl.MoveMode,
        rate: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        const direction = moveMode === ColorControl.MoveMode.Up ? 1 : -1;

        // Custom min/max so we define an explicit target value here
        const targetValue =
            moveMode === ColorControl.MoveMode.Up ? colorTemperatureMaximumMireds : colorTemperatureMinimumMireds;
        return this.#startTransition({
            name: "colorTemperatureMireds",
            owner: this,
            changePerS: rate * direction,
            targetValue,
        });
    }

    /**
     * Default implementation notes:
     * After the options checks and potentially switching the color mode it uses the {@link stepColorTemperatureLogic}
     * method to set the color temperature.
     * If you want to implement own logic just override {@link stepColorTemperatureLogic}.
     * The logic is implemented as follows: When no transition time is provided, the server will move as fast as
     * possible, so we set the target value directly. Else the step logic is applied and the color temperature is
     * increased or decreased by the step size every transition time interval.
     */
    override stepColorTemperature({
        optionsOverride,
        optionsMask,
        stepMode,
        stepSize,
        transitionTime,
        colorTemperatureMinimumMireds,
        colorTemperatureMaximumMireds,
    }: ColorControl.StepColorTemperatureRequest) {
        this.#assertStepSize(stepSize, "ColorTemperature");
        if (!this.#optionsAllowExecution(optionsMask, optionsOverride)) {
            return;
        }
        return MaybePromise.then(this.setColorMode(ColorControl.ColorMode.ColorTemperatureMireds), () => {
            // If no min/max values are provided, use the device limits
            if (colorTemperatureMinimumMireds === 0) {
                colorTemperatureMinimumMireds = this.minimumColorTemperatureMireds;
            }
            if (colorTemperatureMaximumMireds === 0) {
                colorTemperatureMaximumMireds = this.maximumColorTemperatureMireds;
            }
            colorTemperatureMinimumMireds = this.#cropColorTemperature(colorTemperatureMinimumMireds);
            colorTemperatureMaximumMireds = this.#cropColorTemperature(colorTemperatureMaximumMireds);

            return this.stepColorTemperatureLogic(
                stepMode,
                stepSize,
                transitionTime,
                colorTemperatureMinimumMireds,
                colorTemperatureMaximumMireds,
            );
        });
    }

    /**
     * Default implementation of the stepColorTemperature logic.
     * If the managed transition time handling is disabled the method directly sets the new color temperature value.
     * Otherwise the method initiates a transition with the given rate.
     *
     * @param stepMode Step Mode to move the color temperature up or down
     * @param stepSize Step size to move the color temperature up or down
     * @param transitionTime Time in seconds to move the color temperature. 0 means "as fast as possible"
     * @param colorTemperatureMinimumMireds Minimum allowed color temperature value
     * @param colorTemperatureMaximumMireds Maximum allowed color temperature value
     * @protected
     */
    protected stepColorTemperatureLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        const direction = stepMode === ColorControl.StepMode.Up ? 1 : -1;

        // Custom min/max so crop here already
        const targetValue = cropValueRange(
            this.state.colorTemperatureMireds + stepSize * direction,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );

        return this.#startTransition({
            name: "colorTemperatureMireds",
            owner: this,
            changePerS: (stepSize / transitionTime) * 10 * direction,
            targetValue,
        });
    }

    /**
     * Convenient method to change the color mode of the device. It uses {@link switchColorMode} to
     * convert the current color attributes to the new mode. Override this method for device specific behavior.
     * @private
     */
    protected setColorMode(mode: ColorControl.ColorMode): MaybePromise {
        if (this.state.colorMode === mode) {
            return;
        }

        return MaybePromise.then(this.switchColorMode(this.state.colorMode, mode), () => {
            this.state.colorMode = mode;
            this.state.enhancedColorMode = mode as unknown as ColorControl.EnhancedColorMode; // Enhanced just has additional values
        });
    }

    /**
     * Convenient method to change the enhanced color mode of the device. it uses {@link switchColorMode} to
     * convert the current color attributes to the new mode. Override this method for device specific behavior.
     * @private
     */
    protected setEnhancedColorMode(mode: ColorControl.EnhancedColorMode): MaybePromise {
        if (this.state.enhancedColorMode === mode) {
            return;
        }

        let colorModeSet;
        if (mode === ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation) {
            colorModeSet = this.setColorMode(ColorControl.ColorMode.CurrentHueAndCurrentSaturation);
        } else {
            colorModeSet = this.setColorMode(mode as unknown as ColorControl.ColorMode);
        }
        return MaybePromise.then(colorModeSet, () => {
            this.state.enhancedColorMode = mode;
        });
    }

    /**
     * Default implementation notes:
     * This method is used to switch the device color mode. It converts the current color attributes to the new mode on
     * a best effort "as close as possible" basis. If the device hardware can do this better this method should be
     * overridden to implement this switch logic and to update all state attributes for the new mode. The color mode
     * attribute update itself is handled by the calling method, so is not needed to be done here.
     *
     * @param oldMode Old color Mode
     * @param newMode New color Mode
     * @protected
     */
    protected switchColorMode(oldMode: ColorControl.ColorMode, newMode: ColorControl.ColorMode): MaybePromise {
        if (oldMode === newMode) {
            return;
        }
        MaybePromise.then(this.stopAllColorMovement(), () => {
            switch (oldMode) {
                case ColorControl.ColorMode.CurrentHueAndCurrentSaturation:
                    if (this.state.currentHue === undefined || this.state.currentSaturation === undefined) {
                        logger.warn("Could not convert from hue/saturation because one of them is undefined");
                        break;
                    }
                    switch (newMode) {
                        case ColorControl.ColorMode.CurrentXAndCurrentY:
                            // Convert hue/saturation to xy
                            const [x, y] = hsvToXy(this.hue, this.saturation);
                            this.x = x;
                            this.y = y;
                            break;
                        case ColorControl.ColorMode.ColorTemperatureMireds:
                            // Convert hue/saturation to color temperature
                            const mireds = hsvToMireds(this.hue, this.saturation);
                            if (mireds === undefined) {
                                logger.warn(
                                    `Could not convert hue/saturation (${this.hue}/${this.saturation}) to color temperature`,
                                );
                            } else {
                                this.mireds = mireds;
                            }
                            break;
                    }
                    break;
                case ColorControl.ColorMode.CurrentXAndCurrentY:
                    if (this.state.currentX === undefined || this.state.currentY === undefined) {
                        logger.warn("Could not convert from xy because one of them is undefined");
                        break;
                    }
                    switch (newMode) {
                        case ColorControl.ColorMode.CurrentHueAndCurrentSaturation:
                            // Convert xy to hue/saturation
                            const [hue, saturation] = hsvToXy(this.x, this.y);
                            this.hue = hue;
                            this.saturation = saturation;
                            break;
                        case ColorControl.ColorMode.ColorTemperatureMireds:
                            // Convert xy to color temperature
                            const mireds = xyToMireds(this.x, this.y);
                            if (mireds === undefined) {
                                logger.warn(`Could not convert xy ${this.x / this.y} to color temperature`);
                            } else {
                                this.mireds = mireds;
                            }
                            break;
                    }
                    break;
                case ColorControl.ColorMode.ColorTemperatureMireds:
                    if (this.state.colorTemperatureMireds === undefined) {
                        logger.warn("Could not convert from color temperature because it is undefined");
                        break;
                    }
                    switch (newMode) {
                        case ColorControl.ColorMode.CurrentHueAndCurrentSaturation:
                            // Convert color temperature to hue/saturation
                            const hsvResult = miredsToHsv(this.mireds);
                            if (hsvResult === undefined) {
                                logger.warn(`Could not convert color temperature ${this.mireds} to hue/saturation`);
                            } else {
                                const [hue, saturation] = hsvResult;
                                this.hue = hue;
                                this.saturation = saturation;
                            }
                            break;
                        case ColorControl.ColorMode.CurrentXAndCurrentY:
                            // Convert color temperature to xy
                            const xyResult = miredsToXy(this.mireds);
                            if (xyResult === undefined) {
                                logger.warn("Could not convert color temperature to xy");
                            } else {
                                const [x, y] = xyResult;
                                this.x = x;
                                this.y = y;
                            }
                            break;
                    }
                    break;
            }
        });
    }

    /**
     * This method is used internally to potentially handle the dependency between the ColorControl and LevelControl
     * cluster.
     * Do not override this method! Please use the {@link syncColorTemperatureWithLevelLogic} method instead which is
     * called by this method if a sync is needed.
     */
    syncColorTemperatureWithLevel(level: number): MaybePromise {
        if (
            this.state.colorMode === ColorControl.ColorMode.ColorTemperatureMireds ||
            this.state.enhancedColorMode === ColorControl.EnhancedColorMode.ColorTemperatureMireds
        ) {
            return this.syncColorTemperatureWithLevelLogic(level);
        }
    }

    /**
     * This method is used internally to potentially handle the dependency between the ColorControl and LevelControl
     * clusters as defined by the Matter specification. It uses {@link moveToColorTemperatureLogic} with a transition
     * time of 0 (as fast as possible) to set the determined color temperature. Unless you have special requirements
     * you do not need to override it.
     *
     * @param level The current level value from the LevelControl cluster
     * @protected
     */
    protected syncColorTemperatureWithLevelLogic(level: number): MaybePromise {
        if (
            this.state.colorMode !== ColorControl.ColorMode.ColorTemperatureMireds &&
            this.state.enhancedColorMode !== ColorControl.EnhancedColorMode.ColorTemperatureMireds
        ) {
            return;
        }
        // The CoupleColorTempToLevelMinMireds attribute specifies a lower bound on the value of the ColorTemperatureMireds
        // attribute for the purposes of coupling the ColorTemperatureMireds attribute to the CurrentLevel attribute when
        // the CoupleColorTempToLevel bit of the Options attribute of the Level Control cluster is equal to 1. When coupling
        // the ColorTemperatureMireds attribute to the CurrentLevel attribute, this value SHALL correspond to a
        // CurrentLevel value of 0xFE (100%).
        // Note that since this attribute is stored as a micro reciprocal degree (mired) value (i.e. color temperature in
        // kelvins = 1,000,000 / CoupleColorTempToLevelMinMireds), the CoupleColorTempToLevelMinMireds attribute
        // corresponds to an upper bound on the value of the color temperature in kelvins supported by the device.

        const tempCoupleMin = this.state.coupleColorTempToLevelMinMireds ?? this.minimumColorTemperatureMireds;
        const tempPhysMax = this.maximumColorTemperatureMireds;

        // Scale color temp setting between the coupling min and the physical max.
        // Note that mireds varies inversely with level: low level -> high mireds.
        // Peg min/MAX level to MAX/min mireds, otherwise interpolate.
        let newColorTemp;
        if (level <= MIN_CURRENT_LEVEL) {
            newColorTemp = tempPhysMax;
        } else if (level >= MAX_CURRENT_LEVEL) {
            newColorTemp = tempCoupleMin;
        } else {
            const tempDelta = Math.floor(
                ((tempPhysMax - tempCoupleMin) * level) / (MAX_CURRENT_LEVEL - MIN_CURRENT_LEVEL + 1),
            );
            newColorTemp = tempPhysMax - tempDelta;
        }

        logger.debug(`Synced color temperature with level: ${level}, new color temperature: ${newColorTemp}`);

        return this.moveToColorTemperatureLogic(newColorTemp, 0);
    }

    #assertRate(mode: ColorControl.MoveMode, rate: number) {
        if ((mode === ColorControl.MoveMode.Up || mode === ColorControl.MoveMode.Down) && rate === 0) {
            throw new StatusResponseError("Rate must not be 0 when moving Up or Down", StatusCode.InvalidCommand);
        }
    }

    /** Calculate the hue distance depending on the direction and the current and target hue. */
    #getHueDistanceByDirection(currentHue: number, targetHue: number, direction: ColorControl.Direction, max: number) {
        const distance = (targetHue > currentHue ? targetHue : max + targetHue + 1) - currentHue;
        if (distance === 0) {
            return 0;
        }
        if (direction === ColorControl.Direction.Up) {
            return distance;
        } else if (direction === ColorControl.Direction.Down) {
            return -(max - distance);
        }
        if (direction === ColorControl.Direction.Shortest) {
            if (Math.abs(distance) > max / 2) {
                return -(max - distance);
            }
            return distance;
        }
        if (direction === ColorControl.Direction.Longest) {
            if (Math.abs(distance) > max / 2) {
                return distance;
            }
            return -(max - distance);
        }
        throw new ImplementationError(`Unknown direction: ${direction}`);
    }

    /**
     * Create transition management instance.
     *
     * We manage transitions using {@link Transitions} if
     * {@link LevelControlBaseServer.State#managedTransitionTimeHandling} is true.
     *
     * You may override this method to replace the {@link Transitions} implementation customized for your application.
     * The provided configuration object is the default one used for Color Control transitions, but can be adjusted
     * if needed.
     */
    protected createTransitions<B extends Behavior>(config: Transitions.Configuration<B>) {
        return new Transitions(this.endpoint, config);
    }

    #initializeTransitions() {
        const { endpoint } = this;

        // Transitions read continuously from their configuration object so the values need to be dynamic.  To make
        // this efficient we use the read-only view of our state provided by the endpoint as it is always available
        const readOnlyState = (endpoint.state as Record<string, unknown>).colorControl as ColorControlBaseServer.State;

        return this.createTransitions({
            type: ColorControlBaseServer,

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
                currentHue: {
                    min: MIN_HUE_VALUE,
                    max: MAX_HUE_VALUE,
                    cyclic: true,
                },
                enhancedCurrentHue: {
                    min: MIN_HUE_VALUE,
                    max: MAX_ENHANCED_HUE_VALUE,
                    cyclic: true,
                },
                currentSaturation: {
                    min: MIN_SATURATION_VALUE,
                    max: MAX_SATURATION_VALUE,
                },
                colorTemperatureMireds: {
                    get min() {
                        const colorTempPhysicalMinMireds = readOnlyState.colorTempPhysicalMinMireds;
                        return colorTempPhysicalMinMireds === 0 ? MIN_TEMPERATURE_VALUE : colorTempPhysicalMinMireds;
                    },
                    get max() {
                        const colorTempPhysicalMaxMireds = readOnlyState.colorTempPhysicalMaxMireds;
                        return colorTempPhysicalMaxMireds === 0 ? MAX_TEMPERATURE_VALUE : colorTempPhysicalMaxMireds;
                    },
                },
                currentX: {
                    min: MIN_CIE_XY_VALUE,
                    max: MAX_CIE_XY_VALUE,
                },
                currentY: {
                    min: MIN_CIE_XY_VALUE,
                    max: MAX_CIE_XY_VALUE,
                },
            },
        });
    }

    #startTransition(transition: Transitions.Transition<ColorControlBaseServer>): MaybePromise {
        const { name } = transition;

        // When we start a Hue transition make sure both potential relevant are stopped
        if (name === "currentHue") {
            this.internal.transitions?.stop("enhancedCurrentHue");
        } else if (name === "enhancedCurrentHue") {
            this.internal.transitions?.stop("currentHue");
        }

        return this.internal.transitions?.start(transition);
    }

    #getBootReason() {
        const rootEndpoint = this.env.get(ServerNode);
        if (rootEndpoint.behaviors.has(GeneralDiagnosticsBehavior)) {
            return rootEndpoint.stateOf(GeneralDiagnosticsBehavior).bootReason;
        }
    }

    #calculateEffectiveOptions(
        optionsMask: TypeFromPartialBitSchema<typeof ColorControl.Options>,
        optionsOverride: TypeFromPartialBitSchema<typeof ColorControl.Options>,
    ): TypeFromPartialBitSchema<typeof ColorControl.Options> {
        const options = this.state.options ?? {};
        return {
            executeIfOff: optionsMask.executeIfOff ? optionsOverride.executeIfOff : options.executeIfOff,
        };
    }

    #optionsAllowExecution(
        optionsMask: TypeFromPartialBitSchema<typeof ColorControl.Options>,
        optionsOverride: TypeFromPartialBitSchema<typeof ColorControl.Options>,
    ) {
        const options = this.#calculateEffectiveOptions(optionsMask, optionsOverride);
        return options.executeIfOff || !this.agent.has(OnOffServer) || this.agent.get(OnOffServer).state.onOff;
    }

    #returnAsXyValue(value: number) {
        return value / 65536;
    }

    #returnAsOptionalXyValue(value: number | undefined) {
        if (value === undefined) {
            return undefined;
        }
        return this.#returnAsXyValue(value);
    }

    #setFromXyValue(fieldName: string, value: number | undefined) {
        if (value === undefined) {
            if ((this.state as any)[fieldName] === undefined) {
                return;
            } else {
                throw new ImplementationError(`${fieldName} cannot be set to undefined while being enabled.`);
            }
        }
        (this.state as any)[fieldName] = cropValueRange(Math.round(value * 65536), MIN_CIE_XY_VALUE, MAX_CIE_XY_VALUE);
    }

    #cropColorTemperature(temperatureMireds: number) {
        return cropValueRange(
            temperatureMireds,
            this.minimumColorTemperatureMireds,
            this.maximumColorTemperatureMireds,
        );
    }

    #supportsColorMode(targetMode: ColorControl.EnhancedColorMode) {
        switch (targetMode) {
            case ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation:
                return this.features.enhancedHue;
            case ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation:
                return this.features.hueSaturation;
            case ColorControl.EnhancedColorMode.CurrentXAndCurrentY:
                return this.features.xy;
            case ColorControl.EnhancedColorMode.ColorTemperatureMireds:
                return this.features.colorTemperature;
        }
        return false;
    }

    /** Apply Scene values when requested from ScenesManagement cluster */
    #applySceneValues(values: Val.Struct, transitionTime: number): MaybePromise {
        let targetEnhancedColorMode = ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation;
        let targetColorLoopActive = ColorControl.ColorLoopActive.Inactive;
        let targetColorLoopDirection = ColorControl.ColorLoopDirection.Decrement;
        let targetColorLoopTime = 25; // Default or 0??

        let targetCurrentX: number | undefined; // 0
        let targetCurrentY: number | undefined; // 0
        let targetEnhancedCurrentHue: number | undefined; // null
        let targetCurrentSaturation: number | undefined; // null
        let targetColorTemperatureMireds: number | undefined; // null

        if (this.features.xy) {
            if (typeof values.currentX === "number") {
                targetCurrentX = cropValueRange(values.currentX, 0, MAX_CIE_XY_VALUE);
            }
            if (typeof values.currentY === "number") {
                targetCurrentY = cropValueRange(values.currentY, 0, MAX_CIE_XY_VALUE);
            }
        }

        if (this.features.enhancedHue && typeof values.enhancedCurrentHue === "number") {
            targetEnhancedCurrentHue = values.enhancedCurrentHue;
        }
        if (this.features.hueSaturation && typeof values.currentSaturation === "number") {
            targetCurrentSaturation = cropValueRange(values.currentSaturation, 0, MAX_SATURATION_VALUE);
        }
        if (this.features.colorLoop) {
            if (typeof values.colorLoopActive === "number") {
                targetColorLoopActive = values.colorLoopActive;
            }
            if (typeof values.colorLoopDirection === "number") {
                targetColorLoopDirection = values.colorLoopDirection;
            }
            if (typeof values.colorLoopTime === "number") {
                targetColorLoopTime = values.colorLoopTime;
            }
        }
        if (this.features.colorTemperature && typeof values.colorTemperatureMireds === "number") {
            targetColorTemperatureMireds = cropValueRange(values.colorTemperatureMireds, 0, MAX_TEMPERATURE_VALUE);
        }
        if (
            this.features.enhancedHue &&
            typeof values.enhancedColorMode === "number" &&
            values.enhancedColorMode <= ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation
        ) {
            targetEnhancedColorMode = values.enhancedColorMode;
        }

        if (!this.#supportsColorMode(targetEnhancedColorMode)) {
            logger.info(
                `Can not apply scene with unsupported color mode: ${ColorControl.EnhancedColorMode[targetEnhancedColorMode]} (${targetEnhancedColorMode})`,
            );
        }

        if (this.features.colorLoop && targetColorLoopActive === ColorControl.ColorLoopActive.Active) {
            return this.colorLoopSet({
                updateFlags: { updateDirection: true, updateTime: true, updateAction: true },
                action: ColorControl.ColorLoopAction.ActivateFromEnhancedCurrentHue,
                direction: targetColorLoopDirection,
                time: targetColorLoopTime,
                optionsMask: { executeIfOff: true },
                optionsOverride: { executeIfOff: true },
                startHue: this.state.colorLoopStartEnhancedHue, // Will be ignored
            });
        }

        switch (targetEnhancedColorMode) {
            case ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation:
                if (targetCurrentSaturation !== undefined) {
                    return this.moveToSaturationLogic(targetCurrentSaturation, transitionTime / 100);
                }
                break;
            case ColorControl.EnhancedColorMode.CurrentXAndCurrentY:
                if (targetCurrentX !== undefined && targetCurrentY !== undefined) {
                    return this.moveToColorLogic(targetCurrentX, targetCurrentY, transitionTime);
                }
                break;
            case ColorControl.EnhancedColorMode.ColorTemperatureMireds:
                if (targetColorTemperatureMireds !== undefined) {
                    return this.moveToColorTemperatureLogic(targetColorTemperatureMireds, transitionTime);
                }
                break;
            case ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation:
                if (targetEnhancedCurrentHue !== undefined && targetCurrentSaturation !== undefined) {
                    return this.moveToEnhancedHueAndSaturationLogic(
                        targetEnhancedCurrentHue,
                        targetCurrentSaturation,
                        transitionTime,
                    );
                }
                break;
            default:
                logger.info(
                    `No supported color mode found to apply scene: ${ColorControl.EnhancedColorMode[targetEnhancedColorMode]} (${targetEnhancedColorMode})`,
                );
                break;
        }
    }

    override async [Symbol.asyncDispose]() {
        if (this.internal.transitions) {
            await this.internal.transitions.close();
            this.internal.transitions = undefined;
        }
        await super[Symbol.asyncDispose]?.();
    }
}

export namespace ColorControlBaseServer {
    export class Internal {
        /**
         * Transition management.
         */
        transitions?: Transitions<ColorControlBaseServer>;
    }

    export class State extends ColorControlBase.State {
        /**
         * The default implementation always set the target level immediately and so ignores all transition times
         * requested or configured.
         * Set this to true to manage transition times by changing the level value step wise every second. This is in
         * most cases not the best way because hardware supporting levels usually have ways to specify the change rate
         * or target value and transition time.
         */
        managedTransitionTimeHandling = false;

        /**
         * If transition management is disabled you may specify this as the "end time" for transitions.  The remaining
         * time attribute will then report correctly.
         */
        transitionEndTimeMs?: number;

        /**
         * When managing transitions, this is the interval at which steps occur in ms.
         */
        transitionStepInterval = Millis(100);

        // These were the default values specified prior to Matter 1.4.2.  We still need default values so using the
        // previously specified values which are presumably educated logical defaults
        override currentX = 24939;
        override currentY = 24701;
        override colorTemperatureMireds = 250;
        override enhancedColorMode = ColorControl.EnhancedColorMode.CurrentXAndCurrentY;
        override colorLoopTime = 25;
        override colorLoopStartEnhancedHue = 8960;
        override colorLoopActive = ColorControl.ColorLoopActive.Inactive;
        override colorLoopDirection = ColorControl.ColorLoopDirection.Increment;

        [Val.properties](endpoint: Endpoint) {
            // Only return remaining time if the attribute is defined in the endpoint
            if (
                (endpoint.behaviors.optionsFor(ColorControlBaseServer) as Record<string, unknown>)?.remainingTime ===
                    undefined &&
                (endpoint.behaviors.defaultsFor(ColorControlBaseServer) as Record<string, unknown>)?.remainingTime ===
                    undefined
            ) {
                return {};
            }
            return {
                set remainingTime(value: number) {
                    const transition = endpoint.behaviors.internalsOf(ColorControlBaseServer).transitions;
                    if (transition) {
                        transition.remainingTime = value;
                    }
                },

                get remainingTime() {
                    return endpoint.behaviors.internalsOf(ColorControlBaseServer).transitions?.remainingTime ?? 0;
                },
            };
        }
    }

    export class Events extends ColorControlBase.Events {
        transitionEndTime$Changed = AsyncObservable<[value: number, oldValue: number, context: ActionContext]>();
    }

    export declare const ExtensionInterface: {
        moveToHueLogic(
            targetHue: number,
            direction: ColorControl.Direction,
            transitionTime: number,
            isEnhancedHue: boolean,
        ): MaybePromise;
        moveHueLogic(moveMode: ColorControl.MoveMode, rate: number, isEnhancedHue: boolean): MaybePromise;
        stopHueAndSaturationMovement(): MaybePromise;
        stepHueLogic(
            stepMode: ColorControl.StepMode,
            stepSize: number,
            transitionTime: number,
            isEnhancedHue: boolean,
        ): MaybePromise;
        moveToSaturationLogic(targetSaturation: number, transitionTime: number): MaybePromise;
        moveSaturationLogic(moveMode: ColorControl.MoveMode, rate: number): MaybePromise;
        stepSaturationLogic(stepMode: ColorControl.StepMode, stepSize: number, transitionTime: number): MaybePromise;
        moveToHueAndSaturationLogic(targetHue: number, targetSaturation: number, transitionTime: number): MaybePromise;
        moveToColorLogic(targetX: number, targetY: number, transitionTime: number): MaybePromise;
        stopAllColorMovement(): MaybePromise;
        moveColorLogic(rateX: number, rateY: number): MaybePromise;
        stepColorLogic(stepX: number, stepY: number, transitionTime: number): MaybePromise;
        moveToColorTemperatureLogic(targetMireds: number, transitionTime: number): MaybePromise;
        moveToEnhancedHueAndSaturationLogic(
            targetEnhancedHue: number,
            targetSaturation: number,
            transitionTime: number,
        ): MaybePromise;
        stopColorLoopLogic(): MaybePromise;
        startColorLoopLogic(startHue: number): MaybePromise;
        stopMoveStepLogic(): MaybePromise;
        moveColorTemperatureLogic(
            moveMode: ColorControl.MoveMode,
            rate: number,
            colorTemperatureMinimumMireds: number,
            colorTemperatureMaximumMireds: number,
        ): MaybePromise;
        stepColorTemperatureLogic(
            stepMode: ColorControl.StepMode,
            stepSize: number,
            transitionTime: number,
            colorTemperatureMinimumMireds: number,
            colorTemperatureMaximumMireds: number,
        ): MaybePromise;
        switchColorMode(oldMode: ColorControl.ColorMode, newMode: ColorControl.ColorMode): MaybePromise;
        setColorMode(mode: ColorControl.ColorMode): MaybePromise;
        setEnhancedColorMode(mode: ColorControl.EnhancedColorMode): MaybePromise;
        syncColorTemperatureWithLevelLogic(level: number): MaybePromise;
        createTransitions(config: Transitions.Configuration<any>): Transitions<any>;
    };
}

// We had turned on some more features to provide a default implementation, but export the cluster with default
// Features again.
export class ColorControlServer extends ColorControlBaseServer.for(ClusterType(ColorControl.Base)) {}
