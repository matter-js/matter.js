/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationServer } from "#behaviors/basic-information";
import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffServer } from "#behaviors/on-off";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointBehaviorsError } from "#endpoint/errors.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import {
    DestroyedDependencyError,
    ImplementationError,
    Lifecycle,
    LogDestination,
    Logger,
    LogFormat,
    LogLevel,
    MatterAggregateError,
    Seconds,
} from "@matter/general";
import { MockServerNode, MockSite } from "@matter/node/testing";

const VersionedBridgedLightDevice = OnOffLightDevice.with(BridgedDeviceBasicInformationServer);

function rootVersion(node: MockServerNode) {
    return node.stateOf(BasicInformationServer).configurationVersion;
}

function bridgedVersion(endpoint: Endpoint) {
    return endpoint.stateOf(BridgedDeviceBasicInformationServer).configurationVersion;
}

function partsListOf(endpoint: Endpoint) {
    return [...endpoint.stateOf(DescriptorServer).partsList];
}

async function captureErrors<T>(actor: () => Promise<T>) {
    const errors = new Array<string>();
    Logger.destinations.capture = LogDestination({
        format: LogFormat.formats.plain,
        write(text, message) {
            if (message.level >= LogLevel.ERROR) {
                errors.push(text);
            }
        },
    });
    try {
        return { result: await actor(), errors };
    } finally {
        delete Logger.destinations.capture;
    }
}

function isTerminal(phase: string) {
    return phase === "deleting" || phase === "closing";
}

function captureLifecycleWarnings() {
    const warnings = new Array<string>();
    Logger.destinations.capture = LogDestination({
        format: LogFormat.formats.plain,
        write(text, message) {
            if (message.level === LogLevel.WARN && message.facility === "LifecycleMutex") {
                warnings.push(text);
            }
        },
    });
    return {
        warnings,
        [Symbol.dispose]() {
            delete Logger.destinations.capture;
        },
    };
}

/**
 * Block the reset of {@link endpoint} until {@link release} is called.
 */
function blockReset(endpoint: Endpoint) {
    let release!: () => void;
    const released = new Promise<void>(resolve => (release = resolve));
    let enter!: () => void;
    const entered = new Promise<void>(resolve => (enter = resolve));
    endpoint.lifecycle.reset.on(() => {
        enter();
        return released;
    });
    return { entered, release };
}

function messagesOf(error: unknown): string[] {
    if (!(error instanceof Error)) {
        return [String(error)];
    }
    const nested = error instanceof AggregateError ? error.errors : [];
    return [error.message, ...[...nested, error.cause].filter(e => e !== undefined).flatMap(messagesOf)];
}

class UnpreparedEndpoint extends Endpoint {
    protected override prepareErase(): Promise<EndpointInitializer.Erasure> {
        throw new ImplementationError("Preparation refused for test");
    }

    protected override prepareDelete(): Promise<EndpointInitializer.Erasure> {
        throw new ImplementationError("Preparation refused for test");
    }
}

class CountingEndpoint extends Endpoint {
    closes = 0;

    protected override async closeWithMutex() {
        this.closes++;
        await super.closeWithMutex();
    }
}

class FailingOnOffServer extends OnOffServer {
    override initialize() {
        throw new ImplementationError("Initialization refused for test");
    }
}

async function nodeWithNestedLight() {
    const node = await MockServerNode.createOnline(undefined, { device: undefined });
    const light = new Endpoint(OnOffLightDevice, { id: "light" });
    const parent = new Endpoint(OnOffLightDevice, { id: "parent", parts: [light] });
    await node.add(parent);
    return { node, parent, light };
}

describe("Endpoint.erase", () => {
    it("keeps id, number and PartsList membership and restores defaults and options", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light", onOff: { onTime: 7 } });
        const number = light.number;
        await light.set({ onOff: { onOff: true, onTime: 9 } });

        const partsLists = new Array<number[]>();
        node.lifecycle.changed.on(() => {
            partsLists.push(partsListOf(node));
        });

        await light.erase();

        expect(light.id).equals("light");
        expect(light.number).equals(number);
        expect(light.lifecycle.isReady).equals(true);
        expect(light.state.onOff.onOff).equals(false);
        expect(light.state.onOff.onTime).equals(7);
        expect(partsListOf(node)).contains(number);
        expect(partsLists.length).greaterThan(0);
        for (const partsList of partsLists) {
            expect(partsList).contains(number);
        }
    });

    it("serves the endpoint again", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        await light.erase();

        expect([...node.protocol].map(endpoint => endpoint.id)).contains(light.number);
    });

    it("keeps the stored number across a node restart", async () => {
        await using site = new MockSite();
        const id = "eraseKeepsNumber";

        const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        await node.add(new Endpoint(OnOffLightDevice, { id: "first" }));
        const light = await node.add(new Endpoint(OnOffLightDevice, { id: "light" }));
        const number = light.number;
        await light.erase();
        await node.close();

        const restarted = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
        const reAdded = await restarted.add(new Endpoint(OnOffLightDevice, { id: "light" }));
        const added = await restarted.add(new Endpoint(OnOffLightDevice, { id: "added" }));

        expect(reAdded.number).equals(number);
        expect(added.number).not.equals(number);
    });

    it("increases the bridged and the root ConfigurationVersion", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        const bridged = await aggregator.add(VersionedBridgedLightDevice, {
            id: "bridged",
            bridgedDeviceBasicInformation: { configurationVersion: 5 },
        });
        const before = rootVersion(node);

        await bridged.erase();

        expect(bridgedVersion(bridged)).equals(6);
        expect(rootVersion(node)).equals(before + 1);
    });

    it("increases the ConfigurationVersion of the bridged endpoint above", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        const bridged = await aggregator.add(VersionedBridgedLightDevice, {
            id: "bridged",
            bridgedDeviceBasicInformation: { configurationVersion: 5 },
            parts: [{ type: OnOffLightDevice, id: "child" }],
        });
        const before = rootVersion(node);

        await bridged.parts.require("child").erase();

        expect(bridgedVersion(bridged)).equals(6);
        expect(rootVersion(node)).equals(before + 1);
    });

    it("increases only the root ConfigurationVersion of a plain endpoint", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const before = rootVersion(node);

        await light.erase();

        expect(rootVersion(node)).equals(before + 1);
    });

    it("increases the ConfigurationVersion of every bridged endpoint below", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        const first = await aggregator.add(VersionedBridgedLightDevice, {
            id: "first",
            bridgedDeviceBasicInformation: { configurationVersion: 1 },
        });
        const second = await aggregator.add(VersionedBridgedLightDevice, {
            id: "second",
            bridgedDeviceBasicInformation: { configurationVersion: 1 },
        });
        await first.set({ bridgedDeviceBasicInformation: { configurationVersion: 9 } });
        await second.set({ bridgedDeviceBasicInformation: { configurationVersion: 3 } });
        const before = rootVersion(node);

        await aggregator.erase();

        expect(bridgedVersion(first)).equals(10);
        expect(bridgedVersion(second)).equals(4);
        expect(rootVersion(node)).equals(before + 1);
    });

    it("increases the stored ConfigurationVersion of a crashed bridged endpoint below", async () => {
        await using site = new MockSite();
        const id = "eraseCrashedBridged";
        const options = { id: "bridged", bridgedDeviceBasicInformation: { configurationVersion: 5 } };

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const aggregator = await node.add(new Endpoint(AggregatorEndpoint, { id: "aggregator" }));
            const bridged = await aggregator.add(VersionedBridgedLightDevice, options);
            await bridged.set({ bridgedDeviceBasicInformation: { configurationVersion: 9 } });
            await node.close();
        }

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const crashed = new Endpoint(VersionedBridgedLightDevice.with(FailingOnOffServer), {
                ...options,
                isEssential: false,
            });
            const aggregator = await node.add(new Endpoint(AggregatorEndpoint, { id: "aggregator" }));
            await expect(aggregator.add(crashed)).rejectedWith(EndpointBehaviorsError);

            await aggregator.erase();
            await node.close();
        }

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const aggregator = await node.add(new Endpoint(AggregatorEndpoint, { id: "aggregator" }));
            const bridged = await aggregator.add(VersionedBridgedLightDevice, options);

            expect(bridgedVersion(bridged)).equals(10);
        }
    });

    it("waits for an endpoint that is still initializing", async () => {
        let initializationStarted!: () => void;
        const started = new Promise<void>(resolve => (initializationStarted = resolve));
        let release!: () => void;
        const gate = new Promise<void>(resolve => (release = resolve));
        class SlowOnOffServer extends OnOffServer {
            override async initialize() {
                initializationStarted();
                await gate;
                await super.initialize();
            }
        }

        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = new Endpoint(OnOffLightDevice.with(SlowOnOffServer), { id: "light" });
        const adding = node.add(light);
        await started;
        expect(light.construction.status).equals(Lifecycle.Status.Initializing);

        const erasing = captureErrors(() => light.erase());
        release();
        const { errors } = await erasing;
        await adding;

        expect(errors).deep.equals([]);
        expect(light.lifecycle.isReady).equals(true);
    });

    it("rejects on a failing restart and still increases the ConfigurationVersion", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const failing = new Endpoint(OnOffLightDevice.with(FailingOnOffServer), { id: "failing", isEssential: false });
        await expect(node.add(failing)).rejectedWith(EndpointBehaviorsError);
        expect(failing.construction.status).equals(Lifecycle.Status.Crashed);
        const before = rootVersion(node);

        const failure = await failing.erase().then(
            () => undefined,
            (e: unknown) => e,
        );

        expect(failure).instanceOf(MatterAggregateError);
        expect(messagesOf(failure).join("\n")).match(/Initialization refused for test/);

        expect(rootVersion(node)).equals(before + 1);
    });

    it("rejects on a failing reset and still wipes and restarts the endpoint", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        await light.set({ onOff: { onOff: true } });
        const before = rootVersion(node);
        light.lifecycle.reset.on(() => {
            throw new ImplementationError("Reset refused for test");
        });

        const { result, errors } = await captureErrors(() =>
            light.erase().then(
                () => undefined,
                (e: unknown) => e,
            ),
        );

        expect(result).instanceOf(MatterAggregateError);
        expect(messagesOf(result).join("\n")).match(/Reset refused for test/);
        expect(errors).deep.equals([]);
        expect(light.lifecycle.isReady).equals(true);
        expect(light.state.onOff.onOff).equals(false);
        expect(rootVersion(node)).equals(before + 1);
    });

    it("restarts an endpoint erased while its parent still starts its other parts", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        class SlowOnOffServer extends OnOffServer {
            override async initialize() {
                await released;
            }
        }
        const first = new Endpoint(OnOffLightDevice, { id: "first" });
        const slow = new Endpoint(OnOffLightDevice.with(SlowOnOffServer), { id: "slow" });
        const adding = node.add(new Endpoint(AggregatorEndpoint, { id: "parent", parts: [first, slow] }));
        while (first.construction.status !== Lifecycle.Status.Active) {
            await first.construction.change;
        }

        await first.erase();
        release();
        await adding;

        expect(first.construction.status).equals(Lifecycle.Status.Active);
    });

    it("does not restart a part whose close waits behind the erase of its parent", async () => {
        const { node, parent, light } = await nodeWithNestedLight();
        await using _node = node;
        const reset = blockReset(parent);
        let readies = 0;
        light.lifecycle.ready.on(() => {
            readies++;
        });

        const erasing = parent.erase();
        await reset.entered;
        const closing = light.close();
        reset.release();
        await erasing;
        await closing;

        expect(readies).equals(0);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(parent.construction.status).equals(Lifecycle.Status.Active);
    });

    it("deletes an endpoint once it finished initializing", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        class SlowOnOffServer extends OnOffServer {
            override async initialize() {
                await released;
            }
        }
        const light = new Endpoint(OnOffLightDevice.with(SlowOnOffServer), { id: "light" });
        const adding = node.add(light);
        while (light.construction.status !== Lifecycle.Status.Initializing) {
            await light.construction.change;
        }

        const deleting = light.delete();
        release();
        await adding;
        await deleting;

        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("destroys an endpoint whose delete cannot prepare its storage", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(new UnpreparedEndpoint(OnOffLightDevice, { id: "light" }));

        await expect(light.delete()).rejectedWith(MatterAggregateError, /Error deleting/);

        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("leaves an endpoint untouched when its erase cannot prepare its storage", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(new UnpreparedEndpoint(OnOffLightDevice, { id: "light" }));
        let resets = 0;
        light.lifecycle.reset.on(() => {
            resets++;
        });

        await expect(light.erase()).rejectedWith(MatterAggregateError, /Error erasing/);

        expect(resets).equals(0);
        expect(light.construction.status).equals(Lifecycle.Status.Active);
    });

    it("refuses to erase an endpoint that was never added to a node", async () => {
        const light = new Endpoint(OnOffLightDevice, { id: "light" });

        await expect(light.erase()).rejectedWith(ImplementationError, /never added to a node/);
    });

    it("resets a part whose delete waits behind the erase of its parent once", async () => {
        const { node, parent, light } = await nodeWithNestedLight();
        await using _node = node;
        const reset = blockReset(parent);
        let resets = 0;
        light.lifecycle.reset.on(() => {
            resets++;
        });

        const erasing = parent.erase();
        await reset.entered;
        const deleting = light.delete();
        reset.release();
        await erasing;
        await deleting;

        expect(resets).equals(1);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("does not close a part again that its owner destroyed while the close of the part waited", async () => {
        const { node, parent } = await nodeWithNestedLight();
        await using _node = node;
        const part = new CountingEndpoint(OnOffLightDevice, { id: "counted" });
        await parent.add(part);
        const reset = blockReset(parent);

        const erasing = parent.erase();
        await reset.entered;
        const closingParent = parent.close();
        const closingPart = part.close();
        reset.release();
        await erasing;
        await closingParent;
        await closingPart;

        expect(part.closes).equals(0);
        expect(part.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("refuses to add a part to an endpoint whose close was requested", async () => {
        const { node, parent } = await nodeWithNestedLight();
        await using _node = node;
        const reset = blockReset(parent);

        const erasing = parent.erase();
        await reset.entered;
        const closing = parent.close();

        expect(() => parent.parts.add(new Endpoint(OnOffLightDevice, { id: "late" }))).throws(
            DestroyedDependencyError,
            /cannot be added/,
        );
        reset.release();
        await erasing;
        await closing;
    });

    it("refuses to add a node as a part", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const other = new MockServerNode();

        await expect(node.add(other)).rejectedWith(ImplementationError, /a node cannot be a part/);
        await other.close();
    });

    it("deletes an endpoint that crashed", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light", isEssential: false });
        const number = light.number;
        light.construction.crash();

        await light.delete();

        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        const again = await node.add(OnOffLightDevice, { id: "light" });
        expect(again.number).not.equals(number);
    });

    it("refuses to delete an endpoint that was never added to a node", async () => {
        const light = new Endpoint(OnOffLightDevice, { id: "light" });

        await expect(light.delete()).rejectedWith(ImplementationError, /never added to a node/);
    });

    it("refuses an erase of a crashed endpoint whose close waits with DestroyedDependencyError", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light", isEssential: false });
        light.construction.crash();
        let release!: () => void;
        const blocking = light.lifecycle.treeMutex.hold(
            "blocking",
            () => new Promise<void>(resolve => (release = resolve)),
        );
        const closing = light.close();

        await expect(light.erase()).rejectedWith(DestroyedDependencyError, /is closing, so it cannot be erased/);
        release();
        await blocking;
        await closing;
    });

    it("only wipes the storage of an endpoint whose parent has not started its parts", async () => {
        await using site = new MockSite();
        const id = "eraseUnderCrashedParent";
        let number: number;

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const child = new Endpoint(OnOffLightDevice, { id: "child" });
            await node.add(new Endpoint(OnOffLightDevice, { id: "parent", isEssential: false, parts: [child] }));
            await child.set({ onOff: { onOff: true } });
            number = child.number;
            await node.close();
        }

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const child = new Endpoint(OnOffLightDevice, { id: "child" });
            const parent = new Endpoint(OnOffLightDevice.with(FailingOnOffServer), {
                id: "parent",
                isEssential: false,
                parts: [child],
            });
            await expect(node.add(parent)).rejectedWith(EndpointBehaviorsError);

            await child.erase();

            expect(child.construction.status).equals(Lifecycle.Status.Inactive);
            await node.close();
        }

        {
            const node = await site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false } });
            const child = new Endpoint(OnOffLightDevice, { id: "child" });
            await node.add(new Endpoint(OnOffLightDevice, { id: "parent", isEssential: false, parts: [child] }));

            expect(child.state.onOff.onOff).equals(false);
            expect(child.number).equals(number);
        }
    });

    it("runs concurrent erases of one endpoint once", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const before = rootVersion(node);

        const { errors } = await captureErrors(() => Promise.all([light.erase(), light.erase()]));

        expect(errors).deep.equals([]);
        expect(light.lifecycle.isReady).equals(true);
        expect(rootVersion(node)).equals(before + 1);
    });

    it("throws while the endpoint is being deleted", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const deleting = light.delete();
        await expect(light.erase()).rejectedWith(DestroyedDependencyError, /is being deleted, so it cannot be erased/);
        await deleting;
    });

    it("does not restart an endpoint that is deleted while it is erased", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const { errors } = await captureErrors(async () => {
            const erasing = light.erase();
            const deleting = light.delete();
            light.lifecycle.ready.on(() => {
                expect.fail("Deleted endpoint restarted");
            });
            await deleting;
            await erasing;
        });

        expect(errors).deep.equals([]);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(node.endpoints.has(light)).equals(false);
    });

    it("increases the ConfigurationVersion once for an endpoint deleted while it is erased", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const before = rootVersion(node);

        const erasing = light.erase();
        await light.delete();
        await erasing;

        expect(rootVersion(node)).equals(before + 1);
    });

    it("warns naming both operations when a close waits for an erase of its ancestor", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        const light = await aggregator.add(OnOffLightDevice, { id: "light" });
        const reset = blockReset(aggregator);
        using capture = captureLifecycleWarnings();

        const erasing = aggregator.erase();
        await reset.entered;
        const closing = light.close();
        await MockTime.advance(Seconds(9));
        expect(capture.warnings).deep.equals([]);
        await MockTime.advance(Seconds(1));
        reset.release();
        await erasing;
        await closing;

        expect(capture.warnings).length(1);
        expect(capture.warnings[0]).contains(
            "closing node0.aggregator.light has waited 10s for erasing node0.aggregator; possible deadlock",
        );
    });

    it("warns naming both operations when a close waits for an erase of its node", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const reset = blockReset(node);
        using capture = captureLifecycleWarnings();

        const erasing = node.erase();
        await reset.entered;
        const closing = light.close();
        await MockTime.advance(Seconds(10));
        reset.release();
        await erasing;
        await closing;

        expect(capture.warnings).length(1);
        expect(capture.warnings[0]).contains("closing node0.light has waited 10s for erasing node0; possible deadlock");
    });

    for (const verb of ["start", "stop"] as const) {
        it(`warns naming both operations when a ${verb} of the node waits for its erase`, async () => {
            await using node = await MockServerNode.createOnline(undefined, {
                device: undefined,
                online: verb === "stop",
            });
            const reset = blockReset(node);
            using capture = captureLifecycleWarnings();

            const erasing = node.erase();
            await reset.entered;
            const waiting = node[verb]();
            await MockTime.advance(Seconds(10));
            reset.release();
            await erasing;
            await waiting;

            expect(capture.warnings).length(1);
            expect(capture.warnings[0]).contains(
                `${verb === "start" ? "starting" : "stopping"} node0 has waited 10s for erasing node0; possible deadlock`,
            );
        });
    }

    it("warns when an erase joins the erase in progress for 10 seconds", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const reset = blockReset(light);
        using capture = captureLifecycleWarnings();

        const erasing = light.erase();
        await reset.entered;
        const joining = light.erase();
        await MockTime.advance(Seconds(10));
        reset.release();
        await erasing;
        await joining;

        expect(capture.warnings).length(1);
        expect(capture.warnings[0]).contains(
            "erasing node0.light has waited 10s for erasing node0.light; possible deadlock",
        );
    });

    it("does not warn when a wait ends before 10 seconds", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const reset = blockReset(node);
        using capture = captureLifecycleWarnings();

        const erasing = node.erase();
        await reset.entered;
        const closing = light.close();
        const joining = node.erase();
        await MockTime.advance(Seconds(5));
        reset.release();
        await erasing;
        await closing;
        await joining;
        await MockTime.advance(Seconds(10));

        expect(capture.warnings).deep.equals([]);
    });

    it("skips an erase whose endpoint is deleted before the erase begins", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const before = rootVersion(node);
        let resets = 0;
        light.lifecycle.reset.on(() => {
            resets++;
        });
        let release!: () => void;
        const blocking = light.lifecycle.treeMutex.hold(
            "blocking",
            () => new Promise<void>(resolve => (release = resolve)),
        );

        const erasing = light.erase();
        const deleting = light.delete();
        release();

        await blocking;
        await erasing;
        await deleting;
        expect(resets).equals(1);
        expect(rootVersion(node)).equals(before + 1);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("completes an erase that has not begun when the endpoint is closed", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const before = rootVersion(node);
        let release!: () => void;
        const blocking = light.lifecycle.treeMutex.hold(
            "blocking",
            () => new Promise<void>(resolve => (release = resolve)),
        );

        const erasing = light.erase();
        const closing = light.close();
        release();
        await blocking;
        await erasing;
        await closing;

        expect(rootVersion(node)).equals(before + 1);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("waits for a close queued behind an erase when closing again after the erase", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const erasing = light.erase();
        const closing = light.close();
        await erasing;
        await light.close();

        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        await closing;
    });

    it("finishes an erase in progress before closing", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const before = rootVersion(node);

        const erasing = light.erase();
        const closing = light.close();
        await erasing;
        await closing;

        expect(rootVersion(node)).equals(before + 1);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("throws while the endpoint is closing after an earlier erase", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        await light.erase();

        const closing = light.close();
        await expect(light.erase()).rejectedWith(DestroyedDependencyError, /is closing, so it cannot be erased/);
        await closing;
    });

    it("does not restart an endpoint whose parent closes while it is erased", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, {
            id: "aggregator",
            parts: [{ type: OnOffLightDevice, id: "child" }],
        });
        const child = aggregator.parts.require("child");
        let restarted = false;
        child.lifecycle.ready.on(() => {
            restarted = true;
        });

        const erasing = child.erase();
        const closing = aggregator.close();
        await erasing;
        await closing;

        expect(restarted).equals(false);
        expect(child.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("deletes an endpoint after an erase that already reset it", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        let deleting: Promise<void> | undefined;
        light.construction.change.on(status => {
            if (status === Lifecycle.Status.Inactive && deleting === undefined) {
                deleting = light.delete();
            }
        });
        await light.erase();
        await deleting;

        expect(deleting).not.undefined;
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(node.endpoints.has(light)).equals(false);
    });

    it("refuses deleting an endpoint whose close waits for an erase", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });

        const erasing = light.erase();
        const closing = light.close();
        await expect(light.delete()).rejectedWith(DestroyedDependencyError, /is closing, so it cannot be deleted/);
        await erasing;
        await closing;
    });

    it("increases the root ConfigurationVersion when the bridged endpoint above crashed", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
        const child = new Endpoint(OnOffLightDevice, { id: "child" });
        const crashed = new Endpoint(VersionedBridgedLightDevice.with(FailingOnOffServer), {
            id: "crashed",
            isEssential: false,
            bridgedDeviceBasicInformation: { configurationVersion: 5 },
            parts: [child],
        });
        await expect(aggregator.add(crashed)).rejectedWith(EndpointBehaviorsError);
        const before = rootVersion(node);

        await child.erase();

        expect(rootVersion(node)).equals(before + 1);
    });

    it("throws on a destroyed endpoint", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        await light.close();

        await expect(light.erase()).rejectedWith(ImplementationError, /is closed/);
    });
});

describe("Endpoint lifecycle verbs", () => {
    type Verb = "erase" | "delete" | "close";

    const cases: Array<{
        first: Verb;
        second: Verb;
        rejects: boolean;
        phases: [afterFirst: string, afterSecond: string, settled: string];
        destroyed: boolean;
    }> = [
        { first: "erase", second: "erase", rejects: false, phases: ["erasing", "erasing", "idle"], destroyed: false },
        {
            first: "erase",
            second: "delete",
            rejects: false,
            phases: ["erasing", "deleting", "deleting"],
            destroyed: true,
        },
        { first: "erase", second: "close", rejects: false, phases: ["erasing", "closing", "closing"], destroyed: true },
        {
            first: "delete",
            second: "erase",
            rejects: true,
            phases: ["deleting", "deleting", "deleting"],
            destroyed: true,
        },
        {
            first: "delete",
            second: "delete",
            rejects: false,
            phases: ["deleting", "deleting", "deleting"],
            destroyed: true,
        },
        {
            first: "delete",
            second: "close",
            rejects: false,
            phases: ["deleting", "deleting", "deleting"],
            destroyed: true,
        },
        { first: "close", second: "erase", rejects: true, phases: ["closing", "closing", "closing"], destroyed: true },
        { first: "close", second: "delete", rejects: true, phases: ["closing", "closing", "closing"], destroyed: true },
        { first: "close", second: "close", rejects: false, phases: ["closing", "closing", "closing"], destroyed: true },
    ];

    for (const { first, second, rejects, phases, destroyed } of cases) {
        it(`${second} while ${first} runs ${rejects ? "throws" : "completes"}`, async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });

            const firstDone = light[first]();
            expect(light.lifecycle.isTerminal).equals(isTerminal(phases[0]));
            const secondDone = light[second]();
            expect(light.lifecycle.isTerminal).equals(isTerminal(phases[1]));

            if (rejects) {
                await expect(secondDone).rejectedWith(DestroyedDependencyError, /so it cannot be (erased|deleted)/);
            } else {
                await secondDone;
                if (destroyed && second !== "erase") {
                    expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
                }
            }
            await firstDone;

            expect(light.lifecycle.isTerminal).equals(isTerminal(phases[2]));
            expect(light.construction.status).equals(destroyed ? Lifecycle.Status.Destroyed : Lifecycle.Status.Active);
        });
    }

    it("does not report the failure of a delete a close waits for", async () => {
        await using node = await MockServerNode.createOnline(undefined, { device: undefined });
        const light = await node.add(OnOffLightDevice, { id: "light" });
        light.lifecycle.reset.on(() => {
            throw new ImplementationError("Reset refused for test");
        });

        const deleting = light.delete();
        const closing = light.close();

        await expect(deleting).rejectedWith(MatterAggregateError);
        await closing;
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    for (const verb of ["delete", "close"] as const) {
        it(`joins the ${verb} from a listener of its Destroying change`, async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const light = await node.add(OnOffLightDevice, { id: "light" });

            const joined = new Array<Promise<Lifecycle.Status>>();
            light.lifecycle.changed.on((type, endpoint) => {
                if (type === EndpointLifecycle.Change.Destroying && endpoint === light) {
                    joined.push(light.close().then(() => light.construction.status));
                    joined.push(light[verb]().then(() => light.construction.status));
                }
            });

            await light[verb]();

            expect(await Promise.all(joined)).deep.equals([Lifecycle.Status.Destroyed, Lifecycle.Status.Destroyed]);
        });
    }
});

describe("Endpoint lifecycle verbs of parts", () => {
    it("starts the erase of a part after the erase of its parent is done", async () => {
        const { node, parent, light } = await nodeWithNestedLight();
        await using _node = node;
        const parentReady = new Array<boolean>();
        light.lifecycle.reset.on(() => {
            parentReady.push(parent.lifecycle.isReady);
        });

        await Promise.all([parent.erase(), light.erase()]);

        expect(parentReady).deep.equals([false, true]);
        expect(light.lifecycle.isReady).equals(true);
    });

    it("closes a node with nested parts", async () => {
        const { node, parent, light } = await nodeWithNestedLight();

        await node.close();

        expect(parent.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        expect(light.lifecycle.isTerminal).equals(true);
    });

    it("throws when erasing or deleting a part while its node closes", async () => {
        const { node, light } = await nodeWithNestedLight();

        const closing = node.close();

        await expect(light.erase()).rejectedWith(
            DestroyedDependencyError,
            /node0 is closing, so node0.parent.light cannot be erased/,
        );
        await expect(light.delete()).rejectedWith(
            DestroyedDependencyError,
            /node0 is closing, so node0.parent.light cannot be deleted/,
        );
        await closing;
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("throws when erasing a part while its parent is deleted", async () => {
        const { node, parent, light } = await nodeWithNestedLight();
        await using _node = node;

        const deleting = parent.delete();

        await expect(light.erase()).rejectedWith(
            DestroyedDependencyError,
            /node0.parent is being deleted, so node0.parent.light cannot be erased/,
        );
        await deleting;
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("waits for the close of its node when closing a part", async () => {
        const { node, light } = await nodeWithNestedLight();

        const closing = node.close();
        await light.close();

        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
        await closing;
    });

    it("lets a handler of the node coming online delete an endpoint of the node", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined, online: false });
        await using _node = node;
        const light = await node.add(OnOffLightDevice, { id: "light" });
        node.lifecycle.online.on(async () => {
            await light.delete();
        });

        await node.start();

        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("lets a handler of the node coming online after a factory reset close an endpoint of the node", async () => {
        const { node, light } = await nodeWithNestedLight();
        await using _node = node;
        node.lifecycle.online.on(async () => {
            await light.close();
        });

        await node.erase();

        expect(node.lifecycle.isOnline).equals(true);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });

    it("lets a handler of the node going offline close an endpoint while the node closes", async () => {
        const { node, light } = await nodeWithNestedLight();
        let closed = false;
        node.lifecycle.goingOffline.on(async () => {
            await light.close();
            closed = light.construction.status === Lifecycle.Status.Destroyed;
        });

        await node.close();

        expect(closed).equals(true);
    });

    it("runs an erase of a part queued before the close of its node", async () => {
        const { node, light } = await nodeWithNestedLight();
        let resets = 0;
        light.lifecycle.reset.on(() => {
            resets++;
        });

        const erasing = light.erase();
        const closing = node.close();
        await erasing;
        await closing;

        expect(resets).equals(1);
        expect(light.construction.status).equals(Lifecycle.Status.Destroyed);
    });
});
