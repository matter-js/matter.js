/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    AbortedError,
    Bytes,
    ChannelType,
    causedBy,
    Crypto,
    Duration,
    ImplementationError,
    Millis,
    NetworkSimulator,
    NoResponseTimeoutError,
    Seconds,
    ServerAddress,
    Time,
    TransportSet,
} from "@matter/general";
import { MockSite } from "@matter/node/testing";
import {
    ClientInteraction,
    CommissioningTransitionError,
    ControllerCommissioningFlow,
    DeviceCommissioner,
    PaseClient,
    PeerCommunicationError,
    SessionManager,
} from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";

async function within<T>(operation: Promise<T>, duration: Duration) {
    let timer: ReturnType<typeof Time.getTimer> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = Time.getTimer("Commissioning test deadline", duration, () =>
            reject(new ImplementationError(`Operation did not settle within ${Duration.format(duration)}`)),
        ).start();
    });
    try {
        return await MockTime.resolve(Promise.race([operation, deadline]), { macrotasks: true });
    } finally {
        timer?.stop();
    }
}

describe("Full-flow commissioning cancellation", () => {
    beforeEach(() => {
        MockTime.init();
    });

    it("cancels discovery before any candidate is available", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        const abort = new AbortController();
        abort.abort(new AbortedError("Canceled before discovery"));
        const discovery = controller.peers.commission({
            passcode: 20202021,
            ...{ commissioningAbort: abort.signal },
        });
        const outcome = await MockTime.resolve(
            discovery.then(
                () => undefined,
                error => error,
            ),
            { macrotasks: true },
        );
        expect(causedBy(outcome, AbortedError)).true;
        await discovery.settled;
    });

    for (const fullFlow of [false, true]) {
        it(`${fullFlow ? "honors full-flow" : "ignores legacy"} cancellation after located-node PASE`, async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            Object.assign(controller.env.get(Crypto), { entropic: true });
            Object.assign(device.env.get(Crypto), { entropic: true });
            const abort = new AbortController();
            const { passcode, discriminator } = device.state.commissioning;
            const [peer] = await MockTime.resolve(
                controller.peers.discover({ longDiscriminator: discriminator, timeout: Seconds(2) }),
                { macrotasks: true },
            );
            const options = fullFlow ? { commissioningAbort: abort.signal } : { abort: abort.signal };
            const outcome = await MockTime.resolve(
                peer
                    .commission({
                        passcode,
                        ...options,
                        autoSubscribe: false,
                        continueCommissioningAfterPase: () => {
                            abort.abort(new AbortedError("Canceled after located-node PASE"));
                            return true;
                        },
                    })
                    .then(
                        () => undefined,
                        error => error,
                    ),
                { macrotasks: true },
            );
            expect(causedBy(outcome, AbortedError)).equals(fullFlow);
            expect(device.state.commissioning.commissioned).equals(!fullFlow);
            expect(device.env.get(DeviceCommissioner).isFailsafeArmed).false;
            expect(controller.env.get(SessionManager).getPaseSession()).undefined;
        });
    }

    it("reports caller cancellation after an earlier PASE address timeout", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        await MockTime.resolve(controller.start(), { macrotasks: true });
        const peer = await controller.peers.forDescriptor({
            addresses: [
                { type: "udp", ip: "::1", port: 5540 },
                { type: "udp", ip: "::1", port: 5541 },
            ],
        });
        const abort = new AbortController();
        const reason = new AbortedError("Canceled fallback PASE address");
        const pair = PaseClient.prototype.pair;
        let attempts = 0;
        PaseClient.prototype.pair = async (...args) => {
            if (++attempts === 1) {
                throw new NoResponseTimeoutError("First PASE address timed out");
            }
            abort.abort(reason);
            await Abort.sleep("Wait for PASE cancellation", args[4]?.abort, Seconds(90));
            throw new ImplementationError("PASE cancellation was ignored");
        };
        try {
            const outcome = await MockTime.resolve(
                peer.commission({ passcode: 20202021, ...{ commissioningAbort: abort.signal } }).then(
                    () => undefined,
                    error => error,
                ),
                { macrotasks: true },
            );
            expect(attempts).equals(2);
            expect(causedBy(outcome, AbortedError)).true;
            expect(controller.env.get(SessionManager).getPaseSession()).undefined;
        } finally {
            PaseClient.prototype.pair = pair;
        }
    });

    it("rejects cancellation promptly and closes a late BLE channel afterwards", async () => {
        await using site = new MockSite();
        const controller = await site.addController();
        await MockTime.resolve(controller.start(), { macrotasks: true });
        const abort = new AbortController();
        let opened!: () => void;
        const openStarted = new Promise<void>(resolve => (opened = resolve));
        let releaseOpen!: () => void;
        const openGate = new Promise<void>(resolve => (releaseOpen = resolve));
        let closing!: () => void;
        const closeStarted = new Promise<void>(resolve => (closing = resolve));
        let releaseClose!: () => void;
        const closeGate = new Promise<void>(resolve => (releaseClose = resolve));
        let closeFinished!: () => void;
        const closeCompleted = new Promise<void>(resolve => (closeFinished = resolve));
        let closed = false;
        controller.env.get(TransportSet).add({
            onData: () => ({ close: async () => {} }),
            close: async () => {},
            supports: (type: ChannelType) => type === ChannelType.BLE,
            openChannel: async () => {
                opened();
                await openGate;
                return {
                    type: ChannelType.BLE,
                    name: "Delayed BLE channel",
                    maxPayloadSize: 1024,
                    isReliable: true,
                    supportsLargeMessages: false,
                    send: async () => {},
                    close: async () => {
                        closing();
                        await closeGate;
                        closed = true;
                        closeFinished();
                    },
                };
            },
        });
        const peer = await controller.peers.forDescriptor({
            addresses: [{ type: "ble", peripheralAddress: "delayed-peripheral" }],
        });
        let finished = false;
        const commissioning = peer.commission({ passcode: 20202021, ...{ commissioningAbort: abort.signal } }).then(
            () => {
                finished = true;
                return undefined;
            },
            error => {
                finished = true;
                return error;
            },
        );
        try {
            await MockTime.resolve(openStarted, { macrotasks: true });
            abort.abort(new AbortedError("Canceled pending BLE channel"));
            const outcome = await within(commissioning, Seconds(2));
            expect(finished).true;
            expect(causedBy(outcome, AbortedError)).true;
            expect(closed).false;
            releaseOpen();
            await within(closeStarted, Seconds(2));
            expect(closed).false;
            releaseClose();
            await within(closeCompleted, Seconds(2));
            expect(closed).true;
        } finally {
            releaseOpen();
            releaseClose();
            await within(commissioning, Seconds(120));
        }
    });

    for (const fullFlowSignal of [false, true]) {
        it(`honors the PASE timeout with a stalled BLE open ${fullFlowSignal ? "with" : "without"} a full-flow signal`, async () => {
            await using site = new MockSite();
            const controller = await site.addController();
            await MockTime.resolve(controller.start(), { macrotasks: true });
            let rejectOpen!: (reason: Error) => void;
            const opening = new Promise<never>((_resolve, reject) => (rejectOpen = reject));
            let entered = false;
            controller.env.get(TransportSet).add({
                onData: () => ({ close: async () => {} }),
                close: async () => {},
                supports: (type: ChannelType) => type === ChannelType.BLE,
                openChannel: () => {
                    entered = true;
                    return opening;
                },
            });
            const peer = await controller.peers.forDescriptor({
                addresses: [{ type: "ble", peripheralAddress: "stalled-peripheral" }],
            });
            const options = fullFlowSignal ? { commissioningAbort: new AbortController().signal } : {};
            const started = Time.nowMs;
            const commissioning = peer.commission({ passcode: 20202021, timeout: Seconds(5), ...options }).then(
                () => undefined,
                error => error,
            );
            try {
                const outcome = await within(commissioning, Seconds(120));
                expect(entered).true;
                expect(causedBy(outcome, PeerCommunicationError)).true;
                expect(Time.nowMs - started).lessThan(Seconds(10));
            } finally {
                rejectOpen(new AbortedError("Releasing stalled open after the timeout probe"));
                await within(commissioning, Seconds(2));
            }
        });
    }

    it("waits for pending address attempts after canceling the winning flow", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        Object.assign(controller.env.get(Crypto), { entropic: true });
        Object.assign(device.env.get(Crypto), { entropic: true });
        const [found] = await MockTime.resolve(controller.peers.discover({ timeout: Seconds(2) }), {
            macrotasks: true,
        });
        const address = found.state.commissioning.addresses?.map(ServerAddress).find(ServerAddress.isIp);
        if (address === undefined) {
            throw new ImplementationError("Simulated device has no IP address");
        }
        const peer = await controller.peers.forDescriptor({
            addresses: [{ ...address, port: address.port + 1 }, address],
        });
        const abort = new AbortController();
        const reason = new AbortedError("Canceled winning flow while another address is pending");
        let releaseLoser!: () => void;
        const loserGate = new Promise<void>(resolve => (releaseLoser = resolve));
        let loserFinished = false;
        let attempts = 0;
        const pair = PaseClient.prototype.pair;
        PaseClient.prototype.pair = async function (...args) {
            if (++attempts === 1) {
                await loserGate;
                loserFinished = true;
                throw reason;
            }
            return pair.apply(this, args);
        };
        let releaseTimer: ReturnType<typeof Time.getTimer> | undefined;
        class CanceledFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                abort.abort(reason);
                releaseTimer = Time.getTimer("Finish canceled address attempt", Millis(500), releaseLoser).start();
                await super.executeCommissioning();
            }
        }
        try {
            const outcome = await MockTime.resolve(
                peer
                    .commission({
                        passcode: device.state.commissioning.passcode,
                        ...{ commissioningAbort: abort.signal },
                        commissioningFlowImpl: CanceledFlow,
                        autoSubscribe: false,
                    })
                    .then(
                        () => undefined,
                        error => error,
                    ),
                { macrotasks: true },
            );
            expect(attempts).equals(2);
            expect(causedBy(outcome, AbortedError)).true;
            expect(loserFinished).true;
            expect(controller.env.get(SessionManager).getPaseSession()).undefined;
        } finally {
            releaseLoser();
            releaseTimer?.stop();
            PaseClient.prototype.pair = pair;
        }
    });

    for (const phase of ["before the first step", "during a PASE read", "between steps", "during CASE reconnect"]) {
        it(`propagates the caller abort ${phase} and drains the PASE session`, async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            Object.assign(controller.env.get(Crypto), { entropic: true });
            Object.assign(device.env.get(Crypto), { entropic: true });
            const abort = new AbortController();
            const reason = new AbortedError("Caller canceled commissioning");
            let entered = false;

            class CanceledFlow extends ControllerCommissioningFlow {
                constructor(
                    ...[interaction, ca, fabric, options, transition]: ConstructorParameters<
                        typeof ControllerCommissioningFlow
                    >
                ) {
                    if (phase === "during a PASE read") {
                        interaction = new Proxy(interaction, {
                            get(target, property) {
                                if (property === "read") {
                                    return async function* (...args: Parameters<ClientInteraction["read"]>) {
                                        entered = true;
                                        queueMicrotask(() => abort.abort(reason));
                                        yield* target.read(...args);
                                    };
                                }
                                const value = Reflect.get(target, property, target);
                                return typeof value === "function" ? value.bind(target) : value;
                            },
                        });
                    }
                    super(interaction, ca, fabric, options, async (...args) => {
                        const connecting = transition(...args);
                        if (phase === "during CASE reconnect") {
                            entered = true;
                            queueMicrotask(() => abort.abort(reason));
                        }
                        return connecting;
                    });
                    if (phase === "between steps") {
                        const first = this.commissioningSteps[0];
                        const stepLogic = first.stepLogic;
                        first.stepLogic = async () => {
                            const result = await stepLogic();
                            entered = true;
                            abort.abort(reason);
                            return result;
                        };
                    }
                }

                override async executeCommissioning() {
                    if (phase === "before the first step") {
                        entered = true;
                        abort.abort(reason);
                    }
                    await super.executeCommissioning();
                }
            }

            const { passcode, discriminator } = device.state.commissioning;
            const outcome = await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        ...{ commissioningAbort: abort.signal },
                        commissioningFlowImpl: CanceledFlow,
                        autoSubscribe: false,
                        timeout: Seconds(90),
                    })
                    .then(
                        () => undefined,
                        error => error,
                    ),
                { macrotasks: true },
            );

            expect(entered).true;
            expect(causedBy(outcome, AbortedError)).true;
            expect(controller.env.get(SessionManager).getPaseSession()).undefined;
            expect(device.state.commissioning.commissioned).false;
        });
    }

    it("does not interrupt the PASE winner through legacy cancellation", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        Object.assign(controller.env.get(Crypto), { entropic: true });
        Object.assign(device.env.get(Crypto), { entropic: true });
        const reason = new AbortedError("Discovery caller canceled commissioning");
        const abort = new AbortController();
        let cancel: () => void;

        class CanceledFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                cancel();
                abort.abort(reason);
                await super.executeCommissioning();
            }
        }

        const { passcode, discriminator } = device.state.commissioning;
        const discovery = controller.peers.commission({
            passcode,
            discriminator,
            abort: abort.signal,
            commissioningFlowImpl: CanceledFlow,
            autoSubscribe: false,
            timeout: Seconds(90),
        });
        cancel = () => discovery.cancel(reason);
        const settled = discovery.settled;
        const outcome = await MockTime.resolve(
            discovery.then(
                () => undefined,
                error => error,
            ),
            { macrotasks: true },
        );
        expect(outcome).undefined;
        await settled;
        expect(controller.env.get(SessionManager).getPaseSession()).undefined;
        expect(device.state.commissioning.commissioned).true;
    });

    it("keeps an acknowledged CommissioningComplete when the caller aborts afterwards", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        Object.assign(controller.env.get(Crypto), { entropic: true });
        Object.assign(device.env.get(Crypto), { entropic: true });
        const abort = new AbortController();

        class CompletedFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                await super.executeCommissioning();
                abort.abort(new AbortedError("Caller canceled after completion"));
            }
        }

        const { passcode, discriminator } = device.state.commissioning;
        const peer = await MockTime.resolve(
            controller.peers.commission({
                passcode,
                discriminator,
                ...{ commissioningAbort: abort.signal },
                commissioningFlowImpl: CompletedFlow,
                autoSubscribe: false,
                timeout: Seconds(90),
            }),
            { macrotasks: true },
        );

        expect(peer.lifecycle.isCommissioned).true;
        expect(device.state.commissioning.commissioned).true;
        expect(controller.env.get(SessionManager).getPaseSession()).undefined;
    });

    it("keeps the commissioned peer when cancellation races with the completion response", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        Object.assign(controller.env.get(Crypto), { entropic: true });
        Object.assign(device.env.get(Crypto), { entropic: true });
        const abort = new AbortController();
        device.lifecycle.commissioned.on(() => abort.abort(new AbortedError("Canceled during completion")));
        const { passcode, discriminator } = device.state.commissioning;
        let flow: ControllerCommissioningFlow | undefined;

        class ObservedFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                flow = this;
                await super.executeCommissioning();
            }
        }

        const peer = await MockTime.resolve(
            controller.peers.commission({
                passcode,
                discriminator,
                ...{ commissioningAbort: abort.signal },
                commissioningFlowImpl: ObservedFlow,
                autoSubscribe: false,
                timeout: Seconds(90),
            }),
            { macrotasks: true },
        );

        expect(abort.signal.aborted).true;
        expect(device.state.commissioning.commissioned).true;
        expect(peer.lifecycle.isCommissioned).true;
        expect(controller.peers.has(peer)).true;
        // UpdateFabricLabel runs after CommissioningComplete and must not see the caller's cancellation
        expect(flow?.getCommissioningStepResult(98, 1)?.code).equals(0);
    });

    it("stops between steps even when the next step sends no request", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        Object.assign(controller.env.get(Crypto), { entropic: true });
        Object.assign(device.env.get(Crypto), { entropic: true });
        const abort = new AbortController();
        let advanced = false;

        class StepFenceFlow extends ControllerCommissioningFlow {
            override async executeCommissioning() {
                this.commissioningSteps.splice(
                    0,
                    this.commissioningSteps.length,
                    {
                        stepNumber: 1,
                        subStepNumber: 1,
                        name: "Cancel",
                        stepLogic: async () => {
                            abort.abort(new AbortedError("Canceled between steps"));
                            return { code: 0, breadcrumb: 1 };
                        },
                    },
                    {
                        stepNumber: 2,
                        subStepNumber: 1,
                        name: "Local action",
                        stepLogic: async () => {
                            advanced = true;
                            return { code: 0, breadcrumb: 2 };
                        },
                    },
                );
                await super.executeCommissioning();
                throw new ImplementationError("Flow advanced past cancellation");
            }
        }

        const { passcode, discriminator } = device.state.commissioning;
        const outcome = await MockTime.resolve(
            controller.peers
                .commission({
                    passcode,
                    discriminator,
                    ...{ commissioningAbort: abort.signal },
                    commissioningFlowImpl: StepFenceFlow,
                })
                .then(
                    () => undefined,
                    error => error,
                ),
            { macrotasks: true },
        );
        expect(advanced).false;
        expect(causedBy(outcome, AbortedError)).true;
    });

    for (const kind of ["read", "command", "regulatory command"]) {
        it(
            kind === "read"
                ? "abandons a held PASE read response before the request timeout"
                : kind === "command"
                  ? "abandons a held ArmFailSafe response before the command timeout"
                  : "abandons a held SetRegulatoryConfig response before the command timeout",
            async () => {
                await using site = new MockSite();
                const simulator = new NetworkSimulator();
                const controller = await site.addController({ simulator });
                const device = await site.addDevice({ simulator });
                Object.assign(controller.env.get(Crypto), { entropic: true });
                Object.assign(device.env.get(Crypto), { entropic: true });
                const abort = new AbortController();
                const held = new Array<() => void>();
                const heldPayloads = new Array<Bytes>();
                let deviceAddress: string | undefined;
                let holding = false;
                let commandStarted = false;
                let started = Time.nowMs;
                let cancelTimer: ReturnType<typeof Time.getTimer> | undefined;
                abort.signal.addEventListener("abort", () => (holding = false), { once: true });

                class HeldReadFlow extends ControllerCommissioningFlow {
                    constructor(...[interaction, ...rest]: ConstructorParameters<typeof ControllerCommissioningFlow>) {
                        super(
                            kind !== "read"
                                ? new Proxy(interaction, {
                                      get(target, property) {
                                          if (property === "invoke") {
                                              return async function* (
                                                  ...args: Parameters<ClientInteraction["invoke"]>
                                              ) {
                                                  if (
                                                      !commandStarted &&
                                                      args[0].invokeRequests.some(
                                                          ({ commandPath }) =>
                                                              commandPath.clusterId === GeneralCommissioning.id &&
                                                              commandPath.commandId ===
                                                                  (kind === "command"
                                                                      ? GeneralCommissioning.commands.armFailSafe.id
                                                                      : GeneralCommissioning.commands
                                                                            .setRegulatoryConfig.id),
                                                      )
                                                  ) {
                                                      commandStarted = true;
                                                      holding = true;
                                                  }
                                                  yield* target.invoke(...args);
                                              };
                                          }
                                          const value = Reflect.get(target, property, target);
                                          return typeof value === "function" ? value.bind(target) : value;
                                      },
                                  })
                                : interaction,
                            ...rest,
                        );
                    }

                    override async executeCommissioning() {
                        if (kind === "regulatory command") {
                            const step = this.commissioningSteps.find(
                                step => step.name === "GeneralCommissioning.ConfigureRegulatoryInformation",
                            );
                            if (step === undefined) {
                                throw new ImplementationError("Regulatory commissioning step is missing");
                            }
                            const logic = step.stepLogic;
                            step.stepLogic = async () => {
                                this.collectedCommissioningData.networkFeatures = [
                                    {
                                        endpointId: EndpointNumber(0),
                                        value: {
                                            wiFiNetworkInterface: true,
                                            threadNetworkInterface: false,
                                            ethernetNetworkInterface: false,
                                        },
                                    },
                                ];
                                return logic();
                            };
                        }
                        holding = kind === "read";
                        await super.executeCommissioning();
                    }
                }

                simulator.router.intercept((packet, route) => {
                    const unicast = packet.kind === "udp" && packet.sourcePort !== 5353 && packet.destPort !== 5353;
                    if (unicast && deviceAddress === undefined) {
                        deviceAddress = packet.destAddress;
                    }
                    if (
                        unicast &&
                        packet.sourceAddress === deviceAddress &&
                        (holding || heldPayloads.some(payload => Bytes.areEqual(payload, packet.payload)))
                    ) {
                        held.push(() => route(packet));
                        heldPayloads.push(packet.payload);
                        if (cancelTimer === undefined) {
                            started = Time.nowMs;
                            cancelTimer = Time.getTimer("Cancel held commissioning read", Millis(100), () =>
                                abort.abort(new AbortedError("Canceled held read")),
                            ).start();
                        }
                        return;
                    }
                    route(packet);
                });

                try {
                    const { passcode, discriminator } = device.state.commissioning;
                    const outcome = await MockTime.resolve(
                        controller.peers
                            .commission({
                                passcode,
                                discriminator,
                                ...{ commissioningAbort: abort.signal },
                                commissioningFlowImpl: HeldReadFlow,
                                autoSubscribe: false,
                            })
                            .then(
                                () => undefined,
                                error => error,
                            ),
                        { macrotasks: true },
                    );
                    expect(held).not.empty;
                    if (kind !== "read") {
                        expect(commandStarted).true;
                    }
                    expect(Time.nowMs - started).lessThan(Seconds(2));
                    expect(causedBy(outcome, AbortedError)).true;
                    expect(controller.env.get(SessionManager).getPaseSession()).undefined;
                } finally {
                    holding = false;
                    cancelTimer?.stop();
                    for (const release of held) {
                        release();
                    }
                }
            },
        );
    }

    it("abandons unreachable CASE before the connection timeout", async () => {
        await using site = new MockSite();
        const simulator = new NetworkSimulator();
        const controller = await site.addController({ simulator });
        const device = await site.addDevice({ simulator });
        Object.assign(controller.env.get(Crypto), { entropic: true });
        Object.assign(device.env.get(Crypto), { entropic: true });
        const abort = new AbortController();
        let blocking = false;
        let started = Time.nowMs;
        let cancelTimer: ReturnType<typeof Time.getTimer> | undefined;

        class UnreachableCaseFlow extends ControllerCommissioningFlow {
            constructor(
                ...[interaction, ca, fabric, options, transition]: ConstructorParameters<
                    typeof ControllerCommissioningFlow
                >
            ) {
                super(interaction, ca, fabric, options, async address => {
                    await interaction.session?.initiateForceClose({
                        cause: new CommissioningTransitionError("PASE ended before operational reconnect"),
                    });
                    blocking = true;
                    return transition(address, false);
                });
            }
        }

        simulator.router.intercept((packet, route) => {
            const unicast = packet.kind === "udp" && packet.sourcePort !== 5353 && packet.destPort !== 5353;
            if (blocking && unicast) {
                if (cancelTimer === undefined) {
                    started = Time.nowMs;
                    cancelTimer = Time.getTimer("Cancel unreachable CASE", Millis(100), () =>
                        abort.abort(new AbortedError("Canceled unreachable CASE")),
                    ).start();
                }
                return;
            }
            route(packet);
        });

        try {
            const { passcode, discriminator } = device.state.commissioning;
            const outcome = await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        ...{ commissioningAbort: abort.signal },
                        commissioningFlowImpl: UnreachableCaseFlow,
                        autoSubscribe: false,
                    })
                    .then(
                        () => undefined,
                        error => error,
                    ),
                { macrotasks: true },
            );
            expect(cancelTimer).not.undefined;
            expect(Time.nowMs - started).lessThan(Seconds(2));
            expect(causedBy(outcome, AbortedError)).true;
            expect(controller.env.get(SessionManager).getPaseSession()).undefined;
        } finally {
            blocking = false;
            cancelTimer?.stop();
        }
    });
});
