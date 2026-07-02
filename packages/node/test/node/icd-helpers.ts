/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { IcdManagementServer } from "#behaviors/icd-management";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/index.js";
import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { FabricManager } from "@matter/protocol";
import { IcdManagement } from "@matter/types/clusters/icd-management";

/** Shared LIT ICD server configuration for the ICD test suites. */
export const LIT_CONFIG = {
    operatingMode: IcdManagement.OperatingMode.Sit,
    activeModeThreshold: 5000,
    idleModeDuration: 3600,
    activeModeDuration: 1000,
    maximumCheckInBackoff: 3600,
};

/** Force one device idle→active wake and let the Check-In send pass run to completion. */
export async function wakeDevice(device: ServerNode) {
    await device.act(agent => agent.get(IcdManagementServer).enterIdleMode());
    await device.act(agent => agent.get(IcdManagementServer).requestActiveMode());
    await MockTime.resolve(Promise.resolve(), { macrotasks: true });
}

export async function commission(controller: ServerNode, device: ServerNode) {
    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;

    if (!controller.lifecycle.isOnline) {
        await controller.start();
    }

    const { passcode, discriminator } = device.state.commissioning;
    await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
        macrotasks: true,
    });

    controllerCrypto.entropic = deviceCrypto.entropic = false;
}

export function wakefulnessOf(controller: ServerNode, peer: ClientNode) {
    const peerAddress = peer.stateOf(CommissioningClient).peerAddress!;
    const fabric = controller.env.get(FabricManager).for(peerAddress.fabricIndex);
    return fabric.icd.wakefulnessFor(peerAddress.nodeId);
}
