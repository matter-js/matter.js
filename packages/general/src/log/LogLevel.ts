/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";

/**
 * Supported logging severity levels.
 */
export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Map a string or number to a {@link LogLevel}
 */
export function LogLevel(level: string | LogLevel): LogLevel {
    if (typeof level === "string" && level.match(/^\d+$/)) {
        level = Number.parseInt(level) as LogLevel;
    }

    if (typeof level === "string") {
        switch (level.toLowerCase()) {
            case "debug":
                return LogLevel.DEBUG;
            case "info":
                return LogLevel.INFO;
            case "notice":
                return LogLevel.NOTICE;
            case "warn":
                return LogLevel.WARN;
            case "error":
                return LogLevel.ERROR;
            case "fatal":
                return LogLevel.FATAL;
            default:
        }
    } else if (level >= 0 && level <= 5) {
        return level;
    }

    throw new ImplementationError(`Unsupported log level "${level}"`);
}

export namespace LogLevel {
    export const DEBUG: LogLevel = 0;
    export const INFO: LogLevel = 1;
    export const NOTICE: LogLevel = 2;
    export const WARN: LogLevel = 3;
    export const ERROR: LogLevel = 4;
    export const FATAL: LogLevel = 5;

    export const names = ["debug", "info", "notice", "warn", "error", "fatal"];
}

LogLevel[0] = "debug";
LogLevel[1] = "info";
LogLevel[2] = "notice";
LogLevel[3] = "warn";
LogLevel[4] = "error";
LogLevel[5] = "fatal";

/**
 * @deprecated use {@link LogLevel}
 */
export const logLevelFromString = LogLevel;
