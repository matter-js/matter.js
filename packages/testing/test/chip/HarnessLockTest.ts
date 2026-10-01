/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Constants } from "../../src/chip/config.js";
import type { HarnessLockDocker, HarnessLockOptions, HarnessLockState } from "../../src/chip/harness-lock.js";
import { acquireHarnessLock, HarnessBusyError } from "../../src/chip/harness-lock.js";
import { DockerError } from "../../src/docker/errors.js";

const LOCK = "test-harness-lock";
const OTHER_LABELS = {
    "matter.js.harness.pid": "200",
    "matter.js.harness.host": "other-host",
    "matter.js.harness.cwd": "/work/other",
};

class FakeDocker implements HarnessLockDocker {
    containers = new Map<string, HarnessLockState>();

    put(status: string, labels: Record<string, string> = OTHER_LABELS) {
        this.containers.set(LOCK, { status, labels });
    }

    async start(name: string, labels: Record<string, string>) {
        if (this.containers.has(name)) {
            throw new DockerError("Conflict. The container name is already in use (409)", 409, "Conflict");
        }
        const state = { status: "running", labels };
        this.containers.set(name, state);
        return {
            release: async () => {
                if (this.containers.get(name) === state) {
                    this.containers.delete(name);
                }
            },
        };
    }

    async inspect(name: string) {
        return this.containers.get(name);
    }
}

function optionsFor(docker: FakeDocker, overrides: Partial<HarnessLockOptions> = {}) {
    const logs = new Array<string>();
    const slept = new Array<number>();
    let clock = 0;
    const options: HarnessLockOptions = {
        name: LOCK,
        image: "unused",
        waitMs: 600_000,
        pollMs: 1_000,
        docker,
        sleep: async ms => {
            slept.push(ms);
            clock += ms;
        },
        now: () => clock,
        log: text => logs.push(text),
        ...overrides,
    };
    return { options, logs, slept };
}

async function rejectionOf(promise: Promise<unknown>) {
    return promise.then(
        () => undefined,
        (e: unknown) => e,
    );
}

function ownedBySelf(docker: FakeDocker) {
    return docker.containers.get(LOCK)?.labels["matter.js.harness.pid"] === String(process.pid);
}

describe("acquireHarnessLock", () => {
    it("takes a free lock, labelled with this process, and ends it on release", async () => {
        const docker = new FakeDocker();

        const release = await acquireHarnessLock(optionsFor(docker).options);

        expect(ownedBySelf(docker)).equal(true);
        await release();
        expect(docker.containers.has(LOCK)).equal(false);
    });

    it("waits while another run holds the lock, saying once whom it waits for", async () => {
        const docker = new FakeDocker();
        docker.put("running");
        let polls = 0;
        const { options, logs } = optionsFor(docker, {
            sleep: async () => {
                if (++polls === 3) {
                    docker.containers.delete(LOCK);
                }
            },
        });

        await acquireHarnessLock(options);

        expect(polls).equal(3);
        expect(ownedBySelf(docker)).equal(true);
        expect(logs).deep.equal([
            "Waiting for the CHIP test harness, which is in use by pid 200 on other-host (/work/other)",
        ]);
    });

    it("waits for a lock another run is still starting as not yet held, and takes it once that run is done", async () => {
        const docker = new FakeDocker();
        docker.put("created");
        const slept = new Array<number>();
        const { options, logs } = optionsFor(docker, {
            sleep: async ms => {
                slept.push(ms);
                if (slept.length === 1) {
                    expect(logs).deep.equal([]);
                    docker.put("running");
                } else if (slept.length === 3) {
                    docker.containers.delete(LOCK);
                }
            },
        });

        await acquireHarnessLock(options);

        expect(slept).deep.equal([100, 1_000, 1_000]);
        expect(ownedBySelf(docker)).equal(true);
        expect(logs).deep.equal([
            "Waiting for the CHIP test harness, which is in use by pid 200 on other-host (/work/other)",
        ]);
    });

    it("fails a lock that never started as left over, however long it may wait, and removes nothing", async () => {
        const docker = new FakeDocker();
        docker.put("created");

        const error = await rejectionOf(acquireHarnessLock(optionsFor(docker, { waitMs: 3_600_000 }).options));

        expect(error)
            .instanceOf(HarnessBusyError)
            .with.property("message")
            .that.contains("left over")
            .and.contains("(created)")
            .and.contains(`docker rm -f ${LOCK}`);
        expect(docker.containers.get(LOCK)?.status).equal("created");
    });

    it("fails at once, without waiting, naming the holder and how to clear a stale lock, when it may not wait", async () => {
        const docker = new FakeDocker();
        docker.put("running");
        const { options, logs, slept } = optionsFor(docker, { waitMs: 0 });

        const error = await rejectionOf(acquireHarnessLock(options));

        expect(error)
            .instanceOf(HarnessBusyError)
            .with.property("message")
            .that.contains("pid 200 on other-host (/work/other)")
            .and.contains(`docker rm -f ${LOCK}`);
        expect(slept).deep.equal([]);
        expect(logs).deep.equal([]);
    });

    it("gives up after the wait when the other run keeps the lock", async () => {
        const docker = new FakeDocker();
        docker.put("running");

        const error = await rejectionOf(acquireHarnessLock(optionsFor(docker, { waitMs: 5_000 }).options));

        expect(error).instanceOf(HarnessBusyError).with.property("message").that.contains("not released within 5s");
    });

    it("takes the lock once a lock that is ending has removed itself", async () => {
        const docker = new FakeDocker();
        docker.put("exited");
        const { options, slept } = optionsFor(docker, {
            sleep: async ms => {
                slept.push(ms);
                docker.containers.delete(LOCK);
            },
        });

        await acquireHarnessLock(options);

        expect(slept).deep.equal([100]);
        expect(ownedBySelf(docker)).equal(true);
    });

    it("waits out a lock that is ending even when it may not wait for a held one", async () => {
        const docker = new FakeDocker();
        docker.put("exited");
        const { options, slept } = optionsFor(docker, {
            waitMs: 0,
            sleep: async ms => {
                slept.push(ms);
                if (slept.length === 2) {
                    docker.containers.delete(LOCK);
                }
            },
        });

        await acquireHarnessLock(options);

        expect(slept).deep.equal([100, 100]);
        expect(ownedBySelf(docker)).equal(true);
    });

    it("reports a left-over lock as left over, not as in use, when the wait is shorter than the leftover rule", async () => {
        const docker = new FakeDocker();
        docker.put("dead");

        const error = await rejectionOf(acquireHarnessLock(optionsFor(docker, { waitMs: 5_000 }).options));

        expect(error).instanceOf(HarnessBusyError).with.property("message").that.contains("left over");
    });

    it("fails with the command that clears it for a lock left without an owner, and removes nothing", async () => {
        const docker = new FakeDocker();
        docker.put("exited");

        const error = await rejectionOf(acquireHarnessLock(optionsFor(docker).options));

        expect(error)
            .instanceOf(HarnessBusyError)
            .with.property("message")
            .that.contains("left over")
            .and.contains(`docker rm -f ${LOCK}`);
        expect(docker.containers.get(LOCK)?.status).equal("exited");
    });

    it("counts the leftover time again from the start after the lock ran in between", async () => {
        const docker = new FakeDocker();
        docker.put("exited");
        let retries = 0;
        let clock = 0;
        const { options } = optionsFor(docker, {
            sleep: async ms => {
                clock += ms;
                if (ms !== 100) {
                    docker.put("exited");
                } else if (++retries === 200) {
                    docker.put("running");
                } else if (retries === 400) {
                    docker.containers.delete(LOCK);
                }
            },
            now: () => clock,
        });

        await acquireHarnessLock(options);

        expect(ownedBySelf(docker)).equal(true);
    });

    it("fails as left over when the name stays taken without a container", async () => {
        const docker = new FakeDocker();
        docker.start = async () => {
            throw new DockerError("Conflict. The container name is already in use (409)", 409, "Conflict");
        };

        const error = await rejectionOf(acquireHarnessLock(optionsFor(docker).options));

        expect(error)
            .instanceOf(HarnessBusyError)
            .with.property("message")
            .that.contains("left over")
            .and.contains("name taken, no container");
    });

    it("retries shortly when the lock disappears between the conflict and the lookup", async () => {
        const docker = new FakeDocker();
        docker.put("running");
        const inspect = docker.inspect.bind(docker);
        docker.inspect = async name => {
            docker.containers.delete(name);
            docker.inspect = inspect;
            return undefined;
        };
        const { options, slept } = optionsFor(docker);

        await acquireHarnessLock(options);

        expect(slept).deep.equal([100]);
        expect(ownedBySelf(docker)).equal(true);
    });

    it("passes on a Docker failure other than a name conflict", async () => {
        const docker = new FakeDocker();
        docker.start = async () => {
            throw new DockerError("No such image (404)", 404, "Not-Found");
        };

        expect(await rejectionOf(acquireHarnessLock(optionsFor(docker).options))).instanceOf(DockerError);
    });
});

describe("Constants.harnessWaitMs", () => {
    const original = process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES;
        } else {
            process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES = original;
        }
    });

    it("waits an hour by default, also for a blank value", () => {
        delete process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES;
        expect(Constants.harnessWaitMs()).equal(3_600_000);

        process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES = " ";
        expect(Constants.harnessWaitMs()).equal(3_600_000);
    });

    it("takes a number of minutes, 0 included", () => {
        process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES = "0";
        expect(Constants.harnessWaitMs()).equal(0);

        process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES = "1.5";
        expect(Constants.harnessWaitMs()).equal(90_000);
    });

    it("refuses a value that is no number of minutes", () => {
        process.env.MATTER_CHIP_HARNESS_WAIT_MINUTES = "60m";
        expect(() => Constants.harnessWaitMs()).throws("MATTER_CHIP_HARNESS_WAIT_MINUTES");
    });
});
