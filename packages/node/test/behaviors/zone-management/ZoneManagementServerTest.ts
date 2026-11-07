/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZoneManagementServer } from "#behaviors/zone-management";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { Environment, MaybePromise, MockStorageService, StorageService } from "@matter/general";
import { interaction, MockServerNode } from "@matter/node/testing";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    Status,
    StatusResponse,
    StatusResponseError,
    TlvField,
    TlvObject,
    TlvOfModel,
    TlvUInt16,
} from "@matter/types";
import { ZoneManagement } from "@matter/types/clusters/zone-management";
import { MockEndpointType } from "../../behavior/mock-behavior.js";
import { MockEndpoint } from "../../endpoint/mock-endpoint.js";

const UserZoneServer = ZoneManagementServer.with("TwoDimensionalCartesianZone", "UserDefined");

const SQUARE = [
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 20, y: 20 },
    { x: 10, y: 20 },
];

const CROSSING = [SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]];

const PRIVACY_ZONE: ZoneManagement.TwoDCartesianZone = {
    name: "Window",
    use: ZoneManagement.ZoneUse.Privacy,
    vertices: SQUARE,
    color: undefined,
};

const MOTION_ZONE: ZoneManagement.TwoDCartesianZone = {
    name: "Driveway",
    use: ZoneManagement.ZoneUse.Motion,
    vertices: SQUARE,
    color: undefined,
};

const MFG_AREA: ZoneManagement.TwoDCartesianZone = {
    name: "Factory",
    use: ZoneManagement.ZoneUse.Motion,
    vertices: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
    ],
    color: undefined,
};

const MFG_ZONE: ZoneManagement.ZoneInformation = {
    zoneId: 1,
    zoneType: ZoneManagement.ZoneType.TwoDcartZone,
    zoneSource: ZoneManagement.ZoneSource.Mfg,
    twoDCartesianZone: MFG_AREA,
};

const TRIGGER: ZoneManagement.ZoneTriggerControl = {
    zoneId: 0,
    initialDuration: 10,
    augmentationDuration: 5,
    maxDuration: 60,
    blindDuration: 3,
    sensitivity: undefined,
};

const ATTRIBUTES = {
    maxUserDefinedZones: 5,
    maxZones: 6,
    sensitivityMax: 5,
    sensitivity: 3,
    twoDCartesianMax: { x: 1919, y: 1079 },
    zones: new Array<ZoneManagement.ZoneInformation>(),
    triggers: new Array<ZoneManagement.ZoneTriggerControl>(),
};

type Attributes = Partial<typeof ATTRIBUTES> & { lastZoneId?: number };

function userZone(zoneId: number, zone = PRIVACY_ZONE): ZoneManagement.ZoneInformation {
    return {
        zoneId,
        zoneType: ZoneManagement.ZoneType.TwoDcartZone,
        zoneSource: ZoneManagement.ZoneSource.User,
        twoDCartesianZone: zone,
    };
}

/**
 * {@link PRIVACY_ZONE} moved right by `offset`, so that zones with different offsets do not have the same vertices.
 */
function shiftedZone(offset: number) {
    return { ...PRIVACY_ZONE, vertices: SQUARE.map(({ x, y }) => ({ x: x + offset, y })) };
}

function createEndpoint(attributes: Attributes = {}) {
    return MockEndpoint.createWith(UserZoneServer.set({ ...ATTRIBUTES, ...attributes }));
}

function zonesOf(endpoint: Endpoint) {
    return endpoint.stateOf(UserZoneServer).zones;
}

function triggersOf(endpoint: Endpoint) {
    return endpoint.stateOf(UserZoneServer).triggers;
}

function create(endpoint: Endpoint, zone: ZoneManagement.TwoDCartesianZone) {
    return endpoint.act(agent => agent.get(UserZoneServer).createTwoDCartesianZone({ zone }));
}

function update(endpoint: Endpoint, zoneId: number, zone: ZoneManagement.TwoDCartesianZone) {
    return endpoint.act(agent => agent.get(UserZoneServer).updateTwoDCartesianZone({ zoneId, zone }));
}

function remove(endpoint: Endpoint, zoneId: number) {
    return endpoint.act(agent => agent.get(UserZoneServer).removeZone({ zoneId }));
}

function setTrigger(endpoint: Endpoint, trigger: ZoneManagement.ZoneTriggerControl) {
    return endpoint.act(agent => agent.get(UserZoneServer).createOrUpdateTrigger({ trigger }));
}

function removeTrigger(endpoint: Endpoint, zoneId: number) {
    return endpoint.act(agent => agent.get(UserZoneServer).removeTrigger({ zoneId }));
}

async function expectStatus(action: () => MaybePromise<unknown>, status: Status) {
    let error: unknown;
    try {
        await action();
    } catch (caught) {
        error = caught;
    }
    expect(error).instanceof(StatusResponseError);
    expect(error instanceof StatusResponseError ? error.code : undefined).equals(status);
}

const TlvCreateZoneRequest = TlvOfModel(ZoneManagement.schema.commands.require("CreateTwoDCartesianZone"));
const TlvCreateZoneResponse = TlvObject({ zoneId: TlvField(0, TlvUInt16) });
const TlvCreateOrUpdateTriggerRequest = TlvOfModel(ZoneManagement.schema.commands.require("CreateOrUpdateTrigger"));

/**
 * Invoke a command through the interaction layer, which validates the request against the model before the command
 * handler runs.
 */
async function invokeThroughInteraction(
    commandId: number,
    commandFields: ReturnType<typeof TlvCreateZoneRequest.encodeTlv>,
) {
    await using node = await MockServerNode.createOnline(undefined, {
        device: MockEndpointType.with(UserZoneServer.set({ ...ATTRIBUTES, zones: [userZone(0, MOTION_ZONE)] })),
    });

    let status: number | undefined;
    let zoneId: number | undefined;
    await interaction.invoke(
        node,
        await node.addFabric(),
        {
            commandPath: {
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(ZoneManagement.id),
                commandId: CommandId(commandId),
            },
            commandFields,
        },
        response => {
            status = response.status?.status?.status;
            const fields = response.command?.commandFields;
            if (fields !== undefined) {
                zoneId = TlvCreateZoneResponse.decodeTlv(fields).zoneId;
            }
        },
    );
    return { status, zoneId };
}

function createThroughInteraction(zone: ZoneManagement.TwoDCartesianZone) {
    return invokeThroughInteraction(
        ZoneManagement.commands.createTwoDCartesianZone.id,
        TlvCreateZoneRequest.encodeTlv({ zone }),
    );
}

describe("ZoneManagementServer", () => {
    it("does not start with repeated zone IDs", async () => {
        await expect(createEndpoint({ zones: [MFG_ZONE, userZone(1)] })).rejectedWith("Behaviors have errors");
    });

    it("refuses a write that repeats a zone ID", async () => {
        await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });

        await expect(endpoint.setStateOf(UserZoneServer, { zones: [MFG_ZONE, userZone(1)] })).rejectedWith(
            "ZoneID 1 is not unique",
        );

        expect(zonesOf(endpoint)).deep.equals([MFG_ZONE]);
    });

    describe("createTwoDCartesianZone", () => {
        it("adds a user-defined zone with zone ID 0 when there are no zones", async () => {
            await using endpoint = await createEndpoint();

            expect(await create(endpoint, PRIVACY_ZONE)).deep.equals({ zoneId: 0 });

            expect(zonesOf(endpoint)).deep.equals([userZone(0)]);
        });

        it("continues after the manufacturer zones", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });

            expect(await create(endpoint, PRIVACY_ZONE)).deep.equals({ zoneId: 2 });

            expect(zonesOf(endpoint)).deep.equals([MFG_ZONE, userZone(2)]);
        });

        it("skips zone IDs in use", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE], lastZoneId: 0 });

            expect(await create(endpoint, PRIVACY_ZONE)).deep.equals({ zoneId: 2 });
        });

        it("does not reuse the ID of a removed zone", async () => {
            await using endpoint = await createEndpoint();
            for (let offset = 0; offset < 3; offset++) {
                await create(endpoint, shiftedZone(offset));
            }
            await remove(endpoint, 2);

            expect(await create(endpoint, shiftedZone(3))).deep.equals({ zoneId: 3 });
        });

        it("does not reuse the ID of a removed zone after a restart", async () => {
            const environment = new Environment("test");
            environment.set(StorageService, new MockStorageService(environment));
            const device = { type: MockEndpointType.with(UserZoneServer.set(ATTRIBUTES)), id: "zones" };

            {
                await using node = await MockServerNode.createOnline(undefined, { id: "camera", device, environment });
                const endpoint = node.parts.require("zones");
                for (let offset = 0; offset < 3; offset++) {
                    await create(endpoint, shiftedZone(offset));
                }
                await remove(endpoint, 2);
            }

            {
                await using node = await MockServerNode.createOnline(undefined, { id: "camera", device, environment });
                const endpoint = node.parts.require("zones");

                expect(await create(endpoint, shiftedZone(3))).deep.equals({ zoneId: 3 });
            }
        });

        it("wraps the zone ID to 0 after 65534", async () => {
            await using endpoint = await createEndpoint({ lastZoneId: 0xfffe });

            expect(await create(endpoint, PRIVACY_ZONE)).deep.equals({ zoneId: 0 });
        });

        it("refuses a focus zone without the FocusZones feature", async () => {
            await using endpoint = await createEndpoint();

            await expectStatus(
                () => create(endpoint, { ...PRIVACY_ZONE, use: ZoneManagement.ZoneUse.Focus }),
                Status.ConstraintError,
            );
        });

        it("adds a focus zone with the FocusZones feature", async () => {
            const FocusZoneServer = ZoneManagementServer.with(
                "TwoDimensionalCartesianZone",
                "UserDefined",
                "FocusZones",
            );
            await using endpoint = await MockEndpoint.createWith(FocusZoneServer.set(ATTRIBUTES));

            const response = await endpoint.act(agent =>
                agent.get(FocusZoneServer).createTwoDCartesianZone({
                    zone: { ...PRIVACY_ZONE, use: ZoneManagement.ZoneUse.Focus },
                }),
            );

            expect(response).deep.equals({ zoneId: 0 });
        });

        it("refuses a zone beyond MaxUserDefinedZones", async () => {
            await using endpoint = await createEndpoint({ maxZones: 10 });
            for (let offset = 0; offset < 5; offset++) {
                await create(endpoint, shiftedZone(offset));
            }

            await expectStatus(() => create(endpoint, MOTION_ZONE), Status.ResourceExhausted);
        });

        it("refuses a zone beyond MaxZones", async () => {
            await using endpoint = await createEndpoint({
                maxZones: 5,
                zones: [MFG_ZONE, ...[2, 3, 4, 5].map(zoneId => userZone(zoneId, shiftedZone(zoneId)))],
            });

            await expectStatus(() => create(endpoint, PRIVACY_ZONE), Status.ResourceExhausted);
        });

        it("checks the zone limit before the vertices", async () => {
            await using endpoint = await createEndpoint({
                maxZones: 5,
                zones: [0, 1, 2, 3, 4].map(zoneId => userZone(zoneId, shiftedZone(zoneId))),
            });

            await expectStatus(
                () => create(endpoint, { ...PRIVACY_ZONE, vertices: CROSSING }),
                Status.ResourceExhausted,
            );
        });

        it("refuses a vertex beyond TwoDCartesianMax", async () => {
            await using endpoint = await createEndpoint();

            await expectStatus(
                () => create(endpoint, { ...PRIVACY_ZONE, vertices: [...SQUARE.slice(0, 3), { x: 10, y: 1080 }] }),
                Status.DynamicConstraintError,
            );
        });

        it("refuses a zone with the same use and vertices as another zone", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, PRIVACY_ZONE);

            await expectStatus(() => create(endpoint, { ...PRIVACY_ZONE, name: "Other" }), Status.AlreadyExists);
        });

        it("refuses a zone with the same use and vertices as a manufacturer zone", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });

            await expectStatus(() => create(endpoint, { ...MFG_AREA, name: "Copy" }), Status.AlreadyExists);
        });

        it("adds a zone with the same vertices and another use", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, PRIVACY_ZONE);

            expect(await create(endpoint, MOTION_ZONE)).deep.equals({ zoneId: 1 });
        });

        it("discards the zone when an override refuses it after super", async () => {
            class RefusingServer extends UserZoneServer {
                override async createTwoDCartesianZone(
                    request: ZoneManagement.CreateTwoDCartesianZoneRequest,
                ): Promise<ZoneManagement.CreateTwoDCartesianZoneResponse> {
                    await super.createTwoDCartesianZone(request);
                    throw new StatusResponse.FailureError("Camera refused the zone");
                }
            }
            await using endpoint = await MockEndpoint.createWith(RefusingServer.set(ATTRIBUTES));

            await expectStatus(
                () => endpoint.act(agent => agent.get(RefusingServer).createTwoDCartesianZone({ zone: PRIVACY_ZONE })),
                Status.Failure,
            );

            expect(endpoint.stateOf(RefusingServer).zones).deep.equals([]);
            expect(endpoint.stateOf(RefusingServer).lastZoneId).undefined;
        });

        describe("polygon check", () => {
            const valid = {
                triangle: [
                    { x: 10, y: 10 },
                    { x: 20, y: 10 },
                    { x: 20, y: 20 },
                ],
                square: SQUARE,
                convex: [
                    { x: 10, y: 10 },
                    { x: 20, y: 10 },
                    { x: 20, y: 20 },
                    { x: 15, y: 25 },
                    { x: 10, y: 20 },
                ],
                concave: [
                    { x: 10, y: 10 },
                    { x: 20, y: 10 },
                    { x: 20, y: 20 },
                    { x: 15, y: 15 },
                    { x: 10, y: 20 },
                ],
                arrow: [
                    { x: 10, y: 10 },
                    { x: 20, y: 20 },
                    { x: 30, y: 10 },
                    { x: 20, y: 15 },
                ],
                "collinear neighbors": [
                    { x: 10, y: 10 },
                    { x: 20, y: 10 },
                    { x: 30, y: 10 },
                    { x: 20, y: 15 },
                ],
            };

            const invalid = {
                bowtie: CROSSING,
                "crossing edges": [
                    { x: 10, y: 10 },
                    { x: 20, y: 10 },
                    { x: 20, y: 20 },
                    { x: 15, y: 5 },
                    { x: 10, y: 20 },
                ],
                "overlapping edges": [
                    { x: 2, y: 2 },
                    { x: 10, y: 2 },
                    { x: 7, y: 2 },
                    { x: 10, y: 1 },
                    { x: 1, y: 1 },
                ],
                "touching vertex": [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 2, y: 0 },
                    { x: 2, y: 1 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ],
                "repeated vertex": [
                    { x: 0, y: 0 },
                    { x: 2, y: 0 },
                    { x: 2, y: 1 },
                    { x: 2, y: 0 },
                    { x: 1, y: 0 },
                ],
                "repeated first vertex": [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 0 },
                    { x: 0, y: 1 },
                ],
                "zero-length edge": [
                    { x: 0, y: 0 },
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ],
                "closing vertex": [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                    { x: 0, y: 0 },
                ],
                "collinear triangle": [
                    { x: 0, y: 0 },
                    { x: 2, y: 0 },
                    { x: 1, y: 0 },
                ],
                "collinear quadrilateral": [
                    { x: 0, y: 0 },
                    { x: 2, y: 0 },
                    { x: 1, y: 0 },
                    { x: 3, y: 0 },
                ],
            };

            for (const [name, vertices] of Object.entries(valid)) {
                it(`accepts a ${name}`, async () => {
                    await using endpoint = await createEndpoint();

                    expect(await create(endpoint, { ...PRIVACY_ZONE, vertices })).deep.equals({ zoneId: 0 });
                });
            }

            for (const [name, vertices] of Object.entries(invalid)) {
                it(`refuses ${name}`, async () => {
                    await using endpoint = await createEndpoint();

                    await expectStatus(
                        () => create(endpoint, { ...PRIVACY_ZONE, vertices }),
                        Status.DynamicConstraintError,
                    );
                });
            }
        });
    });

    describe("updateTwoDCartesianZone", () => {
        it("replaces the zone and keeps its ID and source", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, PRIVACY_ZONE);
            const changed = { ...shiftedZone(5), name: "Door", color: "#FF0000" };

            await update(endpoint, 0, changed);

            expect(zonesOf(endpoint)).deep.equals([userZone(0, changed)]);
        });

        it("accepts the unchanged vertices of the zone itself", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, PRIVACY_ZONE);

            await update(endpoint, 0, { ...PRIVACY_ZONE, name: "Renamed" });

            expect(zonesOf(endpoint)[0].twoDCartesianZone?.name).equals("Renamed");
        });

        it("refuses an unknown zone before checking the vertices", async () => {
            await using endpoint = await createEndpoint();

            await expectStatus(() => update(endpoint, 7, { ...PRIVACY_ZONE, vertices: CROSSING }), Status.NotFound);
        });

        it("refuses a manufacturer zone before checking the vertices", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });

            await expectStatus(
                () => update(endpoint, 1, { ...PRIVACY_ZONE, vertices: CROSSING }),
                Status.ConstraintError,
            );
        });

        const refusedUpdates: [string, Partial<ZoneManagement.TwoDCartesianZone>, Status][] = [
            [
                "a focus zone without the FocusZones feature",
                { use: ZoneManagement.ZoneUse.Focus },
                Status.ConstraintError,
            ],
            [
                "a vertex beyond TwoDCartesianMax",
                { vertices: [...SQUARE.slice(0, 3), { x: 1920, y: 20 }] },
                Status.DynamicConstraintError,
            ],
            ["vertices another zone already has with the same use", shiftedZone(1), Status.AlreadyExists],
            ["crossing edges", { vertices: CROSSING }, Status.DynamicConstraintError],
        ];
        for (const [name, zone, status] of refusedUpdates) {
            it(`refuses ${name}`, async () => {
                await using endpoint = await createEndpoint();
                await create(endpoint, PRIVACY_ZONE);
                await create(endpoint, shiftedZone(1));

                await expectStatus(() => update(endpoint, 0, { ...PRIVACY_ZONE, ...zone }), status);
            });
        }
    });

    describe("removeZone", () => {
        it("removes the zone", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });
            await create(endpoint, PRIVACY_ZONE);

            await remove(endpoint, 2);

            expect(zonesOf(endpoint)).deep.equals([MFG_ZONE]);
        });

        it("refuses an unknown zone", async () => {
            await using endpoint = await createEndpoint();

            await expectStatus(() => remove(endpoint, 7), Status.NotFound);
        });

        it("refuses a manufacturer zone", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });

            await expectStatus(() => remove(endpoint, 1), Status.ConstraintError);
        });

        it("refuses a zone that a trigger uses", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, MOTION_ZONE);
            await setTrigger(endpoint, TRIGGER);

            await expectStatus(() => remove(endpoint, 0), Status.InvalidInState);
            expect(zonesOf(endpoint)).length(1);
        });
    });

    describe("createOrUpdateTrigger", () => {
        it("adds a trigger and replaces it on update", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, MOTION_ZONE);

            await setTrigger(endpoint, TRIGGER);
            expect(triggersOf(endpoint)).deep.equals([TRIGGER]);

            const longer = { ...TRIGGER, maxDuration: 120 };
            await setTrigger(endpoint, longer);
            expect(triggersOf(endpoint)).deep.equals([longer]);
        });

        it("adds a trigger for a manufacturer motion zone", async () => {
            await using endpoint = await createEndpoint({ zones: [MFG_ZONE] });

            await setTrigger(endpoint, { ...TRIGGER, zoneId: 1 });

            expect(triggersOf(endpoint)).deep.equals([{ ...TRIGGER, zoneId: 1 }]);
        });

        it("refuses an unknown zone", async () => {
            await using endpoint = await createEndpoint();

            await expectStatus(() => setTrigger(endpoint, TRIGGER), Status.NotFound);
        });

        it("refuses a zone that is not a motion zone", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, PRIVACY_ZONE);

            await expectStatus(() => setTrigger(endpoint, TRIGGER), Status.ConstraintError);
        });

        for (const [name, durations] of Object.entries({
            "an augmentation longer than the initial duration": { augmentationDuration: 11 },
            "a maximum shorter than the initial duration": { maxDuration: 9 },
            "an initial duration of 0": { initialDuration: 0, augmentationDuration: 0 },
        })) {
            it(`refuses ${name}`, async () => {
                await using endpoint = await createEndpoint();
                await create(endpoint, MOTION_ZONE);

                await expectStatus(() => setTrigger(endpoint, { ...TRIGGER, ...durations }), Status.ConstraintError);
            });
        }

        it("refuses a sensitivity without the PerZoneSensitivity feature", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, MOTION_ZONE);

            await expectStatus(() => setTrigger(endpoint, { ...TRIGGER, sensitivity: 2 }), Status.InvalidCommand);
        });

        describe("with the PerZoneSensitivity feature", () => {
            const PerZoneServer = ZoneManagementServer.with(
                "TwoDimensionalCartesianZone",
                "UserDefined",
                "PerZoneSensitivity",
            );

            function createPerZoneEndpoint() {
                const { sensitivity: _sensitivity, ...attributes } = ATTRIBUTES;
                return MockEndpoint.createWith(PerZoneServer.set({ ...attributes, zones: [userZone(0, MOTION_ZONE)] }));
            }

            function setPerZoneTrigger(endpoint: Endpoint, trigger: ZoneManagement.ZoneTriggerControl) {
                return endpoint.act(agent => agent.get(PerZoneServer).createOrUpdateTrigger({ trigger }));
            }

            it("adds a trigger with a sensitivity", async () => {
                await using endpoint = await createPerZoneEndpoint();

                await setPerZoneTrigger(endpoint, { ...TRIGGER, sensitivity: 5 });

                expect(endpoint.stateOf(PerZoneServer).triggers).deep.equals([{ ...TRIGGER, sensitivity: 5 }]);
            });

            it("refuses a trigger without a sensitivity", async () => {
                await using endpoint = await createPerZoneEndpoint();

                await expectStatus(() => setPerZoneTrigger(endpoint, TRIGGER), Status.InvalidCommand);
            });

            for (const sensitivity of [0, 6]) {
                it(`refuses a sensitivity of ${sensitivity}`, async () => {
                    await using endpoint = await createPerZoneEndpoint();

                    await expectStatus(
                        () => setPerZoneTrigger(endpoint, { ...TRIGGER, sensitivity }),
                        Status.ConstraintError,
                    );
                });
            }
        });
    });

    describe("removeTrigger", () => {
        it("removes the trigger, after which the zone can be removed", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, MOTION_ZONE);
            await setTrigger(endpoint, TRIGGER);

            await removeTrigger(endpoint, 0);
            await remove(endpoint, 0);

            expect(triggersOf(endpoint)).deep.equals([]);
            expect(zonesOf(endpoint)).deep.equals([]);
        });

        it("refuses a zone without a trigger", async () => {
            await using endpoint = await createEndpoint();
            await create(endpoint, MOTION_ZONE);

            await expectStatus(() => removeTrigger(endpoint, 0), Status.NotFound);
        });
    });

    describe("through the interaction layer", () => {
        it("returns the ID of the new zone", async () => {
            expect(await createThroughInteraction(PRIVACY_ZONE)).deep.equals({ status: undefined, zoneId: 1 });
        });

        it("refuses a name longer than 32 bytes before the command handler", async () => {
            expect(await createThroughInteraction({ ...PRIVACY_ZONE, name: "X".repeat(33) })).deep.equals({
                status: Status.ConstraintError,
                zoneId: undefined,
            });
        });

        it("refuses fewer than 3 vertices before the command handler", async () => {
            expect(await createThroughInteraction({ ...PRIVACY_ZONE, vertices: SQUARE.slice(0, 2) })).deep.equals({
                status: Status.ConstraintError,
                zoneId: undefined,
            });
        });

        it("returns INVALID_COMMAND for a trigger sensitivity without the PerZoneSensitivity feature", async () => {
            const result = await invokeThroughInteraction(
                ZoneManagement.commands.createOrUpdateTrigger.id,
                TlvCreateOrUpdateTriggerRequest.encodeTlv({ trigger: { ...TRIGGER, sensitivity: 2 } }),
            );

            expect(result).deep.equals({ status: Status.InvalidCommand, zoneId: undefined });
        });
    });
});
