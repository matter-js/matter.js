/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile, unlink } from "node:fs/promises";
import { Subject } from "../device/subject.js";

/**
 * Monitors a host-side file that is bind-mounted into the Docker container.  When the CHIP Python test framework calls
 * `request_device_reboot()` or `request_device_factory_reset()`, it writes a command string to the restart flag file
 * and polls until the file is deleted.
 *
 * This monitor detects the file, dispatches the appropriate backchannel command to the matter.js test subject, and
 * deletes the file once the action completes — signaling the Python test to continue.
 *
 * Polling at 100ms adds up to 100ms latency per restart cycle which is well within the Python side's 30s timeout.
 */
export class RestartFlagMonitor {
    #hostPath: string;
    #subject: Subject;
    #active = false;
    #polling?: Promise<void>;

    constructor(hostPath: string, subject: Subject) {
        this.#hostPath = hostPath;
        this.#subject = subject;
    }

    start() {
        if (this.#active) {
            return;
        }
        this.#active = true;
        this.#polling = this.#poll();
    }

    async stop() {
        this.#active = false;
        await this.#polling;
        this.#polling = undefined;
    }

    async #poll() {
        while (this.#active) {
            // Read directly, catch ENOENT — avoids TOCTOU race between exists check and read
            let content: string | undefined;
            try {
                content = (await readFile(this.#hostPath, "utf-8")).trim();
            } catch (e: unknown) {
                if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                    console.warn("Error reading restart flag file:", e);
                }
            }

            if (content) {
                await this.#handle(content);
                try {
                    await unlink(this.#hostPath);
                } catch (e: unknown) {
                    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                        console.warn("Failed to delete restart flag file:", e);
                    }
                }
            }

            await new Promise<void>(resolve => setTimeout(resolve, 100));
        }
    }

    async #handle(content: string) {
        switch (content) {
            case "restart":
                await this.#subject.backchannel({ name: "reboot" });
                break;

            case "factory reset":
            case "factory reset app only":
                await this.#subject.backchannel({ name: "factoryReset" });
                break;

            default:
                console.warn(`Unknown restart flag content: "${content}"`);
                break;
        }
    }
}
