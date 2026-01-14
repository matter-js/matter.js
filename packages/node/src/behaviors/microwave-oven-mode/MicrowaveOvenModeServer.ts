/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ModeUtils } from "#behaviors/mode-base";
import { MicrowaveOvenMode } from "#clusters/microwave-oven-mode";
import { ImplementationError, MaybePromise } from "#general";
import { MicrowaveOvenModeBehavior } from "./MicrowaveOvenModeBehavior.js";

/**
 * This is the default server implementation of {@link MicrowaveOvenModeBehavior}.
 */
export class MicrowaveOvenModeServer extends MicrowaveOvenModeBehavior {
    override initialize(): MaybePromise {
        this.#assertSupportedModes();
        ModeUtils.assertMode(this.state.supportedModes, this.state.currentMode);
        this.reactTo(this.events.currentMode$Changing, this.#assertMode);
    }

    #assertSupportedModes() {
        ModeUtils.assertSupportedModes(this.state.supportedModes);
        if (
            this.state.supportedModes.filter(({ modeTags }) =>
                modeTags.some(({ value }) => value === MicrowaveOvenMode.ModeTag.Normal),
            ).length !== 1
        ) {
            throw new ImplementationError("Provided supportedModes need to include exactly one Normal mode tag");
        }

        if (
            this.state.supportedModes.some(
                ({ modeTags }) =>
                    modeTags.some(({ value }) => value === MicrowaveOvenMode.ModeTag.Normal) &&
                    modeTags.some(({ value }) => value === MicrowaveOvenMode.ModeTag.Defrost),
            )
        ) {
            throw new ImplementationError(
                "Provided supportedModes must not have Normal and Defrost mode tags together in one mode",
            );
        }
    }

    #assertMode(newMode: number) {
        ModeUtils.assertMode(this.state.supportedModes, newMode);
    }
}
