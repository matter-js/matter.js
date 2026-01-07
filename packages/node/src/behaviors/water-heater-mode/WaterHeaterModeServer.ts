/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeUtils } from "#behaviors/mode-base";
import { ModeBase } from "#clusters/mode-base";
import { WaterHeaterMode } from "#clusters/water-heater-mode";
import { ImplementationError, MaybePromise } from "#general";
import { WaterHeaterModeBehavior } from "./WaterHeaterModeBehavior.js";

/**
 * This is the default server implementation of {@link WaterHeaterModeBehavior}.
 */
export class WaterHeaterModeServer extends WaterHeaterModeBehavior {
    override initialize(): MaybePromise {
        this.#assertSupportedModes();
        ModeUtils.assertMode(this.state.supportedModes, this.state.currentMode);
        this.reactTo(this.events.currentMode$Changing, this.#assertMode);
    }

    #assertSupportedModes() {
        ModeUtils.assertSupportedModes(this.state.supportedModes);

        if (
            // Check that at least one of manual and Off is present as tags
            ![WaterHeaterMode.ModeTag.Manual, WaterHeaterMode.ModeTag.Off].every(modeTag =>
                this.state.supportedModes.some(({ modeTags }) => modeTags.some(({ value }) => value === modeTag)),
            ) ||
            // Check that the entries with Off, Manual, or Timed tag SHALL
            // NOT also include an additional instance of any one of these tag types
            ![WaterHeaterMode.ModeTag.Off, WaterHeaterMode.ModeTag.Manual, WaterHeaterMode.ModeTag.Timed].every(
                modeTag =>
                    !this.state.supportedModes.some(
                        ({ modeTags }) => modeTags.some(({ value }) => value === modeTag) && modeTags.length > 1,
                    ),
            )
        ) {
            throw new ImplementationError(
                "The supported modes need to support at least one of Off or Manual and not have multiple instances of Off, Manual, or Timed",
            );
        }
    }

    #assertMode(newMode: number) {
        ModeUtils.assertMode(this.state.supportedModes, newMode);
    }

    /**
     * This command is used to change device modes.
     * On receipt of this command the device shall respond with a ChangeToModeResponse command.
     *
     * The default implementation automatically validates the new mode against the supported modes and returns an error
     * if the new mode is not supported. If the new mode is supported, the current mode is updated to the new mode.
     *
     * If you need to override this with extra validation logic you can use
     * `ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode)`
     * to just execute the validation and add your own validation requirements before or after these standard checks.
     * The above method returns a `ModeBase.ChangeToModeResponse` object that you can use to return the result of the
     * validation.
     */
    override changeToMode({ newMode }: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse> {
        const result = ModeUtils.assertModeChange(this.state.supportedModes, this.state.currentMode, newMode);
        if (result.status === ModeBase.ModeChangeStatus.Success) {
            this.state.currentMode = newMode;
        }
        return result;
    }
}
