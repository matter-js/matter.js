/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ColorControlServer } from "#behaviors/color-control";
import { IdentifyServer } from "#behaviors/identify";
import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffServer } from "#behaviors/on-off";
import { ExtendedColorLightDevice } from "#devices/extended-color-light";
import { OnOffLightDevice } from "#devices/on-off-light";
import { MutableEndpoint } from "#endpoint/type/MutableEndpoint.js";
import { ImplementationError, LogLevel, MaybePromise } from "@matter/general";
import {
    AcceptedCommandList,
    AttributeElement,
    ClusterModel,
    CommandElement,
    EventList,
    FeatureMap,
    FieldElement,
    GeneratedCommandList,
    Specification,
} from "@matter/model";
import { captureLog, interaction, MockServerNode } from "@matter/node/testing";
import { AccessControl as ProtocolAccessControl, Fabric, Subject } from "@matter/protocol";
import {
    AttributeId,
    BitmapSchema,
    ClusterId,
    ClusterType,
    CommandId,
    EndpointNumber,
    FabricIndex,
    NodeId,
    Status,
    TlvAny,
    TlvArray,
    TlvBoolean,
    TlvEnum,
    TlvField,
    TlvInvokeResponseData,
    TlvNullable,
    TlvObject,
    TlvOfModel,
    TlvSchema,
    TlvString,
    TlvSubjectId,
    TlvUInt16,
    TlvUInt8,
    TypeFromSchema,
    WildcardPathFlagsBitmap,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { ColorControl } from "@matter/types/clusters/color-control";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { Identify } from "@matter/types/clusters/identify";
import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";
import { OnOff } from "@matter/types/clusters/on-off";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
import { readAllAttrs } from "../../node/read-helpers.js";

const FABRICS_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: OperationalCredentials.id,
    attributeId: OperationalCredentials.attributes.fabrics.id,
};

const NOCS_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: OperationalCredentials.id,
    attributeId: OperationalCredentials.attributes.nocs.id,
};

const COMMISSIONED_FABRICS_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: OperationalCredentials.id,
    attributeId: OperationalCredentials.attributes.commissionedFabrics.id,
};

const LEAVE_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: BasicInformation.id,
    eventId: BasicInformation.events.leave.id,
};

class WifiCommissioningServer extends NetworkCommissioningServer.with("WiFiNetworkInterface") {
    override initialize() {
        this.state.maxNetworks = 4;
        this.state.scanMaxTimeSeconds = 20;
        this.state.connectMaxTimeSeconds = 40;
        this.state.supportedWiFiBands = [NetworkCommissioning.WiFiBand["2G4"]];
    }
}

// This is AccessControl.AccessControlEntryStruct but not sure how to remove fabric index from payload so just
// redefining for now
const TlvAccessControlTarget = TlvOfModel(
    AccessControl.schema.datatypes.require("AccessControlTargetStruct"),
) as TlvSchema<AccessControl.AccessControlTarget>;

const AcesWithoutFabric = TlvObject({
    privilege: TlvField(1, TlvEnum<AccessControl.AccessControlEntryPrivilege>()),
    authMode: TlvField(2, TlvEnum<AccessControl.AccessControlEntryAuthMode>()),
    subjects: TlvField(3, TlvNullable(TlvArray(TlvSubjectId))),
    targets: TlvField(4, TlvNullable(TlvArray(TlvAccessControlTarget))),
});

async function writeAcl(node: MockServerNode, fabric: Fabric, acl: TypeFromSchema<typeof AcesWithoutFabric>) {
    await interaction.write(node, fabric, {
        path: {
            endpointId: EndpointNumber(0),
            clusterId: ClusterId(AccessControl.id),
            attributeId: AttributeId(AccessControl.attributes.acl.id),
        },
        data: TlvArray(AcesWithoutFabric).encodeTlv([acl]),
    });
}

async function readAcls(node: MockServerNode, fabric: Fabric, isFabricFiltered: boolean) {
    return await interaction.read(node, fabric, isFabricFiltered, {
        endpointId: EndpointNumber(0),
        clusterId: AccessControl.id,
        attributeId: AttributeId(AccessControl.attributes.acl.id),
    });
}

async function readNocs(node: MockServerNode, fabric: Fabric, isFabricFiltered: boolean) {
    return await interaction.read(node, fabric, isFabricFiltered, NOCS_PATH);
}

// Note - this used to be BehaviorServerTest...  It's not a 1:1 mapping but I believe the closest equivalent to
// BehaviorServer is ProtocolService
describe("ProtocolServiceTest", () => {
    it("properly fabric filters reads and writes", async () => {
        const node = await MockServerNode.createOnline();

        const fabric1 = await node.addFabric();
        const fabric2 = await node.addFabric();

        await writeAcl(node, fabric1, {
            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
            authMode: AccessControl.AccessControlEntryAuthMode.Case,
            subjects: null,
            targets: null,
        });

        await writeAcl(node, fabric2, {
            privilege: AccessControl.AccessControlEntryPrivilege.Administer,
            authMode: AccessControl.AccessControlEntryAuthMode.Case,
            subjects: null,
            targets: null,
        });

        expect(node.state.accessControl.acl).deep.equals([
            { privilege: 5, authMode: 2, subjects: null, targets: null, auxiliaryType: undefined, fabricIndex: 1 },
            { privilege: 5, authMode: 2, subjects: null, targets: null, auxiliaryType: undefined, fabricIndex: 2 },
        ]);

        const fabric1Acls = await readAcls(node, fabric1, true);

        expect(fabric1Acls).deep.equals([
            { privilege: 5, authMode: 2, subjects: null, targets: null, auxiliaryType: undefined, fabricIndex: 1 },
        ]);

        const fabric2Acls = await readAcls(node, fabric2, true);
        expect(fabric2Acls).deep.equals([
            { privilege: 5, authMode: 2, subjects: null, targets: null, auxiliaryType: undefined, fabricIndex: 2 },
        ]);

        const allAclsReadAsFabric1 = await readAcls(node, fabric1, false);

        expect(allAclsReadAsFabric1).deep.equals([
            { privilege: 5, authMode: 2, subjects: null, targets: null, auxiliaryType: undefined, fabricIndex: 1 },
            {
                privilege: undefined,
                authMode: undefined,
                subjects: undefined,
                targets: undefined,
                auxiliaryType: undefined,
                fabricIndex: 2,
            },
        ]);

        const fabric1Nocs = await readNocs(node, fabric1, true);
        expect(fabric1Nocs.length).equals(1);
        expect(fabric1Nocs[0].fabricIndex).equals(1);
        expect(fabric1Nocs[0].noc instanceof Uint8Array).to.be.true;
        const fabric2Nocs = await readNocs(node, fabric2, true);
        expect(fabric2Nocs.length).equals(1);
        expect(fabric2Nocs[0].fabricIndex).equals(2);
        expect(fabric2Nocs[0].noc instanceof Uint8Array).to.be.true;

        await node.close();
    });

    it("properly handles subscribe and notify of attributes and events", async () => {
        const node = await MockServerNode.createOnline();

        const fabric1 = await node.addFabric();

        // Create a subscription to a couple of attributes and an event
        await interaction.subscribe(node, fabric1, {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: false,
            attributeRequests: [FABRICS_PATH, NOCS_PATH, COMMISSIONED_FABRICS_PATH],
            eventRequests: [LEAVE_PATH],
            keepSubscriptions: true,
            minIntervalFloorSeconds: 1,
            maxIntervalCeilingSeconds: 2,
        });

        // NOCs carries the "changes omitted" quality, so its subscription path stays silent
        const fabricAdded = interaction.receiveData(node, 2, 0);

        // Create another fabric so we can capture subscription messages
        const fabric2 = await node.addFabric();
        let report = await MockTime.resolve(fabricAdded);
        expect(report.attributes.map(({ attributeData }) => attributeData?.path)).deep.equals([
            FABRICS_PATH,
            COMMISSIONED_FABRICS_PATH,
        ]);
        expect(report.events.length).equals(0);

        const fabricsReport = report.attributes[0]?.attributeData;
        const decodedFabrics =
            fabricsReport?.data && TlvOfModel(OperationalCredentials.attributes.fabrics).decodeTlv(fabricsReport?.data);
        expect((decodedFabrics as { fabricIndex: number }[])?.map(({ fabricIndex }) => fabricIndex)).deep.equals([
            1, 2,
        ]);

        const commissionedFabricsReport = report.attributes[1]?.attributeData;

        const commissionedFabricCount =
            commissionedFabricsReport?.data &&
            TlvOfModel(OperationalCredentials.attributes.commissionedFabrics).decodeTlv(commissionedFabricsReport.data);
        expect(commissionedFabricCount).deep.equals(2);

        // Remove the second fabric so we can capture the leave event notification
        const fabricRemoved = interaction.receiveData(node, 2, 1);

        await MockTime.resolve(fabric2.leave());

        report = await MockTime.resolve(fabricRemoved);

        // Confirm we received leave event for second fabric
        const leaveReport = report.events[0]?.eventData;
        expect(leaveReport?.path).deep.equals(LEAVE_PATH);
        expect(leaveReport?.data && TlvOfModel(BasicInformation.events.leave).decodeTlv(leaveReport?.data)).deep.equals(
            {
                fabricIndex: 2,
            },
        );

        await node.close();
    });

    it("indicates support only for implemented commands", async () => {
        class MyServer extends WifiCommissioningServer {
            override scanNetworks(): NetworkCommissioning.ScanNetworksResponse {
                return {
                    networkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                };
            }
        }

        const MyDevice = OnOffLightDevice.with(MyServer);

        await using node = await MockServerNode.createOnline(undefined, { device: MyDevice });

        const fabric = await node.addFabric();

        const commands = await interaction.read(node, fabric, false, {
            endpointId: EndpointNumber(1),
            clusterId: ClusterId(NetworkCommissioning.id),
            attributeId: AttributeId(AcceptedCommandList.id),
        });

        expect(commands).deep.equals([NetworkCommissioning.commands.scanNetworks.id]);

        const commandResponds = await interaction.read(node, fabric, false, {
            endpointId: EndpointNumber(1),
            clusterId: ClusterId(NetworkCommissioning.id),
            attributeId: AttributeId(GeneratedCommandList.id),
        });

        expect(commandResponds).deep.equals([NetworkCommissioning.schema.commands.require("ScanNetworksResponse").id]);
    });

    it("publishes correct feature map", async () => {
        const MyServer = OnOffServer.with("Lighting");

        const MyDevice = OnOffLightDevice.with(MyServer);

        await using node = await MockServerNode.createOnline(undefined, { device: MyDevice });

        const featureMap = await interaction.read(node, await node.addFabric(), false, {
            endpointId: EndpointNumber(1),
            clusterId: ClusterId(OnOff.id),
            attributeId: AttributeId(FeatureMap.id),
        });

        expect(() => {
            TlvOfModel(OnOff.schema.attributes.require("FeatureMap")).validate(featureMap);
        }).not.throws();

        expect({ ...featureMap }).deep.equals({
            lighting: true,
            deadFrontBehavior: false,
            offOnly: false,
        });
    });

    describe("invoke", () => {
        async function invokeOffWithEffect(request: { effectIdentifier: number; effectVariant: number }) {
            let received: undefined | OnOff.OffWithEffectRequest;
            let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;

            class MyServer extends OnOffServer.with("Lighting") {
                override offWithEffect(request: OnOff.OffWithEffectRequest) {
                    received = request;
                }
            }

            await using node = await MockServerNode.createOnline(undefined, {
                device: OnOffLightDevice.with(MyServer),
            });

            await interaction.invoke(
                node,
                await node.addFabric(),
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: OnOff.id,
                        commandId: CommandId(OnOff.commands.offWithEffect.id),
                    },
                    commandFields: TlvOfModel(OnOff.commands.offWithEffect).encodeTlv(request),
                },
                response => {
                    sent = response;
                },
            );

            // Nice, three nested fields called "status"
            return { received, status: sent?.status?.status.status };
        }

        it("invokes", async () => {
            const { received, status } = await invokeOffWithEffect({ effectIdentifier: 0, effectVariant: 1 });

            expect(received).deep.equals({ effectIdentifier: 0, effectVariant: 1 });
            expect(status).equals(Status.Success);
        });

        it("refuses a request with an enum value the enum does not define with CONSTRAINT_ERROR", async () => {
            const { received, status } = await invokeOffWithEffect({ effectIdentifier: 2, effectVariant: 0 });

            expect(received).undefined;
            expect(status).equals(Status.ConstraintError);
        });

        it("refuses an undefined enum value also when an earlier field has an error that only gets a warning", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            await node.add(
                ExtendedColorLightDevice.with(ColorControlServer.with("HueSaturation", "EnhancedHue", "ColorLoop")),
                {
                    colorControl: {
                        colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                        enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
                        numberOfPrimaries: 0,
                    },
                },
            );

            let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
            await interaction.invoke(
                node,
                await node.addFabric(),
                {
                    commandPath: {
                        endpointId: EndpointNumber(1),
                        clusterId: ColorControl.id,
                        commandId: CommandId(ColorControl.schema.commands.require("ColorLoopSet").id),
                    },
                    // UpdateFlags carries a reserved bit, and Action is undefined
                    commandFields: TlvObject({
                        updateFlags: TlvField(0, TlvUInt8),
                        action: TlvField(1, TlvUInt8),
                        direction: TlvField(2, TlvUInt8),
                        time: TlvField(3, TlvUInt16),
                        startHue: TlvField(4, TlvUInt16),
                        optionsMask: TlvField(5, TlvUInt8),
                        optionsOverride: TlvField(6, TlvUInt8),
                    }).encodeTlv({
                        updateFlags: 0x11,
                        action: 3,
                        direction: 0,
                        time: 0,
                        startHue: 0,
                        optionsMask: 0,
                        optionsOverride: 0,
                    }),
                },
                response => {
                    sent = response;
                },
            );

            expect(sent?.status?.status.status).equals(Status.ConstraintError);
        });

        it("accepts any value for an enum that defines no values", async () => {
            using log = captureLog(LogLevel.WARN);
            const { received, status } = await invokeOffWithEffect({ effectIdentifier: 0, effectVariant: 7 });

            expect(received).deep.equals({ effectIdentifier: 0, effectVariant: 7 });
            expect(status).equals(Status.Success);
            expect(log.messages.filter(message => message.includes("Request validation error"))).deep.equals([]);
        });

        describe("with cluster-specific handling of invalid requests", () => {
            async function invokeOnNode(
                node: MockServerNode,
                endpointId: number,
                cluster: { id: ClusterId; schema: ClusterModel },
                commandName: string,
                fields?: Record<string, unknown>,
                fieldsTlv: TlvSchema<unknown> = TlvOfModel(cluster.schema.commands.require(commandName)),
            ) {
                let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
                await interaction.invoke(
                    node,
                    await node.addFabric(),
                    {
                        commandPath: {
                            endpointId: EndpointNumber(endpointId),
                            clusterId: cluster.id,
                            commandId: CommandId(cluster.schema.commands.require(commandName).id),
                        },
                        commandFields: fields === undefined ? undefined : fieldsTlv.encodeTlv(fields),
                    },
                    response => {
                        sent = response;
                    },
                );
                return sent;
            }

            it("answers an undefined certificate type with INVALID_COMMAND", async () => {
                await using node = await MockServerNode.createOnline();
                const sent = await invokeOnNode(node, 0, OperationalCredentials, "CertificateChainRequest", {
                    certificateType: 3,
                });

                expect(sent?.status?.status.status).equals(Status.InvalidCommand);
            });

            it("keeps the TLV check for a command without configuration in a cluster with configured commands", async () => {
                await using node = await MockServerNode.createOnline();
                const sent = await invokeOnNode(
                    node,
                    0,
                    OperationalCredentials,
                    "AttestationRequest",
                    {},
                    TlvObject({}),
                );

                expect(sent?.status?.status.status).equals(Status.InvalidCommand);
            });

            it("answers an undefined regulatory location with ValueOutsideRange in the response", async () => {
                await using node = await MockServerNode.createOnline();
                const sent = await invokeOnNode(node, 0, GeneralCommissioning, "SetRegulatoryConfig", {
                    newRegulatoryConfig: 3,
                    countryCode: "XX",
                    breadcrumb: 1,
                });

                expect(sent?.command?.commandFields).not.undefined;
                const { errorCode } = TlvObject({ errorCode: TlvField(0, TlvUInt8) }).decodeTlv(
                    sent!.command!.commandFields!,
                );
                expect(errorCode).equals(GeneralCommissioning.CommissioningError.ValueOutsideRange);
            });

            it("answers a missing mandatory field with INVALID_COMMAND for a command with a field override", async () => {
                await using node = await MockServerNode.createOnline();
                const sent = await invokeOnNode(
                    node,
                    0,
                    GeneralCommissioning,
                    "SetRegulatoryConfig",
                    { countryCode: "XX", breadcrumb: 1 },
                    TlvObject({ countryCode: TlvField(1, TlvString), breadcrumb: TlvField(2, TlvUInt8) }),
                );

                expect(sent?.status?.status.status).equals(Status.InvalidCommand);
            });

            it("accepts an identify effect the enum does not define", async () => {
                await using node = await MockServerNode.createOnline();

                const sent = await invokeOnNode(node, 1, Identify, "TriggerEffect", {
                    effectIdentifier: 3,
                    effectVariant: Identify.EffectVariant.Default,
                });

                expect(sent?.status?.status.status).equals(Status.Success);
            });

            it("runs the default identify effect variant for a variant the enum does not define", async () => {
                await using node = await MockServerNode.createOnline();
                const triggered = new Array<Identify.TriggerEffectRequest>();
                node.endpoints
                    .for(1)
                    .eventsOf(IdentifyServer)
                    .effectTriggered.on(effect => {
                        triggered.push(effect);
                    });

                const sent = await invokeOnNode(node, 1, Identify, "TriggerEffect", {
                    effectIdentifier: Identify.EffectIdentifier.Blink,
                    effectVariant: 0x42,
                });

                expect(sent?.status?.status.status).equals(Status.Success);
                expect(triggered).deep.equals([
                    {
                        effectIdentifier: Identify.EffectIdentifier.Blink,
                        effectVariant: Identify.EffectVariant.Default,
                    },
                ]);
            });
        });
    });

    it("excludes deprecated global attributes like EventList from protocol", async () => {
        const node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightDevice.with(OnOffServer),
        });

        // Verify no cluster on any endpoint exposes EventList (deprecated, conformance "D").
        // On the client side, a remote device may report EventList in its attributeList causing
        // it to appear in supportedElements.  Without the deprecated-element guard in
        // clusterTypeProtocolOf this would crash with "No metabase for model EventList" because
        // the deprecated attribute has no type definition.
        for (const ep of node.protocol) {
            for (const cluster of ep) {
                expect(
                    cluster.type.attributes[EventList.id],
                    `cluster ${cluster.type.id} on endpoint ${ep.id} should not expose deprecated EventList`,
                ).to.be.undefined;
            }
        }

        // Verify the deprecated EventList model is present but has no type (TlvOfModel returns TlvAny
        // as a fallback rather than throwing, but the guard in clusterTypeProtocolOf still correctly
        // excludes it from protocol)
        const onOffSchema = OnOff.schema;
        const eventListModel = onOffSchema.attributes.find(m => m.id === EventList.id);
        expect(eventListModel, "EventList should be present as unfiltered member").to.exist;
        expect(eventListModel!.isDeprecated, "EventList should be deprecated").to.be.true;

        await node.close();
    });

    it("tags manufacturer-specific attributes in a standard cluster with skipCustomElements", async () => {
        const meiAttributeId = AttributeId(0xfff1_0001);

        // Standard-range cluster id so the cluster itself is not flagged as custom; the MEI prefix lives only on the
        // attribute id, exercising the per-attribute branch of WildcardSkipCustomElements (core spec § 8.2.1.7.1).
        const schema = new ClusterModel({
            id: 0x1234,
            name: "MeiAttrCluster",
            revision: 1,
            children: [
                AttributeElement({ id: 0, name: "Standard", type: "uint8", conformance: "M", default: 0 }),
                AttributeElement({ id: meiAttributeId, name: "Custom", type: "uint8", conformance: "M", default: 0 }),
            ],
        });

        const ClusterType_ = ClusterType(schema) as ClusterType.Concrete;
        const Behavior = ClusterBehavior.for(ClusterType_);
        const Device = MutableEndpoint({ name: "MeiAttrDevice", deviceType: 0xfff1_fc02, deviceRevision: 1 });
        const node = await MockServerNode.createOnline(undefined, { device: Device.with(Behavior) });

        let attr: { wildcardPathFlags: number } | undefined;
        for (const ep of node.protocol) {
            const cluster = ep[ClusterId(0x1234)];
            if (cluster) {
                attr = cluster.type.attributes[meiAttributeId];
                break;
            }
        }

        expect(attr, "MEI attribute should be present in protocol").to.exist;
        const flags = BitmapSchema(WildcardPathFlagsBitmap).decode(attr!.wildcardPathFlags);
        expect(flags.skipCustomElements, "MEI attribute must be flagged skipCustomElements").to.be.true;
        expect(flags.skipGlobalAttributes, "MEI attribute must not be flagged skipGlobalAttributes").to.be.false;

        await node.close();
    });

    it("shares one state reference between local reads without a transaction", async () => {
        const node = await MockServerNode.createOnline();

        const nodeLabel = BasicInformation.attributes.nodeLabel.id;
        const basicInformation = node.protocol[0]?.[BasicInformation.id];
        expect(basicInformation).not.undefined;
        const first = basicInformation!.readState({});
        for (let i = 0; i < 10; i++) {
            expect(basicInformation!.readState({})).equals(first);
        }
        expect(basicInformation!.readState({ abort: new AbortController().signal, fabricFiltered: false })).equals(
            first,
        );

        await node.set({ basicInformation: { nodeLabel: "relabelled" } });
        expect(first[nodeLabel]).equals("relabelled");
        expect(basicInformation!.readState({})[nodeLabel]).equals("relabelled");

        await node.close();
    });

    it("requires a transaction to read cluster state for a remote subject", async () => {
        const node = await MockServerNode.createOnline();

        const basicInformation = node.protocol[0]?.[BasicInformation.id];
        expect(basicInformation).not.undefined;
        expect(() =>
            basicInformation!.readState({
                fabric: FabricIndex(1),
                subject: Subject.Node({ id: NodeId(1) }),
                authorityAt: () => ProtocolAccessControl.Authority.Granted,
            }),
        ).throws(ImplementationError, /remote subject/);

        await node.close();
    });

    it("all attribute TLV schemas can encode their values", async () => {
        const node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightDevice.with(OnOffServer),
        });

        // Wildcard read of all attributes
        const { data } = await readAllAttrs(node);

        let encoded = 0;
        for (const chunk of data) {
            for await (const report of chunk) {
                if (report.kind !== "attr-value") {
                    continue;
                }

                const { path, value, tlv } = report;
                const desc = `${path.endpointId}/${path.clusterId}/${path.attributeId}`;

                // Every attr-value report must have a TLV schema
                expect(tlv, `${desc} missing tlv`).to.exist;

                // The TLV schema must be able to encode the value into a TLV stream
                expect(() => {
                    tlv.encodeTlv(value);
                }, `${desc} encodeTlv failed`).to.not.throw();

                // The encoded TLV stream must be serializable to bytes (catches bad values
                // in the stream like objects where primitives are expected)
                const stream = tlv.encodeTlv(value);
                expect(() => TlvAny.encode(stream), `${desc} encode failed`).to.not.throw();

                encoded++;
            }
        }

        expect(encoded).to.be.greaterThan(0);

        await node.close();
    });
});

describe("command validation", () => {
    testCommandValidation();
});

function testCommandValidation() {
    // TLV schemas for request and response
    const TlvTestRequest = TlvObject({ enable: TlvField(0, TlvBoolean), value: TlvField(1, TlvUInt8) });
    // Schema with qualified conformance: response field "Result" is mandatory when "TestRequest.Enable" is true
    const TestSchema = new ClusterModel({
        id: 0xfff1_fc01,
        name: "TestCluster",
        children: [
            CommandElement(
                { id: 1, name: "TestRequest", response: "TestResponse", conformance: "M" },
                FieldElement({ id: 0, name: "Enable", type: "bool", conformance: "M" }),
                FieldElement({ id: 1, name: "Value", type: "uint8", conformance: "M", constraint: "max 10" }),
            ),
            CommandElement(
                { id: 1, name: "TestResponse", direction: "response", conformance: "M" },
                FieldElement({ id: 0, name: "Result", type: "uint8", conformance: "TestRequest.Enable" }),
            ),
        ],
    });

    // Cluster type from schema
    interface TestInterface {
        Components: [
            {
                flags: {};
                commands: {
                    testRequest(request: { enable: boolean; value: number }): MaybePromise<{ result?: number }>;
                };
            },
        ];
    }

    const TestCluster = ClusterType(TestSchema) as ClusterType.Concrete & { Typing: TestInterface };
    const TestBehavior = ClusterBehavior.for(TestCluster);

    // Endpoint type
    const TestDevice = MutableEndpoint({ name: "TestDevice", deviceType: 0xfff1_fc01, deviceRevision: 1 });

    it("validates response with qualified conformance", async () => {
        // Behavior that returns result when enable=true
        class TestServer extends TestBehavior {
            override testRequest(request: { enable: boolean; value: number }) {
                if (request.enable) {
                    return { result: request.value };
                }
                return {};
            }
        }

        const device = TestDevice.with(TestServer);
        const node = await MockServerNode.createOnline(undefined, { device });

        // Invoke with enable=true; response includes result — should succeed
        let hasCommandResponse = false;
        await interaction.invoke(
            node,
            await node.addFabric(),
            {
                commandPath: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(TestCluster.id),
                    commandId: CommandId(TestCluster.commands!.testRequest.id),
                },
                commandFields: TlvTestRequest.encodeTlv({ enable: true, value: 5 }),
            },
            response => {
                hasCommandResponse = response?.command !== undefined;
            },
        );

        // Successful invoke returns a command response (not a status response)
        expect(hasCommandResponse).equals(true);

        await node.close();
    });

    it("rejects request with constraint violation", async () => {
        class TestServer extends TestBehavior {
            override testRequest(request: { enable: boolean; value: number }) {
                return { result: request.value };
            }
        }

        const device = TestDevice.with(TestServer);
        const node = await MockServerNode.createOnline(undefined, { device });

        let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;

        // Send value=99 which violates the "max 10" constraint on Value
        await interaction.invoke(
            node,
            await node.addFabric(),
            {
                commandPath: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(TestCluster.id),
                    commandId: CommandId(TestCluster.commands!.testRequest.id),
                },
                commandFields: TlvTestRequest.encodeTlv({ enable: true, value: 99 }),
            },
            response => {
                sent = response;
            },
        );

        // Constraint violation returns a status error, not a command response
        expect(sent?.status?.status?.status).equals(Status.ConstraintError);

        await node.close();
    });

    it("rejects response missing required field per qualified conformance", async () => {
        // Behavior that always omits result, even when enable=true
        class BadTestServer extends TestBehavior {
            override testRequest(_request: { enable: boolean; value: number }) {
                return {};
            }
        }

        const device = TestDevice.with(BadTestServer);
        const node = await MockServerNode.createOnline(undefined, { device });

        let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
        await interaction.invoke(
            node,
            await node.addFabric(),
            {
                commandPath: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(TestCluster.id),
                    commandId: CommandId(TestCluster.commands!.testRequest.id),
                },
                commandFields: TlvTestRequest.encodeTlv({ enable: true, value: 5 }),
            },
            response => {
                sent = response;
            },
        );

        expect(sent?.status?.status.status).equals(Status.Failure);

        await node.close();
    });
}
