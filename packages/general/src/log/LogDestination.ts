/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Console } from "./Console.js";
import { Diagnostic } from "./Diagnostic.js";
import { LogFormat } from "./LogFormat.js";
import { LogLevel } from "./LogLevel.js";

/**
 * An endpoint for log messages.
 *
 * You can replace the default destination or add additional destinations to control how log messages are stored.
 */
export interface LogDestination {
    /**
     * The name of the destination, used for configuration.
     */
    name: string;

    /**
     * The maximum level to log if not set explicitly.
     */
    level: LogLevel;

    /**
     * The maximum level to log for specific facility names.
     */
    facilityLevels: Record<string, LogLevel>;

    /**
     * Contextual information used to optimize log output.
     */
    context?: Diagnostic.Context;

    /**
     * Add an entry to the log.
     *
     * The default implementation formats using {@link format} and writes using {@link write}.
     */
    add(message: Diagnostic.Message): void;

    /**
     * Format a log message.
     *
     * The default {@link add} implementation uses this to format message for {@link write}.
     */
    format(message: Diagnostic.Message): string;

    /**
     * Write a formatted message to the log.
     *
     * The default {@link add} implementation uses this to write messages after formatting.
     */
    write(text: string, message: Diagnostic.Message): void;
}

/**
 * Create a new {@link LogDestination}.
 */
export function LogDestination<T extends Partial<LogDestination>>(
    config?: T,
): T extends { add: () => unknown } ? LogDestination : LogDestination {
    return {
        ...LogDestination.defaults,
        ...config,
    };
}

export namespace LogDestination {
    /**
     * Defaults for {@link LogDestination} fields.
     */
    export const defaults: LogDestination = {
        name: "default",

        level: LogLevel.DEBUG,

        facilityLevels: {},

        add(message: Diagnostic.Message) {
            this.write(this.format(message), message);
        },

        format: LogFormat.formats.ansi,

        write: Console.write,
    };
}

/**
 * Create a collection of log destinations, keyed by configuration name.
 *
 * Automatically includes a default destination named "default".
 */
export function LogDestinations() {
    const destinations: Record<string, LogDestination> = {
        default: { ...LogDestination.defaults },
    };

    return new Proxy(destinations, {
        get(target, name, receiver) {
            if (typeof name === "string" && !(name in destinations)) {
                throw new ImplementationError(`Log destination "${name}" does not exist`);
            }

            return Reflect.get(target, name, receiver);
        },
    }) as unknown as Record<string, LogDestination>;
}
