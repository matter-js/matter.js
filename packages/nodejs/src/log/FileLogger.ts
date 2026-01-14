/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { open } from "node:fs/promises";

/**
 * Creates a file based logger to append to the given path.
 * The file is opened on start and closed when the process shuts down.
 * Errors are logged to the console.
 */
export async function createFileLogger(path: string) {
    const fileHandle = await open(path, "a");
    const writer = fileHandle.createWriteStream();
    process.on(
        "beforeExit",
        () => void fileHandle.close().catch(err => err && console.error(`Failed to close log file: ${err}`)),
    );

    return (formattedLog: string) => {
        try {
            writer.write(`${formattedLog}\n`);
        } catch (error) {
            console.error(`Failed to write to log file: ${error}`);
        }
    };
}
