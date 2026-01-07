/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, SpawnOptions, SpawnSyncOptions } from "node:child_process";

export function run(command: string, args?: string[], options?: SpawnOptions) {
    return new Promise<void>((resolve, reject) => {
        let proc;
        try {
            proc = spawn(command, args ?? [], {
                stdio: "inherit",
                ...options,
            });
        } catch (e) {
            reject(e as Error);
            return;
        }

        proc.on("error", error => {
            reject(error);
        });

        proc.on("close", code => {
            if (code) {
                reject(new Error(`Child process exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });
}

export function git(args: string[], options: SpawnSyncOptions) {
    return run("git", args, options);
}
