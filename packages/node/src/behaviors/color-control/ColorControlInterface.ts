/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ColorControl } from "#clusters/color-control";

export namespace ColorControlInterface {
    export interface HueSaturation {
        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.4
         */
        moveToHue(request: ColorControl.MoveToHueRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.5
         */
        moveHue(request: ColorControl.MoveHueRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.6
         */
        stepHue(request: ColorControl.StepHueRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.7
         */
        moveToSaturation(request: ColorControl.MoveToSaturationRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.8
         */
        moveSaturation(request: ColorControl.MoveSaturationRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.9
         */
        stepSaturation(request: ColorControl.StepSaturationRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.10
         */
        moveToHueAndSaturation(request: ColorControl.MoveToHueAndSaturationRequest): MaybePromise;
    }

    export interface Xy {
        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.11
         */
        moveToColor(request: ColorControl.MoveToColorRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.12
         */
        moveColor(request: ColorControl.MoveColorRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.13
         */
        stepColor(request: ColorControl.StepColorRequest): MaybePromise;
    }

    export interface ColorTemperature {
        /**
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.14
         */
        moveToColorTemperature(request: ColorControl.MoveToColorTemperatureRequest): MaybePromise;

        /**
         * This command allows the color temperature of the light to be moved at a specified rate.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.21
         */
        moveColorTemperature(request: ColorControl.MoveColorTemperatureRequest): MaybePromise;

        /**
         * This command allows the color temperature of the light to be stepped with a specified step size.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.22
         */
        stepColorTemperature(request: ColorControl.StepColorTemperatureRequest): MaybePromise;
    }

    export interface EnhancedHue {
        /**
         * This command allows the light to be moved in a smooth continuous transition from their current hue to a
         * target hue.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.15
         */
        enhancedMoveToHue(request: ColorControl.EnhancedMoveToHueRequest): MaybePromise;

        /**
         * This command allows the light to start a continuous transition starting from their current hue.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.16
         */
        enhancedMoveHue(request: ColorControl.EnhancedMoveHueRequest): MaybePromise;

        /**
         * This command allows the light to be moved in a stepped transition from their current hue, resulting in a
         * linear transition through XY space.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.17
         */
        enhancedStepHue(request: ColorControl.EnhancedStepHueRequest): MaybePromise;

        /**
         * This command allows the light to be moved in a smooth continuous transition from their current hue to a
         * target hue and from their current saturation to a target saturation.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.18
         */
        enhancedMoveToHueAndSaturation(request: ColorControl.EnhancedMoveToHueAndSaturationRequest): MaybePromise;
    }

    export interface ColorLoop {
        /**
         * This command allows a color loop to be activated such that the color light cycles through its range of hues.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.19
         */
        colorLoopSet(request: ColorControl.ColorLoopSetRequest): MaybePromise;
    }

    export interface HueSaturationOrXyOrColorTemperature {
        /**
         * This command is provided to allow MoveTo and Step commands to be stopped.
         *
         * NOTE This automatically provides symmetry to the Level Control cluster.
         *
         * NOTE The StopMoveStep command has no effect on an active color loop.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 3.2.8.20
         */
        stopMoveStep(request: ColorControl.StopMoveStepRequest): MaybePromise;
    }
}

export type ColorControlInterface = {
    components: [
        { flags: { hueSaturation: true }, methods: ColorControlInterface.HueSaturation },
        { flags: { xy: true }, methods: ColorControlInterface.Xy },
        { flags: { colorTemperature: true }, methods: ColorControlInterface.ColorTemperature },
        { flags: { enhancedHue: true }, methods: ColorControlInterface.EnhancedHue },
        { flags: { colorLoop: true }, methods: ColorControlInterface.ColorLoop },
        { flags: { hueSaturation: true }, methods: ColorControlInterface.HueSaturationOrXyOrColorTemperature },
        { flags: { xy: true }, methods: ColorControlInterface.HueSaturationOrXyOrColorTemperature },
        { flags: { colorTemperature: true }, methods: ColorControlInterface.HueSaturationOrXyOrColorTemperature }
    ]
};
