/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffServer } from "#behaviors/on-off";
import { AccessControl } from "#clusters/access-control";
import { BasicInformation } from "#clusters/basic-information";
import { NetworkCommissioning } from "#clusters/network-commissioning";
import { OnOff } from "#clusters/on-off";
import { OperationalCredentials } from "#clusters/operational-credentials";
import { OnOffLightDevice } from "#devices/on-off-light";
import { AcceptedCommandList, FeatureMap, GeneratedCommandList, Specification } from "#model";
import { Fabric } from "#protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    Status,
    TlvArray,
    TlvEnum,
    TlvField,
    TlvInvokeResponseData,
    TlvNullable,
    TlvObject,
    TlvSubjectId,
    TypeFromSchema,
} from "#types";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";

const FABRICS_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: OperationalCredentials.Cluster.id,
    attributeId: OperationalCredentials.Cluster.attributes.fabrics.id,
};

const NOCS_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: OperationalCredentials.Cluster.id,
    attributeId: OperationalCredentials.Cluster.attributes.nocs.id,
};

const COMMISSIONED_FABRICS_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: OperationalCredentials.Cluster.id,
    attributeId: OperationalCredentials.Cluster.attributes.commissionedFabrics.id,
};

const LEAVE_PATH = {
    endpointId: EndpointNumber(0),
    clusterId: BasicInformation.Cluster.id,
    eventId: BasicInformation.Cluster.events.leave.id,
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
const AcesWithoutFabric = TlvObject({
    privilege: TlvField(1, TlvEnum<AccessControl.AccessControlEntryPrivilege>()),
    authMode: TlvField(2, TlvEnum<AccessControl.AccessControlEntryAuthMode>()),
    subjects: TlvField(3, TlvNullable(TlvArray(TlvSubjectId))),
    targets: TlvField(4, TlvNullable(TlvArray(AccessControl.TlvAccessControlTarget))),
});

async function writeAcl(node: MockServerNode, fabric: Fabric, acl: TypeFromSchema<typeof AcesWithoutFabric>) {
    await interaction.write(node, fabric, {
        path: {
            endpointId: EndpointNumber(0),
            clusterId: ClusterId(AccessControl.Cluster.id),
            attributeId: AttributeId(AccessControl.Cluster.attributes.acl.id),
        },
        data: TlvArray(AcesWithoutFabric).encodeTlv([acl]),
    });
}

async function readAcls(node: MockServerNode, fabric: Fabric, isFabricFiltered: boolean) {
    return await interaction.read(node, fabric, isFabricFiltered, {
        endpointId: EndpointNumber(0),
        clusterId: AccessControl.Cluster.id,
        attributeId: AttributeId(AccessControl.Cluster.attributes.acl.id),
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
            { privilege: 5, authMode: 2, subjects: null, targets: null, fabricIndex: 1 },
            { privilege: 5, authMode: 2, subjects: null, targets: null, fabricIndex: 2 },
        ]);

        const fabric1Acls = await readAcls(node, fabric1, true);

        expect(fabric1Acls).deep.equals([{ privilege: 5, authMode: 2, subjects: null, targets: null, fabricIndex: 1 }]);

        const fabric2Acls = await readAcls(node, fabric2, true);
        expect(fabric2Acls).deep.equals([{ privilege: 5, authMode: 2, subjects: null, targets: null, fabricIndex: 2 }]);

        const allAclsReadAsFabric1 = await readAcls(node, fabric1, false);

        expect(allAclsReadAsFabric1).deep.equals([
            { privilege: 5, authMode: 2, subjects: null, targets: null, fabricIndex: 1 },
            { privilege: undefined, authMode: undefined, subjects: undefined, targets: undefined, fabricIndex: 2 },
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

        // Handle an updated report
        const fabricAdded = interaction.receiveData(node, 3, 0);

        // Create another fabric so we can capture subscription messages
        const fabric2 = await node.addFabric();
        let report = await MockTime.resolve(fabricAdded);
        expect(report.attributes.length).equals(3);
        expect(report.events.length).equals(0);

        const fabricsReport = report.attributes[0]?.attributeData;
        expect(fabricsReport?.path).deep.equals(FABRICS_PATH);
        const decodedFabrics =
            fabricsReport?.data &&
            OperationalCredentials.Cluster.attributes.fabrics.schema.decodeTlv(fabricsReport?.data);
        expect(decodedFabrics?.map(({ fabricIndex }) => fabricIndex)).deep.equals([1, 2]);

        const nocsReport = report.attributes[1]?.attributeData;
        expect(nocsReport?.path).deep.equals(NOCS_PATH);

        const commissionedFabricsReport = report.attributes[2]?.attributeData;
        expect(commissionedFabricsReport?.path).deep.equals(COMMISSIONED_FABRICS_PATH);

        const commissionedFabricCount =
            commissionedFabricsReport?.data &&
            OperationalCredentials.Cluster.attributes.commissionedFabrics.schema.decodeTlv(
                commissionedFabricsReport.data,
            );
        expect(commissionedFabricCount).deep.equals(2);

        // Remove the second fabric so we can capture the leave event notification
        const fabricRemoved = interaction.receiveData(node, 3, 1);

        await MockTime.resolve(fabric2.delete());

        report = await MockTime.resolve(fabricRemoved);

        // Confirm we received leave event for second fabric
        const leaveReport = report.events[0]?.eventData;
        expect(leaveReport?.path).deep.equals(LEAVE_PATH);
        expect(
            leaveReport?.data && BasicInformation.Cluster.events.leave.schema.decodeTlv(leaveReport?.data),
        ).deep.equals({
            fabricIndex: 2,
        });

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

        const node = await MockServerNode.createOnline(undefined, { device: MyDevice });

        const fabric = await node.addFabric();

        const commands = await interaction.read(node, fabric, false, {
            endpointId: EndpointNumber(1),
            clusterId: ClusterId(NetworkCommissioning.Cluster.id),
            attributeId: AttributeId(AcceptedCommandList.id),
        });

        expect(commands).deep.equals([
            NetworkCommissioning.WiFiNetworkInterfaceOrThreadNetworkInterfaceComponent.commands.scanNetworks.requestId,
        ]);

        const commandResponds = await interaction.read(node, fabric, false, {
            endpointId: EndpointNumber(1),
            clusterId: ClusterId(NetworkCommissioning.Cluster.id),
            attributeId: AttributeId(GeneratedCommandList.id),
        });

        expect(commandResponds).deep.equals([
            NetworkCommissioning.WiFiNetworkInterfaceOrThreadNetworkInterfaceComponent.commands.scanNetworks.responseId,
        ]);
    });

    it("publishes correct feature map", async () => {
        const MyServer = OnOffServer.with("Lighting");

        const MyDevice = OnOffLightDevice.with(MyServer);

        const node = await MockServerNode.createOnline(undefined, { device: MyDevice });

        const featureMap = await interaction.read(node, await node.addFabric(), false, {
            endpointId: EndpointNumber(1),
            clusterId: ClusterId(OnOff.Cluster.id),
            attributeId: AttributeId(FeatureMap.id),
        });

        expect(() => {
            OnOff.Cluster.attributes.featureMap.schema.validate(featureMap);
        }).not.throws();

        expect({ ...featureMap }).deep.equals({
            lighting: true,
            deadFrontBehavior: false,
            offOnly: false,
        });
    });

    it("invokes", async () => {
        let received: undefined | OnOff.OffWithEffectRequest;
        let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;

        class MyServer extends OnOffServer.with("Lighting") {
            override offWithEffect(request: OnOff.OffWithEffectRequest) {
                received = request;
            }
        }

        const MyDevice = OnOffLightDevice.with(MyServer);

        const node = await MockServerNode.createOnline(undefined, { device: MyDevice });

        await interaction.invoke(
            node,
            await node.addFabric(),
            {
                commandPath: {
                    endpointId: EndpointNumber(1),
                    clusterId: OnOff.Cluster.id,
                    commandId: CommandId(OnOff.LightingComponent.commands.offWithEffect.requestId),
                },

                commandFields: OnOff.TlvOffWithEffectRequest.encodeTlv({
                    effectIdentifier: 0,
                    effectVariant: 1,
                }),
            },
            response => {
                sent = response;
            },
        );

        expect(received).deep.equals({ effectIdentifier: 0, effectVariant: 1 });

        // Nice, three nested fields called "status"
        expect(sent?.status?.status.status).deep.equals(Status.Success);
    });
});
