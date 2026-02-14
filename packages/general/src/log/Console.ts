/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "./Diagnostic.js";
import { LogLevel } from "./LogLevel.js";

export namespace Console {
    /**
     * The console provided by the JS environment.
     */
    export const system = globalThis.console;

    /**
     * The console targeted for logging.
     */
    // oxlint-disable-next-line prefer-const
    export let console = system;

    /**
     * Log messages to the console.
     */
    export function write(text: string, message: Diagnostic.Message) {
        switch (message.level) {
            case LogLevel.DEBUG:
                console.debug(text);
                break;

            case LogLevel.INFO:
                console.info(text);
                break;

            case LogLevel.NOTICE:
                console.info(text);
                break;

            case LogLevel.WARN:
                console.warn(text);
                break;

            case LogLevel.ERROR:
                console.error(text);
                break;

            case LogLevel.FATAL:
                console.error(text);
                break;
        }
    }
}
