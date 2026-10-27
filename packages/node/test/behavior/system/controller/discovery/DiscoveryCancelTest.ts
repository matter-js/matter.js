/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import type { CommissioningDiscovery } from "#behavior/system/controller/discovery/CommissioningDiscovery.js";
import { ContinuousDiscovery } from "#behavior/system/controller/discovery/ContinuousDiscovery.js";
import { DiscoveryAggregateError } from "#behavior/system/controller/discovery/DiscoveryError.js";
import { InstanceDiscovery } from "#behavior/system/controller/discovery/InstanceDiscovery.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    Abort,
    AbortedError,
    causedBy,
    Crypto,
    ImplementationError,
    LogLevel,
    NetworkSimulator,
    Seconds,
    Time,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";
import { DeviceCommissioner, type Scanner, ScannerSet } from "@matter/protocol";
import {
    captureDiscoveryLog,
    configure,
    configureScanners,
    deferred,
    DEVICE,
    FailingScanner,
    FixedScanner,
    settle,
    TestAttempt,
    TestDiscovery,
    untilAborted,
} from "./discovery-helpers.js";

const MDNS_PORT = 5353;

/**
 * An attempt that does not notice the abort: its PASE completes after `paseTime` and it then asks to win.  Records
 * whether the race gate let it.
 */
function lateWinner(paseTime = Seconds(2)) {
    const record = {
        started: deferred<void>(),
        done: deferred<boolean>(),
    };
    const attempt: TestAttempt = async win => {
        record.started.resolve();
        await Abort.sleep("test PASE", undefined, paseTime);
        record.done.resolve(win());
    };
    return { attempt, started: record.started.promise, won: record.done.promise };
}

/** An attempt that wins PASE after one second, then runs `afterWin` and commissions for ten seconds. */
function winner(afterWin: () => void = () => {}): TestAttempt {
    return async win => {
        await Abort.sleep("test PASE", undefined, Seconds(1));
        expect(win()).equals(true);
        afterWin();
        await Abort.sleep("test commissioning", undefined, Seconds(10));
    };
}

function setEntropic(...nodes: ServerNode[]) {
    for (const node of nodes) {
        const crypto = node.env.get(Crypto);
        if ("entropic" in crypto) {
            crypto.entropic = true;
        }
    }
}

/** Counts the "abort" listeners added to and removed from a signal. */
function trackAbortListeners(signal: AbortSignal) {
    const counts = { added: 0, removed: 0 };
    signal.addEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
    ) => {
        if (type === "abort") {
            counts.added++;
        }
        EventTarget.prototype.addEventListener.call(signal, type, listener, options);
    };
    signal.removeEventListener = (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions,
    ) => {
        if (type === "abort") {
            counts.removed++;
        }
        EventTarget.prototype.removeEventListener.call(signal, type, listener, options);
    };
    return counts;
}

describe("Discovery interruption", () => {
    beforeEach(() => {
        MockTime.init();
    });

    describe("before the result", () => {
        it("refuses a PASE win after a cancel that came first, before the scan has ended", async () => {
            const node = await MockServerNode.createOnline();
            try {
                // The scan outlives the cancel, so the race must be closed by the cancel itself
                const scanner = await configure(node, [DEVICE], { ignoresStop: true });

                const { attempt, started, won } = lateWinner();
                const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, attempt);
                const outcome = settle(discovery);
                await MockTime.resolve(started, { macrotasks: true });

                const reason = new ImplementationError("Caller gave up");
                discovery.cancel(reason);

                expect(await MockTime.resolve(won, { macrotasks: true })).equals(false);
                scanner.fail(new ImplementationError("Scan ends"));
                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(reason);
            } finally {
                await node.close();
            }
        });

        it("refuses a PASE win after the discovery timeout, before the scan has ended", async () => {
            const node = await MockServerNode.createOnline();
            try {
                // The scan outlives the timeout, so the race must be closed by the timeout itself
                const scanner = await configure(node, [DEVICE], { ignoresStop: true });

                const { attempt, started, won } = lateWinner(Seconds(2));
                const discovery = new TestDiscovery(node, { timeout: Seconds(1) }, attempt);
                const outcome = settle(discovery);
                await MockTime.resolve(started, { macrotasks: true });

                expect(await MockTime.resolve(won, { macrotasks: true })).equals(false);
                scanner.fail(new ImplementationError("Scan ends"));
                expect(await MockTime.resolve(outcome, { macrotasks: true })).instanceOf(Error);
            } finally {
                await node.close();
            }
        });

        it("honours the caller's abort signal like a cancel", async () => {
            const node = await MockServerNode.createOnline();
            try {
                const scanner = await configure(node, [DEVICE], { ignoresStop: true });

                const abort = new AbortController();
                const { attempt, started, won } = lateWinner();
                const discovery = new TestDiscovery(node, { timeout: Seconds(30), abort: abort.signal }, attempt);
                const outcome = settle(discovery);
                await MockTime.resolve(started, { macrotasks: true });

                abort.abort();

                expect(await MockTime.resolve(won, { macrotasks: true })).equals(false);
                scanner.fail(new ImplementationError("Scan ends"));
                expect(await MockTime.resolve(outcome, { macrotasks: true })).instanceOf(AbortedError);
            } finally {
                await node.close();
            }
        });

        it("cancels at once with a caller abort signal that is already aborted", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const abort = new AbortController();
                const reason = new ImplementationError("Gave up before starting");
                abort.abort(reason);
                const discovery = new TestDiscovery(node, { timeout: Seconds(30), abort: abort.signal }, winner());

                expect(await MockTime.resolve(settle(discovery), { macrotasks: true })).equals(reason);
                expect(discovery.started).equals(0);
            } finally {
                await node.close();
            }
        });

        it("rejects with the cancel reason when the node fails to start after the cancel", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);
                await node.stop();

                const startCalled = deferred();
                const startDone = deferred();
                node.start = async () => {
                    startCalled.resolve();
                    await startDone.promise;
                    throw new ImplementationError("Node failed to start");
                };

                const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, winner());
                const outcome = settle(discovery);
                await MockTime.resolve(startCalled.promise, { macrotasks: true });

                const reason = new ImplementationError("Caller gave up");
                discovery.cancel(reason);
                startDone.resolve();

                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(reason);
                expect(discovery.started).equals(0);
            } finally {
                await node.close();
            }
        });

        it("does not start an attempt for a device that is handed over after the cancel", async () => {
            const node = await MockServerNode.createOnline();
            try {
                const reason = new ImplementationError("Caller gave up");
                const self: { discovery?: TestDiscovery } = {};
                await configure(node, [DEVICE], { afterReport: () => self.discovery?.cancel(reason) });

                const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, winner());
                self.discovery = discovery;

                expect(await MockTime.resolve(settle(discovery), { macrotasks: true })).equals(reason);
                await MockTime.resolve(Time.sleep("late hand-over", Seconds(1)), { macrotasks: true });
                expect(discovery.discovered).equals(1);
                expect(discovery.started).equals(0);
            } finally {
                await node.close();
            }
        });

        it("rejects with the cancel reason when an instance discovery is canceled before it finds a node", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, []);

                const discovery = new InstanceDiscovery(node, { timeout: Seconds(30) });
                const outcome = settle(discovery);
                await MockTime.resolve(Time.sleep("scanning", Seconds(1)), { macrotasks: true });

                const reason = new ImplementationError("Caller gave up");
                discovery.cancel(reason);

                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(reason);
            } finally {
                await node.close();
            }
        });

        it("rejects with the cancel reason when a continuous discovery is canceled", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const discovery = new ContinuousDiscovery(node, {});
                const outcome = settle(discovery);
                await MockTime.resolve(Time.sleep("scanning", Seconds(1)), { macrotasks: true });

                const reason = new ImplementationError("Caller gave up");
                discovery.cancel(reason);

                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(reason);
            } finally {
                await node.close();
            }
        });
    });

    describe("after the result", () => {
        it("resolves with the winner when the cancel comes right after the PASE win", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);
                using log = captureDiscoveryLog();

                const self: { discovery?: TestDiscovery } = {};
                const discovery = new TestDiscovery(
                    node,
                    { timeout: Seconds(30) },
                    winner(() => self.discovery?.cancel(new ImplementationError("Caller gave up"))),
                );
                self.discovery = discovery;

                const result = await MockTime.resolve(discovery, { macrotasks: true });
                expect(result.id).not.undefined;
                expect(
                    log.messages.some(
                        ({ level, text }) => level === LogLevel.INFO && text.includes("ignores the interruption"),
                    ),
                ).equals(true);
            } finally {
                await node.close();
            }
        });

        // Characterization: the cancel lands after the discovery reached onComplete, which already resolved with the
        // winner before the interruption hook existed.
        it("resolves with the winner when the cancel comes while the winner commissions", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const commissioning = deferred<void>();
                const discovery = new TestDiscovery(
                    node,
                    { timeout: Seconds(30) },
                    winner(() => commissioning.resolve()),
                );
                await MockTime.resolve(commissioning.promise, { macrotasks: true });
                await MockTime.resolve(Time.sleep("winner commissions", Seconds(1)), { macrotasks: true });

                discovery.cancel(new ImplementationError("Caller gave up"));

                const result = await MockTime.resolve(discovery, { macrotasks: true });
                expect(result.id).not.undefined;
            } finally {
                await node.close();
            }
        });

        it("resolves with the winner when every scanner fails after the PASE win", async () => {
            const node = await MockServerNode.createOnline();
            try {
                // The scan ignores the stop the win causes, so it can only end through the failure
                const scanner = await configure(node, [DEVICE], { ignoresStop: true });

                const discovery = new TestDiscovery(
                    node,
                    { timeout: Seconds(30) },
                    winner(() => scanner.fail(new ImplementationError("Scanner broke"))),
                );

                const result = await MockTime.resolve(discovery, { macrotasks: true });
                expect(result.id).not.undefined;
            } finally {
                await node.close();
            }
        });

        it("resolves with the node when an instance discovery is canceled after finding it", async () => {
            class CancelOnFind extends InstanceDiscovery {
                protected override onDiscovered(node: ClientNode) {
                    super.onDiscovered(node);
                    this.cancel(new ImplementationError("Caller gave up"));
                }
            }

            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const result = await MockTime.resolve(new CancelOnFind(node, { timeout: Seconds(30) }), {
                    macrotasks: true,
                });
                expect(result.id).not.undefined;
            } finally {
                await node.close();
            }
        });
    });

    describe("reason", () => {
        it("keeps the first cancel reason when canceled twice while attempts wind down", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const discovery = new TestDiscovery(node, { timeout: Seconds(5) }, async (_win, signal) => {
                    try {
                        await untilAborted(signal);
                    } finally {
                        await Abort.sleep("test cleanup", undefined, Seconds(10));
                    }
                });
                const outcome = settle(discovery);
                await MockTime.resolve(discovery.aborting, { macrotasks: true });

                const first = new ImplementationError("Caller gave up");
                discovery.cancel(first);
                discovery.cancel(new ImplementationError("Caller gave up again"));

                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(first);
            } finally {
                await node.close();
            }
        });

        it("keeps the cancel reason when every scanner fails after the cancel", async () => {
            const node = await MockServerNode.createOnline();
            try {
                const scanner = await configure(node, [DEVICE], { ignoresStop: true });

                const started = deferred<void>();
                const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, async (_win, signal) => {
                    started.resolve();
                    await untilAborted(signal);
                });
                const outcome = settle(discovery);
                await MockTime.resolve(started.promise, { macrotasks: true });

                const reason = new ImplementationError("Caller gave up");
                discovery.cancel(reason);
                scanner.fail(new ImplementationError("Scanner broke"));

                expect(await MockTime.resolve(outcome, { macrotasks: true })).equals(reason);
            } finally {
                await node.close();
            }
        });
    });

    describe("settling", () => {
        const interruptions: Record<
            string,
            (discovery: TestDiscovery, abort: AbortController, scanner: FailingScanner) => void
        > = {
            "a cancel": discovery => discovery.cancel(new ImplementationError("Caller gave up")),
            "a caller abort": (_discovery, abort) => abort.abort(new ImplementationError("Caller gave up")),
            "every scanner failing": (_discovery, _abort, scanner) =>
                scanner.fail(new ImplementationError("Scanner broke")),
        };

        for (const [name, interrupt] of Object.entries(interruptions)) {
            it(`settles only after the aborted attempts have finished when interrupted by ${name}`, async () => {
                const node = await MockServerNode.createOnline();
                try {
                    const scanner = await configure(node, [DEVICE]);

                    const abort = new AbortController();
                    const started = deferred<void>();
                    let finished = false;
                    const discovery = new TestDiscovery(
                        node,
                        { timeout: Seconds(30), abort: abort.signal },
                        async (_win, signal) => {
                            started.resolve();
                            try {
                                await untilAborted(signal);
                            } finally {
                                await Abort.sleep("test cleanup", undefined, Seconds(10));
                                finished = true;
                            }
                        },
                    );
                    const finishedAtSettle = discovery.then(
                        () => finished,
                        () => finished,
                    );
                    await MockTime.resolve(started.promise, { macrotasks: true });

                    interrupt(discovery, abort, scanner);

                    expect(await MockTime.resolve(finishedAtSettle, { macrotasks: true })).equals(true);
                } finally {
                    await node.close();
                }
            });
        }

        it("detaches from the caller's abort signal once the discovery resolves", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, [DEVICE]);

                const abort = new AbortController();
                const listeners = trackAbortListeners(abort.signal);
                const discovery = new TestDiscovery(node, { timeout: Seconds(30), abort: abort.signal }, winner());

                await MockTime.resolve(discovery, { macrotasks: true });
                expect(listeners.added).greaterThan(0);
                expect(listeners.removed).equals(listeners.added);
            } finally {
                await node.close();
            }
        });

        it("detaches from the caller's abort signal once the discovery rejects", async () => {
            const node = await MockServerNode.createOnline();
            try {
                await configure(node, []);

                const abort = new AbortController();
                const listeners = trackAbortListeners(abort.signal);
                const discovery = new InstanceDiscovery(node, { timeout: Seconds(5), abort: abort.signal });

                await MockTime.resolve(settle(discovery), { macrotasks: true });
                expect(listeners.added).greaterThan(0);
                expect(listeners.removed).equals(listeners.added);
            } finally {
                await node.close();
            }
        });
    });

    describe("scanner failure", () => {
        it("keeps discovering while another scanner still runs", async () => {
            const node = await MockServerNode.createOnline();
            try {
                const broken = new FailingScanner(new FixedScanner([]));
                await configureScanners(node, broken, new FixedScanner([DEVICE]));
                broken.fail(new ImplementationError("BLE did not start"));

                const discovery = new TestDiscovery(node, { timeout: Seconds(30) }, winner());

                const result = await MockTime.resolve(discovery, { macrotasks: true });
                expect(result.id).not.undefined;
            } finally {
                await node.close();
            }
        });

        it("logs a failed scanner and resolves a continuous discovery with what it found", async () => {
            const node = await MockServerNode.createOnline();
            try {
                const broken = new FailingScanner(new FixedScanner([]));
                await configureScanners(node, broken, new FixedScanner([]));
                broken.fail(new ImplementationError("BLE did not start"));
                using log = captureDiscoveryLog();

                const found = await MockTime.resolve(new ContinuousDiscovery(node, { timeout: Seconds(5) }), {
                    macrotasks: true,
                });

                expect(found).empty;
                expect(
                    log.messages.some(({ level, text }) => level === LogLevel.WARN && text.includes("scanner of")),
                ).equals(true);
            } finally {
                await node.close();
            }
        });

        const shapes: Record<string, (broken: FailingScanner) => Scanner[]> = {
            "one of two scanners failed and the other found nothing": broken => [broken, new FixedScanner([])],
            "every scanner failed": broken => [broken],
            "one scanner failed and the other ended at once without a result": broken => [
                broken,
                new FixedScanner([], { endsAtOnce: true }),
            ],
        };

        for (const [name, scanners] of Object.entries(shapes)) {
            it(`reports the scanner failure as DiscoveryAggregateError where ${name}`, async () => {
                const node = await MockServerNode.createOnline();
                try {
                    const broken = new FailingScanner(new FixedScanner([]));
                    await configureScanners(node, ...scanners(broken));
                    broken.fail(new ImplementationError("BLE did not start"));

                    const discovery = new InstanceDiscovery(node, { timeout: Seconds(5) });
                    const error = await MockTime.resolve(settle(discovery), { macrotasks: true });

                    expect(error).instanceOf(DiscoveryAggregateError);
                    expect(causedBy(error, ImplementationError)).equals(true);
                } finally {
                    await node.close();
                }
            });
        }
    });

    describe("with a real device", () => {
        it("does not commission a device whose PASE was in progress when the commissioning was canceled", async () => {
            await using site = new MockSite();
            const reason = new ImplementationError("Caller gave up");

            const error = await interruptMidPase(site, ({ commissioning }) => commissioning.cancel(reason));

            expect(error).equals(reason);
        });

        it("does not commission a device whose PASE was in progress when the caller aborted", async () => {
            await using site = new MockSite();
            const reason = new ImplementationError("Caller gave up");

            const error = await interruptMidPase(site, ({ abort }) => abort.abort(reason));

            expect(error).equals(reason);
        });

        it("does not commission a device whose PASE was in progress when every scanner failed", async () => {
            await using site = new MockSite();
            const failure = new ImplementationError("Scanner broke");

            const error = await interruptMidPase(site, ({ scanners }) => {
                for (const scanner of scanners) {
                    scanner.fail(failure);
                }
            });

            expect(error).instanceOf(DiscoveryAggregateError);
            expect(causedBy(error, ImplementationError)).equals(true);
        });
    });
});

interface MidPaseInterruption {
    commissioning: CommissioningDiscovery;
    abort: AbortController;
    scanners: FailingScanner[];
}

/**
 * Commissions a real device and interrupts the commissioning while its PASE is in progress.  Returns the
 * commissioning's error after checking that the device was not commissioned.
 */
async function interruptMidPase(site: MockSite, interrupt: (context: MidPaseInterruption) => void) {
    const simulator = new NetworkSimulator();
    const controller = await site.addController({ simulator });
    const device = await site.addDevice({ simulator });
    setEntropic(controller, device);
    await controller.start();

    controller.behaviors.require(ControllerBehavior);
    await controller.act(agent => agent.load(ControllerBehavior));
    const set = controller.env.get(ScannerSet);
    const scanners = [...set].map(scanner => new FailingScanner(scanner));
    expect(scanners).not.empty;
    set.clear();
    for (const scanner of scanners) {
        set.add(scanner);
    }

    // Hold the device's answers once the controller opens PASE, so the attempt stays mid-PASE until released
    let deviceAddress: string | undefined;
    const held = new Array<() => void>();
    let holding = true;
    const midPase = deferred<void>();
    simulator.router.intercept((packet, route) => {
        const unicast = packet.kind === "udp" && packet.sourcePort !== MDNS_PORT && packet.destPort !== MDNS_PORT;
        if (unicast && deviceAddress === undefined) {
            deviceAddress = packet.destAddress;
        }
        if (holding && unicast && packet.sourceAddress === deviceAddress) {
            held.push(() => route(packet));
            midPase.resolve();
            return;
        }
        route(packet);
    });

    const abort = new AbortController();
    const { passcode, discriminator } = device.state.commissioning;
    const commissioning = controller.peers.commission({
        passcode,
        discriminator,
        timeout: Seconds(90),
        abort: abort.signal,
    });
    const outcome = settle(commissioning);
    await MockTime.resolve(midPase.promise, { macrotasks: true });

    interrupt({ commissioning, abort, scanners });

    holding = false;
    for (const release of held.splice(0)) {
        release();
    }

    const error = await MockTime.resolve(outcome, { macrotasks: true });
    await MockTime.resolve(Time.sleep("let the attempt settle", Seconds(60)), { macrotasks: true });

    expect(device.env.get(DeviceCommissioner).isFailsafeArmed).equals(false);
    expect(device.state.commissioning.commissioned).equals(false);
    expect(controller.peers.commissioned).empty;

    return error;
}
