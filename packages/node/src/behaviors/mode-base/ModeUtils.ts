/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, Logger } from "@matter/general";
import { ModeBase } from "@matter/types/clusters/mode-base";

const logger = Logger.get("ModeUtils");

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
        if (!isSupported(supportedModes, newMode)) {
            throw new UnsupportedModeError(
                `Can not use unsupported mode: ${newMode}. Allowed modes are ${supportedModes.map(({ mode }) => mode).join(", ")}`,
            );
        }
    }

    /**
     * Returns {@link mode} if {@link supportedModes} contains it, otherwise the mode of the first entry, with a
     * warning naming {@link owner}.
     *
     * Use this at startup for CurrentMode. SupportedModes is fixed per firmware, so a mode stored before a firmware
     * update can be unsupported now. The specification defines no fallback for this case; the first entry matches the
     * CHIP SDK.
     *
     * @throws ImplementationError when {@link supportedModes} is empty
     * @see {@link MatterSpecification.v161.Cluster} § 1.9.6.4, § 1.10.6.2
     */
    export function supportedModeOrFirst(supportedModes: GenericModeOption[], mode: number, owner: string): number {
        if (isSupported(supportedModes, mode)) {
            return mode;
        }
        if (!supportedModes.length) {
            throw new ImplementationError(`${owner} has no supportedModes`);
        }
        const fallback = supportedModes[0].mode;
        warnReplaced(owner, "currentMode", mode, fallback);
        return fallback;
    }

    /**
     * Returns {@link mode} if it is null or {@link supportedModes} contains it, otherwise null, with a warning naming
     * {@link attribute} of {@link owner}.
     *
     * Use this at startup for a nullable mode attribute such as StartUpMode or OnMode, where null means "no effect".
     *
     * @see {@link MatterSpecification.v161.Cluster} § 1.9.6.5, § 1.9.6.6
     */
    export function supportedModeOrNull(
        supportedModes: GenericModeOption[],
        mode: number | null,
        owner: string,
        attribute: string,
    ): number | null {
        if (mode === null || isSupported(supportedModes, mode)) {
            return mode;
        }
        warnReplaced(owner, attribute, mode, null);
        return null;
    }

    /** Returns true if {@link supportedModes} contains an entry with {@link mode}. */
    export function isSupported(supportedModes: GenericModeOption[], mode: number) {
        return supportedModes.some(entry => entry.mode === mode);
    }

    function warnReplaced(owner: string, attribute: string, mode: number, replacement: number | null) {
        logger.warn(`${owner}: ${attribute} ${mode} is not in supportedModes, using ${replacement}`);
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
