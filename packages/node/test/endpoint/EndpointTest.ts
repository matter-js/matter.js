/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { BasicInformationServer } from "#behaviors/basic-information";
import { OnOffBehavior, OnOffServer } from "#behaviors/on-off";
import { PowerSourceServer } from "#behaviors/power-source";
import { WindowCoveringServer } from "#behaviors/window-covering";
import { OnOffLightDevice } from "#devices/on-off-light";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { WindowCoveringDevice } from "#devices/window-covering";
import { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointBehaviorsError } from "#endpoint/errors.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { RootEndpoint } from "#endpoints/root";
import { ChangeNotificationService } from "#node/integration/ChangeNotificationService.js";
import { ImplementationError, Lifecycle, LogDestination, Logger, LogFormat, LogLevel } from "@matter/general";
import { EndpointNumber, FabricIndex } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { MockServerNode } from "../node/mock-server-node.js";

const WindowCoveringLiftDevice = WindowCoveringDevice.with(WindowCoveringServer.with("Lift", "PositionAwareLift"));

describe("Endpoint", () => {
    describe("agentType", () => {
        it("supports behaviors", () => {
            // RootEndpoint
            RootEndpoint.behaviors satisfies { index: typeof IndexBehavior };
            RootEndpoint.behaviors satisfies { basicInformation: typeof BasicInformationServer };

            // Agent.Instance
            const agent1 = {} as Agent.Instance<RootEndpoint>;
            agent1.index satisfies IndexBehavior;

            // Endpoint.agentType
            const agent2 = {} as InstanceType<Endpoint<RootEndpoint>["agentType"]>;
            agent2.index satisfies IndexBehavior;
        });
    });

    describe("constructor", () => {
        it("accepts bare endpoint type", async () => {
            const endpoint = new Endpoint(WindowCoveringLiftDevice);
            const node = new MockServerNode();
            node.parts.add(endpoint);
            await endpoint.construction;
            expect(endpoint.state.windowCovering.endProductType).equals(0);
        });

        it("accepts endpoint type with options", async () => {
            const endpoint = new Endpoint(WindowCoveringLiftDevice, {
                owner: new MockServerNode(),
                windowCovering: { currentPositionLiftPercent100ths: 100 },
            });
            await endpoint.construction;
            expect(endpoint.state.windowCovering.currentPositionLiftPercent100ths).equals(100);
        });

        it("accepts configuration", async () => {
            const endpoint = new Endpoint({
                type: WindowCoveringLiftDevice,
                owner: new MockServerNode(),
                windowCovering: { currentPositionLiftPercent100ths: 200 },
            });
            await endpoint.construction;
            expect(endpoint.state.windowCovering.currentPositionLiftPercent100ths).equals(200);
        });
    });

    describe("set", () => {
        it("sets", async () => {
            const node = new MockServerNode();
            const sensor = await node.add(TemperatureSensorDevice);

            await sensor.set({
                temperatureMeasurement: {
                    measuredValue: 123,
                },
            });

            expect(sensor.state.temperatureMeasurement.measuredValue).equals(123);
        });

        it("deep sets object", async () => {
            const node = new MockServerNode();
            await node.construction;

            await node.set({
                basicInformation: {
                    productAppearance: {
                        finish: BasicInformation.ProductFinish.Matte,
                        primaryColor: BasicInformation.Color.Red,
                    },
                },
            });

            expect(node.state.basicInformation.productAppearance).deep.equals({
                finish: BasicInformation.ProductFinish.Matte,
                primaryColor: BasicInformation.Color.Red,
            });

            await node.set({
                basicInformation: {
                    productAppearance: {
                        primaryColor: BasicInformation.Color.Aqua,
                    },
                },
            });

            expect(node.state.basicInformation.productAppearance).deep.equals({
                finish: BasicInformation.ProductFinish.Matte,
                primaryColor: BasicInformation.Color.Aqua,
            });
        });

        it("deep sets array", async () => {
            const node = new MockServerNode();
            await node.construction;

            await node.set({
                accessControl: {
                    acl: [
                        {
                            authMode: AccessControl.AccessControlEntryAuthMode.Pase,
                            fabricIndex: FabricIndex(1),
                            privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                        },
                    ],
                },
            });

            await node.set({
                accessControl: {
                    acl: {
                        1: {
                            authMode: AccessControl.AccessControlEntryAuthMode.Case,
                            fabricIndex: FabricIndex(1),
                            privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                        },
                    },
                },
            });

            await node.set({
                accessControl: {
                    acl: {
                        0: {
                            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                        },
                    },
                },
            });

            expect(node.state.accessControl.acl).deep.equals([
                {
                    authMode: AccessControl.AccessControlEntryAuthMode.Pase,
                    fabricIndex: 1,
                    privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                    subjects: null,
                    targets: null,
                    auxiliaryType: undefined,
                },
                {
                    authMode: AccessControl.AccessControlEntryAuthMode.Case,
                    fabricIndex: 1,
                    privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                    subjects: null,
                    targets: null,
                    auxiliaryType: undefined,
                },
            ]);
        });

        it("replaces array when shorter", async () => {
            const node = new MockServerNode();
            await node.construction;

            await node.set({
                accessControl: {
                    acl: [
                        {
                            authMode: AccessControl.AccessControlEntryAuthMode.Pase,
                            fabricIndex: FabricIndex(1),
                            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
                            subjects: null,
                            targets: null,
                        },
                        {
                            authMode: AccessControl.AccessControlEntryAuthMode.Case,
                            fabricIndex: FabricIndex(1),
                            privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                            subjects: null,
                            targets: null,
                        },
                    ],
                },
            });

            await node.set({
                accessControl: {
                    acl: [
                        {
                            authMode: AccessControl.AccessControlEntryAuthMode.Group,
                            fabricIndex: FabricIndex(1),
                            privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                            subjects: null,
                            targets: null,
                        },
                    ],
                },
            });

            expect(node.state.accessControl.acl).deep.equals([
                {
                    authMode: AccessControl.AccessControlEntryAuthMode.Group,
                    fabricIndex: 1,
                    privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                    subjects: null,
                    targets: null,
                    auxiliaryType: undefined,
                },
            ]);
        });

        it("replaces array to empty", async () => {
            const node = new MockServerNode();
            await node.construction;

            await node.set({
                accessControl: {
                    acl: [
                        {
                            authMode: AccessControl.AccessControlEntryAuthMode.Pase,
                            fabricIndex: FabricIndex(1),
                            privilege: AccessControl.AccessControlEntryPrivilege.Manage,
                        },
                    ],
                },
            });

            await node.set({
                accessControl: {
                    acl: [],
                },
            });

            expect(node.state.accessControl.acl).deep.equals([]);
        });
    });

    describe("accepts new behaviors", () => {
        it("before endpoint installation", async () => {
            const endpoint = new Endpoint(WindowCoveringLiftDevice);
            endpoint.behaviors.require(OnOffServer);
            const node = new MockServerNode();
            await node.add(endpoint);
            await node.construction;
            expect(endpoint.stateOf(OnOffBehavior).onOff).false;
        });

        it("after endpoint installation", async () => {
            const endpoint = new Endpoint(WindowCoveringLiftDevice);
            const node = new MockServerNode();
            await node.add(endpoint);
            endpoint.behaviors.require(OnOffServer);
            node.parts.add(endpoint);
            await node.construction;
            expect(endpoint.stateOf(OnOffBehavior).onOff).false;
        });

        it("after node initialization", async () => {
            const endpoint = new Endpoint(WindowCoveringLiftDevice);
            const node = new MockServerNode();
            await node.add(endpoint);
            node.parts.add(endpoint);
            await node.construction;
            endpoint.behaviors.require(OnOffServer);
            expect(endpoint.stateOf(OnOffBehavior).onOff).false;
        });

        it("after node start", async () => {
            const endpoint = new Endpoint(WindowCoveringLiftDevice);
            const node = new MockServerNode();
            await node.add(endpoint);
            node.parts.add(endpoint);
            await node.start();
            endpoint.behaviors.require(OnOffServer);
            expect(endpoint.stateOf(OnOffBehavior).onOff).false;
            await node.close();
        });

        it("with powersource on a bridged node", async () => {
            const node = new MockServerNode();
            const bridge = new Endpoint(AggregatorEndpoint);
            await node.add(bridge);
            const bridgedNode = new Endpoint(OnOffLightDevice);
            await bridge.add(bridgedNode);
            bridgedNode.behaviors.require(PowerSourceServer);
        });
    });

    class FailingOnOffServer extends OnOffServer {
        override initialize() {
            throw new ImplementationError("Initialization refused for test");
        }
    }

    /**
     * Add a non-essential endpoint whose own behavior crashes before it initializes its parts, so those parts get an
     * ID (or not) but never a number.
     */
    async function addCrashedParent(node: Awaited<ReturnType<typeof MockServerNode.createOnline>>) {
        const parent = new Endpoint(OnOffLightDevice.with(FailingOnOffServer), {
            id: "parent",
            isEssential: false,
            parts: [{ type: OnOffLightDevice, id: "child" }, OnOffLightDevice],
        });
        await expect(node.add(parent)).rejectedWith(EndpointBehaviorsError);
        const children = [...parent.parts];
        expect(children.map(child => [child.maybeId, child.lifecycle.hasNumber])).deep.equals([
            ["child", false],
            [undefined, false],
        ]);
        return { parent, children };
    }

    describe("close", () => {
        it("closes parts that never received a number, with or without an ID", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const { parent, children } = await addCrashedParent(node);

            // Consumers such as StateStream read endpoint.number from every "delete"
            const deletes = new Array<Endpoint>();
            node.env.get(ChangeNotificationService).change.on(change => {
                if (change.kind === "delete") {
                    deletes.push(change.endpoint);
                    void change.endpoint.number;
                }
            });

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
                await parent.close();
            } finally {
                delete Logger.destinations.capture;
            }

            expect(errors).deep.equals([]);
            expect(deletes.filter(endpoint => children.includes(endpoint))).deep.equals([]);
            expect(children.map(child => child.construction.status)).deep.equals([
                Lifecycle.Status.Destroyed,
                Lifecycle.Status.Destroyed,
            ]);

            await node.close();
        });

        it("does not release a live sibling's number when an unidentified part preset to the same number closes", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });

            const holder = await node.add(OnOffLightDevice, { id: "holder", number: 5 });

            // The parent crashes before its part reaches initializeDescendant/assignNumber, so the part's preset
            // number was never recorded as allocated to it
            const parent = new Endpoint(OnOffLightDevice.with(FailingOnOffServer), {
                id: "parent",
                isEssential: false,
                parts: [{ type: OnOffLightDevice, number: EndpointNumber(5) }],
            });
            await expect(node.add(parent)).rejectedWith(EndpointBehaviorsError);
            const [collidingChild] = [...parent.parts];
            expect(collidingChild.maybeId).equals(undefined);
            expect(collidingChild.maybeNumber).equals(5);

            await parent.close();

            // holder's number must still be reserved: a new endpoint claiming the same number is a conflict, not a
            // free number to hand out
            await expect(node.add(OnOffLightDevice, { id: "impostor", number: 5 })).rejected;

            expect(holder.maybeNumber).equals(5);

            await node.close();
        });
    });

    describe("erase", () => {
        it("erases a part that never received a number, with or without an ID", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const { children } = await addCrashedParent(node);

            for (const child of children) {
                await child.erase();
            }

            await node.close();
        });
    });
});
