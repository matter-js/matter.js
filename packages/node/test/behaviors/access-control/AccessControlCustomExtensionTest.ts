/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { AccessControlClient, AccessControlServer } from "#behaviors/access-control";
import { MaybePromise } from "@matter/general";
import {
    attribute,
    AttributeElement,
    AttributeModel,
    command,
    CommandElement,
    CommandModel,
    field,
    FieldElement,
    Matter,
    MatterModel,
    response,
    string,
    uint32,
} from "@matter/model";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    TlvField,
    TlvInvokeResponseData,
    TlvObject,
    TlvString,
    TlvUInt32,
    TypeFromSchema,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";
import { interaction } from "../../node/node-helpers.js";

/**
 * Modern replacement for hand-writing a custom ClusterType: extend an existing generated server behavior with a
 * manufacturer-specific attribute and command using the decorator API.  The base AccessControl model is merged with the
 * new elements and TLV is generated automatically.
 */
class DoThingRequest {
    @field(string)
    note!: string;
}

class DoThingResponse {
    @field(uint32)
    count!: number;
}

const MY_ATTR_ID = 0xfff4_0000;
const MY_CMD_ID = 0xfff4_0001;

class CustomAccessControlServer extends AccessControlServer {
    declare state: CustomAccessControlServer.State;

    @command(MY_CMD_ID, DoThingRequest)
    @response(DoThingResponse)
    doThing(request: DoThingRequest): MaybePromise<DoThingResponse> {
        this.state.myCounter += request.note.length;
        return { count: this.state.myCounter };
    }
}

namespace CustomAccessControlServer {
    export class State extends AccessControlServer.State {
        @attribute(MY_ATTR_ID, uint32)
        myCounter: number = 0;
    }
}

const CustomRoot = MockServerNode.RootEndpoint.with(CustomAccessControlServer);

// TLV of the custom command request/response.  On the controller (generic path) the field layout is not discoverable
// from the wire, so the caller encodes it explicitly.
const TlvDoThingRequest = TlvObject({ note: TlvField(0, TlvString) });
const TlvDoThingResponse = TlvObject({ count: TlvField(0, TlvUInt32) });

const ATTR_NAME = `attr$${MY_ATTR_ID.toString(16)}`;
const CMD_NAME = `command$${MY_CMD_ID.toString(16)}`;

// Controller-side view of the same extension: a schema-only model with real element names.  A controller resolves peer
// clusters against its model, so registering this teaches it to expose the extras by name instead of attr$…/command$….
const ExtendedAccessControl = Matter.clusters(AccessControl.id)!.extend(
    {},
    AttributeElement({ id: MY_ATTR_ID, name: "MyCounter", type: "uint32", conformance: "O", access: "R V" }),
    CommandElement(
        { id: MY_CMD_ID, name: "DoThing", response: "DoThingResponse", conformance: "O", direction: "request" },
        FieldElement({ id: 0, name: "Note", type: "string" }),
    ),
    CommandElement(
        { id: MY_CMD_ID, name: "DoThingResponse", conformance: "O", direction: "response" },
        FieldElement({ id: 0, name: "Count", type: "uint32" }),
    ),
);
const ControllerModel = Matter.withClusters(ExtendedAccessControl);

describe("AccessControl custom extension", () => {
    describe("server", () => {
        it("adds the custom attribute and command to the cluster schema", () => {
            const schema = CustomAccessControlServer.schema;

            const attr = schema.get(AttributeModel, "myCounter");
            expect(attr).not.undefined;
            expect(attr!.id).equals(MY_ATTR_ID);

            const cmd = schema.get(CommandModel, "doThing");
            expect(cmd).not.undefined;
            expect(cmd!.id).equals(MY_CMD_ID);
        });

        it("keeps base elements and reads the custom attribute default", async () => {
            const node = await MockServerNode.createOnline(CustomRoot);
            try {
                await node.act(agent => {
                    const acl = agent.get(CustomAccessControlServer);
                    expect(acl.state.acl).deep.equals([]);
                    expect(acl.state.myCounter).equals(0);
                });
            } finally {
                await node.close();
            }
        });

        it("advertises and round-trips the custom command over the wire", async () => {
            const node = await MockServerNode.createOnline(CustomRoot);
            try {
                const fabric = await node.addFabric();
                let response: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
                await interaction.invoke(
                    node,
                    fabric,
                    {
                        commandPath: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(AccessControl.id),
                            commandId: CommandId(MY_CMD_ID),
                        },
                        commandFields: TlvDoThingRequest.encodeTlv({ note: "hello" }),
                    },
                    r => {
                        response = r;
                    },
                );

                expect(response?.command).not.undefined;
                expect(TlvDoThingResponse.decodeTlv(response!.command!.commandFields!)).deep.equals({ count: 5 });
                expect(node.stateOf(CustomAccessControlServer).myCounter).equals(5);
            } finally {
                await node.close();
            }
        });
    });

    describe("controller", () => {
        it("reads the custom attribute and invokes the custom command on a commissioned peer", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: CustomRoot, accessControl: { myCounter: 7 } },
            });

            const peer = controller.peers.get("peer1")!;
            expect(peer).not.undefined;

            // Discovered manufacturer elements have no compile-time type: reads use the string-keyed cluster overload,
            // and the synthetic command takes a pre-encoded TLV stream (its field layout is not advertised on the wire).
            const before = await peer.getStateOf("accessControl", [ATTR_NAME]);
            expect(before[ATTR_NAME]).equals(7);

            await peer.act(agent => {
                const client = agent.get(AccessControlClient) as unknown as Record<
                    string,
                    (fields: unknown) => unknown
                >;
                return client[CMD_NAME](TlvDoThingRequest.encodeTlv({ note: "hello" }));
            });

            expect(device.stateOf(CustomAccessControlServer).myCounter).equals(12);

            const after = await peer.getStateOf("accessControl", [ATTR_NAME]);
            expect(after[ATTR_NAME]).equals(12);
        });
    });

    describe("controller with custom model", () => {
        it("publishes the controller model to the node environment", async () => {
            const node = await MockServerNode.createOnline(MockServerNode.RootEndpoint, {
                controller: { matter: ControllerModel },
            });
            try {
                expect(node.stateOf(ControllerBehavior).matter).equals(ControllerModel);
                expect(node.env.maybeGet(MatterModel)).equals(ControllerModel);
            } finally {
                await node.close();
            }
        });

        it("exposes custom peer elements by real name", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                // MockSite types controller config as Configuration<any>, which rejects behavior-state keys; the
                // ControllerBehavior.matter option itself is properly typed (see the test above).
                controller: { controller: { matter: ControllerModel } } as any,
                device: { type: CustomRoot, accessControl: { myCounter: 7 } },
            });

            const peer = controller.peers.get("peer1")!;

            // Real names now, via the stock AccessControlClient.  The extra elements still lack a compile-time type, so
            // access is by string key / cast — but no synthetic attr$…/command$… identifiers.
            const before = await peer.getStateOf("accessControl", ["myCounter"]);
            expect(before.myCounter).equals(7);

            await peer.act(agent => {
                const client = agent.get(AccessControlClient) as unknown as Record<
                    string,
                    (fields: unknown) => unknown
                >;
                return client.doThing({ note: "hello" });
            });

            expect(device.stateOf(CustomAccessControlServer).myCounter).equals(12);

            const after = await peer.getStateOf("accessControl", ["myCounter"]);
            expect(after.myCounter).equals(12);
        });
    });
});
