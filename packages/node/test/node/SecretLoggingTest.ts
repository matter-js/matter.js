/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ThreadNetworkDirectoryServer } from "#behaviors/thread-network-directory";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { Bytes, Crypto, Diagnostic, LogDestination, LogFormat, Logger, LogLevel, Seconds } from "@matter/general";
import { attribute, cluster, listOf, octstr, secret, SecretRedaction, Specification, writable } from "@matter/model";
import { interaction, MockServerNode, MockSite } from "@matter/node/testing";
import { Invoke } from "@matter/protocol";
import { AttributeId, ClusterId, EndpointNumber, TlvArray, TlvByteString } from "@matter/types";
import { GeneralDiagnostics } from "@matter/types/clusters/general-diagnostics";
import { ThreadNetworkDirectory } from "@matter/types/clusters/thread-network-directory";

const DATASET = Bytes.fromHex("0e080000000000010000000300000f35060004001fffe0");
const EXTENDED_PAN_ID = Bytes.fromHex("dead00beef00cafe");

class StoringDirectoryServer extends ThreadNetworkDirectoryServer {
    override addNetwork() {}

    override getOperationalDataset() {
        return { operationalDataset: DATASET };
    }
}

const KEY = Bytes.fromHex("00112233445566778899aabbccddeeff");
const SECRETS_CLUSTER_ID = ClusterId(0xfff1fc01);

/**
 * A manufacturer-specific cluster with a secret attribute and a secret list attribute.
 */
@cluster(SECRETS_CLUSTER_ID, "Secrets")
class SecretsServer extends ClusterBehavior {
    static override readonly id = "secrets";

    declare state: SecretsServer.State;
}

namespace SecretsServer {
    export class State {
        @attribute(0, octstr, writable, secret)
        key = Bytes.empty;

        @attribute(1, listOf(octstr), writable, secret)
        keys = new Array<Bytes>();
    }
}

/**
 * Every message logged at any level while {@link actor} runs, rendered as plain text.
 */
async function capturedLog(actor: () => Promise<void>) {
    const lines = new Array<string>();
    Logger.destinations.capture = LogDestination({
        level: LogLevel.DEBUG,
        add(message: Diagnostic.Message) {
            lines.push(LogFormat.formats.plain(message));
        },
    });
    try {
        await actor();
    } finally {
        delete Logger.destinations.capture;
    }
    return lines;
}

async function drain(results: AsyncIterable<unknown>) {
    for await (const _chunk of results);
}

/**
 * The single captured line that contains {@link text}.
 */
function lineOf(lines: string[], text: string) {
    const matching = lines.filter(line => line.includes(text));
    expect(matching.length, `lines containing ${text}`).equals(1);
    return matching[0];
}

function setEntropic(crypto: Crypto, entropic: boolean) {
    if ("entropic" in crypto) {
        crypto.entropic = entropic;
    }
}

describe("SecretLogging", () => {
    before(() => {
        MockTime.init();
    });

    it("logs no secret command field on controller or device", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint, device: OnOffLightDevice.with(StoringDirectoryServer) },
        });
        const peer = controller.peers.get("peer1")!;

        const lines = await capturedLog(async () => {
            await MockTime.resolve(
                drain(
                    peer.interaction.invoke(
                        Invoke(
                            Invoke.ConcreteCommandRequest({
                                endpoint: EndpointNumber(1),
                                cluster: ThreadNetworkDirectory,
                                command: "addNetwork",
                                fields: { operationalDataset: DATASET },
                            }),
                        ),
                    ),
                ),
            );
            await MockTime.resolve(
                drain(
                    peer.interaction.invoke(
                        Invoke(
                            Invoke.ConcreteCommandRequest({
                                endpoint: EndpointNumber(1),
                                cluster: ThreadNetworkDirectory,
                                command: "getOperationalDataset",
                                fields: { extendedPanId: EXTENDED_PAN_ID },
                            }),
                        ),
                    ),
                ),
            );
        });

        const { PLACEHOLDER } = SecretRedaction;
        expect(lineOf(lines, "addNetwork with")).contains(`operationalDataset: ${PLACEHOLDER}`);
        expect(lineOf(lines, "Invoke « device2.part0.threadNetworkDirectory.addNetwork")).contains(
            `operationalDataset: ${PLACEHOLDER}`,
        );
        expect(lineOf(lines, "Invoke » device2.part0.threadNetworkDirectory.getOperationalDataset")).contains(
            `operationalDataset: ${PLACEHOLDER}`,
        );
        expect(lineOf(lines, "getOperationalDataset operationalDataset")).contains(
            `operationalDataset: ${PLACEHOLDER}`,
        );
        expect(lineOf(lines, "getOperationalDataset with")).contains(Bytes.toHex(EXTENDED_PAN_ID));
        expect(lines.filter(line => line.includes(Bytes.toHex(DATASET)))).deep.equals([]);
    });

    it("logs no secret command field of an invoke split into batches", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                device: OnOffLightDevice.with(StoringDirectoryServer),
                basicInformation: { maxPathsPerInvoke: 1 },
            },
        });
        const peer = controller.peers.get("peer1")!;

        const lines = await capturedLog(async () => {
            await MockTime.resolve(
                drain(
                    peer.interaction.invoke(
                        Invoke({
                            commands: [
                                Invoke.ConcreteCommandRequest({
                                    endpoint: EndpointNumber(0),
                                    cluster: GeneralDiagnostics,
                                    command: "testEventTrigger",
                                    fields: { enableKey: KEY, eventTrigger: 1n },
                                    commandRef: 1,
                                }),
                                Invoke.ConcreteCommandRequest({
                                    endpoint: EndpointNumber(1),
                                    cluster: ThreadNetworkDirectory,
                                    command: "addNetwork",
                                    fields: { operationalDataset: DATASET },
                                    commandRef: 2,
                                }),
                            ],
                        }),
                    ),
                ),
            );
        });

        const { PLACEHOLDER } = SecretRedaction;
        expect(lineOf(lines, "testEventTrigger with")).contains(`enableKey: ${PLACEHOLDER}`);
        expect(lineOf(lines, "addNetwork with")).contains(`operationalDataset: ${PLACEHOLDER}`);
        expect(
            lines.filter(line => line.includes(Bytes.toHex(KEY)) || line.includes(Bytes.toHex(DATASET))),
        ).deep.equals([]);
    });

    it("logs no secret of the commissioning options", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addUncommissionedPair();
        await controller.start();
        const { passcode, discriminator } = device.state.commissioning;
        const wifiCredentials = "wifi-password";
        const operationalDataset = Bytes.toHex(DATASET);

        let lines: string[];
        try {
            setEntropic(controller.env.get(Crypto), true);
            setEntropic(device.env.get(Crypto), true);
            lines = await capturedLog(async () => {
                await MockTime.resolve(
                    controller.peers.commission({
                        passcode,
                        discriminator,
                        timeout: Seconds(90),
                        wifiNetwork: { wifiSsid: "ssid", wifiCredentials },
                        threadNetwork: { networkName: "thread", operationalDataset },
                    }),
                    { macrotasks: true },
                );
            });
        } finally {
            setEntropic(controller.env.get(Crypto), false);
            setEntropic(device.env.get(Crypto), false);
        }

        expect(lineOf(lines, "Commissioning options")).contains("wifiSsid: ssid");
        expect(lineOf(lines, "addNoc with")).contains(`ipkValue: ${SecretRedaction.PLACEHOLDER}`);
        const secrets = [
            wifiCredentials,
            Bytes.toHex(Bytes.fromString(wifiCredentials)),
            operationalDataset,
            "identityProtectionKey",
            String(passcode),
        ];
        expect(lines.filter(line => secrets.some(secret => line.includes(secret)))).deep.equals([]);
    });

    it("logs no secret attribute value a device receives in a write or returns for a read", async () => {
        await using node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightDevice.with(SecretsServer),
        });
        const fabric = await node.addFabric();
        const path = (attributeId: number, listIndex?: null) => ({
            endpointId: EndpointNumber(1),
            clusterId: SECRETS_CLUSTER_ID,
            attributeId: AttributeId(attributeId),
            listIndex,
        });

        const lines = await capturedLog(async () => {
            await interaction.write(node, fabric, { path: path(0), data: TlvByteString.encodeTlv(KEY) });

            // A list ADD is only accepted after a REPLACE of the same list in the same message
            const { exchange, interactionServer } = await interaction.connect(node, fabric);
            await interactionServer.handleWriteRequest(
                exchange,
                {
                    suppressResponse: true,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    timedRequest: false,
                    writeRequests: [
                        { path: path(1), data: TlvArray(TlvByteString).encodeTlv([]) },
                        { path: path(1, null), data: TlvByteString.encodeTlv(KEY) },
                    ],
                },
                interaction.BarelyMockedMessenger,
                interaction.BarelyMockedMessage,
            );

            await interaction.read(node, fabric, false, path(0));
        });

        const { PLACEHOLDER } = SecretRedaction;
        expect(lineOf(lines, "Writing attribute 1.secrets.state.key=")).contains(PLACEHOLDER);
        expect(lineOf(lines, "Writing attribute 1.secrets.state.keys=")).contains(PLACEHOLDER);
        expect(lineOf(lines, "Writing attribute chunk")).contains(PLACEHOLDER);
        expect(lineOf(lines, "Reading attribute 1.secrets.state.key=")).contains(PLACEHOLDER);
        expect(lines.filter(line => line.includes(Bytes.toHex(KEY)))).deep.equals([]);
    });

    it("shows no secret attribute value in endpoint diagnostics", async () => {
        await using node = await MockServerNode.createOnline(undefined, {
            device: OnOffLightDevice.with(SecretsServer),
        });
        const endpoint = node.parts.get(1)!;
        await endpoint.act(agent => {
            agent.get(SecretsServer).state.key = new Uint8Array(Bytes.of(KEY));
        });

        const text = LogFormat.formats.plain(
            Diagnostic.message({ values: [Diagnostic.list(endpoint.behaviors.detailedDiagnostic)] }),
        );

        expect(text).contains(SecretRedaction.PLACEHOLDER);
        expect(text).not.contains(Bytes.toHex(KEY));
    });
});
