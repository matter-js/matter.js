/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ModeBase } from "#clusters/mode-base";
import { ImplementationError } from "#general";

export class UnsupportedModeError extends ImplementationError {}

// Ignore modeTags property because this is "derived cluster specific" and not used for the validation
type GenericModeOption = Omit<ModeBase.ModeOption, "modeTags">;

export namespace ModeUtils {
    export function assertSupportedModes(supportedModes: GenericModeOption[]) {
        const labels = new Set<string>();
        const modes = new Set<number>();
        for (const { mode, label } of supportedModes) {
            if (labels.has(label)) {
                throw new ImplementationError(`Duplicate label in supportedModes: ${label}`);
            }
            if (modes.has(mode)) {
                throw new ImplementationError(`Duplicate mode in supportedModes: ${mode}`);
            }
            labels.add(label);
            modes.add(mode);
        }
    }

    export function assertMode(supportedModes: GenericModeOption[], newMode: number) {
        if (!supportedModes.some(({ mode }) => mode === newMode)) {
            throw new UnsupportedModeError(
                `Can not use unsupported mode: ${newMode}. Allowed modes are ${supportedModes.map(({ mode }) => mode).join(", ")}`,
            );
        }
    }

    export function assertModeChange(supportedModes: GenericModeOption[], currentMode: number, newMode: number) {
        if (currentMode !== newMode) {
            try {
                assertMode(supportedModes, newMode);
            } catch (error) {
                UnsupportedModeError.accept(error);
                return {
                    status: ModeBase.ModeChangeStatus.UnsupportedMode,
                    statusText: `Unsupported mode: ${newMode}`,
                };
            }
        }
        return {
            status: ModeBase.ModeChangeStatus.Success,
            statusText: "",
        };
    }
}
