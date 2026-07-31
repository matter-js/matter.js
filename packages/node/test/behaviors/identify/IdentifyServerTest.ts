/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GlobalAttributeState } from "#behavior/cluster/ClusterState.js";
import { IdentifyServer } from "#behaviors/identify";
import { ContactSensorDevice } from "#devices/contact-sensor";
import { OnOffLightDevice } from "#devices/on-off-light";
import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    Status,
    TlvEnum,
    TlvField,
    TlvInvokeResponseData,
    TlvObject,
    TypeFromSchema,
} from "@matter/types";
import { Identify } from "@matter/types/clusters/identify";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";

const TlvTriggerEffectRequest = TlvObject({
    effectIdentifier: TlvField(0, TlvEnum<Identify.EffectIdentifier>()),
    effectVariant: TlvField(1, TlvEnum<Identify.EffectVariant>()),
});

const EFFECT = {
    effectIdentifier: Identify.EffectIdentifier.Blink,
    effectVariant: Identify.EffectVariant.Default,
};

describe("IdentifyServer", () => {
    describe("triggerEffect", () => {
        it("is unsupported on a device type that does not require it", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(ContactSensorDevice);

            expect(acceptedCommands(endpoint)).not.includes(Identify.commands.triggerEffect.id);

            const fabric = await node.addFabric();
            expect(await invokeStatus(node, fabric)).equals(Status.UnsupportedCommand);

            await node.close();
        });

        it("is supported on a device type that requires it", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(OnOffLightDevice);

            expect(acceptedCommands(endpoint)).includes(Identify.commands.triggerEffect.id);

            const effects = new Array<Identify.TriggerEffectRequest>();
            endpoint.eventsOf(IdentifyServer).effectTriggered.on(effect => {
                effects.push(effect);
            });

            const fabric = await node.addFabric();
            expect(await invokeStatus(node, fabric)).equals(Status.Success);
            expect(effects).deep.equals([EFFECT]);

            await node.close();
        });

        it("is supported when a device type requirement is applied manually", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(
                ContactSensorDevice.with(IdentifyServer.alter({ commands: { triggerEffect: { optional: false } } })),
            );

            expect(acceptedCommands(endpoint)).includes(Identify.commands.triggerEffect.id);

            await node.close();
        });

        it("is supported when explicitly implemented", async () => {
            const effects = new Array<Identify.TriggerEffectRequest>();

            class MyIdentifyServer extends IdentifyServer {
                override triggerEffect(effect: Identify.TriggerEffectRequest) {
                    effects.push(effect);
                }
            }

            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(ContactSensorDevice.with(MyIdentifyServer));

            expect(acceptedCommands(endpoint)).includes(Identify.commands.triggerEffect.id);

            const fabric = await node.addFabric();
            expect(await invokeStatus(node, fabric)).equals(Status.Success);
            expect(effects).deep.equals([EFFECT]);

            await node.close();
        });

        it("remains supported when an implementation replaces the requirement-derived behavior", async () => {
            // A device type that requires the command installs a specialized IdentifyServer.  Replacing it with an
            // implementation of the base behavior discards that specialization, so the implementation itself must
            // preserve support
            class MyIdentifyServer extends IdentifyServer {
                override triggerEffect() {}
            }

            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(OnOffLightDevice.with(MyIdentifyServer));

            expect(acceptedCommands(endpoint)).includes(Identify.commands.triggerEffect.id);

            const fabric = await node.addFabric();
            expect(await invokeStatus(node, fabric)).equals(Status.Success);

            await node.close();
        });

        it("is supported when enabled", async () => {
            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(
                ContactSensorDevice.with(IdentifyServer.enable({ commands: { triggerEffect: true } })),
            );

            expect(acceptedCommands(endpoint)).includes(Identify.commands.triggerEffect.id);

            const fabric = await node.addFabric();
            expect(await invokeStatus(node, fabric)).equals(Status.Success);

            await node.close();
        });

        it("is supported when suppression is overridden", async () => {
            class MyIdentifyServer extends IdentifyServer {
                protected override suppressTriggerEffect() {}
            }

            const node = await MockServerNode.createOnline(undefined, { device: undefined });
            const endpoint = await node.add(ContactSensorDevice.with(MyIdentifyServer));

            expect(acceptedCommands(endpoint)).includes(Identify.commands.triggerEffect.id);

            await node.close();
        });
    });
});

function acceptedCommands(endpoint: Endpoint) {
    return (endpoint.stateOf(IdentifyServer) as unknown as GlobalAttributeState).acceptedCommandList;
}

async function invokeStatus(node: MockServerNode, fabric: Awaited<ReturnType<MockServerNode["addFabric"]>>) {
    let sent: undefined | TypeFromSchema<typeof TlvInvokeResponseData>;
    await interaction.invoke(
        node,
        fabric,
        {
            commandPath: {
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(Identify.id),
                commandId: CommandId(Identify.commands.triggerEffect.id),
            },
            commandFields: TlvTriggerEffectRequest.encodeTlv(EFFECT),
        },
        response => {
            sent = response;
        },
    );
    return sent?.status?.status?.status;
}
