/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, SpawnOptions } from "node:child_process";
import { platform } from "node:os";

import colors from "ansi-colors";

export async function execute(bin: string, argv: string[], env?: typeof process.env) {
    return new Promise<number>((resolve, reject) => {
        let finished = false;

        const options: SpawnOptions = {
            stdio: "inherit",
        };
        if (platform() === "win32") {
            options.shell = true;
        }
        if (env !== undefined) {
            options.env = { ...process.env, ...env };
        }

        const proc = spawn(bin, argv, options);

        // Proxy SIGUSR2 to the child process
        process.on("SIGUSR2", () => {
            proc.kill("SIGUSR2");
        });

        proc.on("error", e => {
            finished = true;
            reject(e);
        });

        proc.on("close", code => {
            if (finished) {
                return;
            }
            finished = true;

            resolve(code ?? 1);
        });
    });
}

export async function executeNode(script: string, argv: string[], nodeArgv = Array<string>()) {
    argv = ["--enable-source-maps", ...nodeArgv, script, ...argv];
    if (process.env.MATTER_RUN_ECHO) {
        const command = colors.whiteBright(`node ${argv.join(" ")}`);
        process.stdout.write(`${colors.greenBright("Matter execute:")} ${command}\n`);
    }
    const env = {} as NodeJS.ProcessEnv;

    // Hmm this is a little much as a default
    // if (process.env.MATTER_LOG_STACK_LIMIT === undefined) {
    //     env.MATTER_LOG_STACK_LIMIT = "100";
    // }

    return execute("node", argv, env);
}
