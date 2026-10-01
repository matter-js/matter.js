/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { hostname } from "node:os";
import { Docker } from "../docker/docker.js";
import { DockerError } from "../docker/errors.js";

const PID_LABEL = "matter.js.harness.pid";
const HOST_LABEL = "matter.js.harness.host";
const CWD_LABEL = "matter.js.harness.cwd";

const DEFAULT_POLL_MS = 2_000;
const RETRY_MS = 100;

/** How long a lock may stay without running before it counts as left over; a starting lock runs within ms. */
const LEFTOVER_MS = 30_000;

/** Docker states in which a lock container has a live owner. */
const HELD_STATES = new Set(["running", "restarting", "paused"]);

/** A lock container as {@link HarnessLockDocker.inspect} reports it. */
export interface HarnessLockState {
    /** Docker's `State.Status`. */
    status: string;
    labels: Record<string, string>;
}

/** A lock this process holds. */
export interface HeldHarnessLock {
    /** Ends the lock; its container stops and removes itself. */
    release(): Promise<void>;
}

/**
 * The Docker operations {@link acquireHarnessLock} needs, extracted so tests can substitute a fake without a
 * running Docker daemon.
 */
export interface HarnessLockDocker {
    /**
     * Creates and starts `name` with its standard input held open by this process; rejects with a 409
     * {@link DockerError} when the name is taken.
     */
    start(name: string, labels: Record<string, string>): Promise<HeldHarnessLock>;

    /** The state of `name`, or `undefined` when no such container exists. */
    inspect(name: string): Promise<HarnessLockState | undefined>;
}

export interface HarnessLockOptions {
    /** Container name that serves as the lock. */
    name: string;

    /** How long to wait for another run to release the lock; 0 fails at once when another run holds it. */
    waitMs: number;

    /** Image and platform the lock container runs; it needs only `cat`. */
    image: string;
    platform?: string;

    pollMs?: number;
    docker?: HarnessLockDocker;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    log?: (text: string) => void;
}

/**
 * Thrown when the harness lock of the Docker daemon cannot be taken: another run still holds it after the configured
 * wait, or a lock that does not run is left over. Extends `Error` because `@matter/testing` does not depend on
 * `@matter/general`.
 */
export class HarnessBusyError extends Error {
    override name = "HarnessBusyError";
}

/**
 * Takes the lock that gives one test run the shared harness containers of a Docker daemon, and returns its release.
 *
 * The harness containers run on the host network under fixed names, so two runs at once share ports, mDNS and the
 * default discriminator, and each run recreates the other's `chip` container. The lock is a running container that
 * reads its standard input from this process: Docker refuses a second container of the same name, and the container
 * exits and removes itself when this process ends, however it ends.
 *
 * `waitMs` bounds the wait for a lock another run holds. A lock is never removed on another run's behalf: one that
 * does not run for {@link LEFTOVER_MS}, such as one whose process died between creating and starting it, fails the
 * run with the command that clears it, whatever `waitMs` is.
 */
export async function acquireHarnessLock(options: HarnessLockOptions): Promise<() => Promise<void>> {
    const {
        name,
        waitMs,
        image,
        platform,
        pollMs = DEFAULT_POLL_MS,
        docker = realHarnessLockDocker(image, platform),
        sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
        now = Date.now,
        log = (text: string) => console.log(text),
    } = options;

    const deadline = now() + waitMs;
    let announced = false;
    let unownedSince: number | undefined;

    for (;;) {
        try {
            const lock = await docker.start(name, ownerLabels());
            return () => lock.release();
        } catch (e) {
            DockerError.accept(e, 409);
        }

        const holder = await docker.inspect(name);
        const held = holder !== undefined && HELD_STATES.has(holder.status);

        if (held) {
            unownedSince = undefined;
        } else {
            unownedSince ??= now();
            if (now() - unownedSince >= LEFTOVER_MS) {
                throw new HarnessBusyError(
                    `The CHIP test harness lock ${name} is left over: it has not been running for ` +
                        `${Math.round(LEFTOVER_MS / 1000)}s (${holder?.status ?? "name taken, no container"}). ` +
                        `Remove it with "docker rm -f ${name}".`,
                );
            }
        }

        if (held && now() >= deadline) {
            throw new HarnessBusyError(
                `The CHIP test harness of this Docker daemon is in use by ${describeHolder(holder)}` +
                    `${waitMs > 0 ? ` and was not released within ${Math.round(waitMs / 1000)}s` : ""}. Only one run ` +
                    `can use it at a time; wait for that run to finish or stop it. If no such run exists, remove ` +
                    `the lock with "docker rm -f ${name}".`,
            );
        }

        if (held) {
            if (!announced) {
                log(`Waiting for the CHIP test harness, which is in use by ${describeHolder(holder)}`);
                announced = true;
            }
            await sleep(pollMs);
        } else {
            await sleep(RETRY_MS);
        }
    }
}

function ownerLabels(): Record<string, string> {
    return { [PID_LABEL]: String(process.pid), [HOST_LABEL]: hostname(), [CWD_LABEL]: process.cwd() };
}

function describeHolder(holder: HarnessLockState | undefined) {
    const labels = holder?.labels ?? {};
    const pid = labels[PID_LABEL];
    if (pid === undefined) {
        return "another run";
    }
    return `pid ${pid} on ${labels[HOST_LABEL] ?? "?"} (${labels[CWD_LABEL] ?? "?"})`;
}

function realHarnessLockDocker(image: string, platform: string | undefined): HarnessLockDocker {
    const docker = new Docker();
    return {
        async start(name, labels) {
            const ct = await DockerError.adapt(
                docker.intf.createContainer({
                    name,
                    Image: image,
                    platform,
                    Entrypoint: ["cat"],
                    Cmd: [],
                    Labels: labels,
                    OpenStdin: true,
                    StdinOnce: true,
                    AttachStdin: true,
                    HostConfig: { AutoRemove: true },
                }),
            );

            let stdin: NodeJS.ReadWriteStream | undefined;
            let holding = false;
            try {
                stdin = await DockerError.adapt(
                    ct.attach({ stream: true, stdin: true, stdout: false, stderr: false, hijack: true }),
                );

                // A lost connection ends the lock while this run goes on, so another run may take the harness;
                // say so, but not as an unhandled error in whatever test is running
                stdin.on("error", error => console.warn(`Harness lock ${name} lost its connection:`, error));
                stdin.on("close", () => {
                    if (holding) {
                        console.warn(
                            `Harness lock ${name} ended while this run still uses the harness; another run may now ` +
                                "take it and recreate its containers",
                        );
                    }
                });

                await DockerError.adapt(ct.start());
            } catch (e) {
                stdin?.end();
                try {
                    await ct.remove({ force: true });
                } catch {
                    // The start is what failed; its error is the one to report
                }
                throw e;
            }

            holding = true;

            // The open stream is the lock, not a reason to keep the process alive
            if ("unref" in stdin && typeof stdin.unref === "function") {
                stdin.unref();
            }

            const attached = stdin;
            return {
                async release() {
                    holding = false;
                    attached.end();
                    try {
                        await DockerError.adapt(ct.remove({ force: true }));
                    } catch (e) {
                        DockerError.accept(e, 404, 409);
                    }
                },
            };
        },

        async inspect(name) {
            try {
                const inspect = await DockerError.adapt(docker.intf.getContainer(name).inspect());
                return { status: inspect.State.Status, labels: inspect.Config.Labels ?? {} };
            } catch (e) {
                DockerError.accept(e, 404);
                return undefined;
            }
        },
    };
}
