/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModeUtils } from "#behaviors/mode-base";
import { DishwasherMode } from "#clusters/dishwasher-mode";
import { ModeBase } from "#clusters/mode-base";
import { MaybePromise } from "#general";
import { DishwasherModeBehavior } from "./DishwasherModeBehavior.js";

/**
 * This is the default server implementation of {@link DishwasherModeBehavior}.
 */
export class DishwasherModeServer extends DishwasherModeBehavior {
    override initialize(): MaybePromise {
        this.#assertSupportedModes();
        ModeUtils.assertMode(this.state.supportedModes, this.state.currentMode);
        this.reactTo(this.events.currentMode$Changing, this.#assertMode);
    }

    #assertSupportedModes() {
        ModeUtils.assertSupportedModes(this.state.supportedModes);
        if (
            !this.state.supportedModes.some(({ modeTags }) =>
                modeTags.some(({ value }) => value === DishwasherMode.ModeTag.Normal),
            )
        ) {
            throw new Error("Provided supportedModes need to include at least Normal mode tag");
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
