/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningController } from "#CommissioningController.js";
import { DestroyedDependencyError, LogDestination, Logger, LogFormat, LogLevel } from "@matter/general";
import { ClientNode, NetworkClient } from "@matter/node";
import { LegacyControllerSite } from "./util/LegacyControllerSite.js";

function onlyPeerOf(controller: CommissioningController) {
    const peers = [...controller.node.peers];
    expect(peers.length).equals(1);
    return peers[0];
}

describe("CommissioningController autoConnect", () => {
    before(() => {
        MockTime.init();
    });

    it("disables its peers when it starts with autoConnect false and enables them when it connects", async () => {
        await using site = new LegacyControllerSite();
        const { controller } = await site.addCommissionedPair();

        const disconnected = await site.restartController(controller, { autoConnect: false });
        const disabled = onlyPeerOf(disconnected);
        expect(disabled.isDisabled).true;
        expect(disabled.lifecycle.shouldBeOnline).false;

        const connected = await site.restartController(disconnected, { autoConnect: true });
        const enabled = onlyPeerOf(connected);
        expect(enabled.isDisabled).false;
        expect(enabled.lifecycle.shouldBeOnline).true;
    });

    it("starts with autoConnect false when a peer refuses its disable(), and still applies autoSubscribe", async () => {
        await using site = new LegacyControllerSite();
        const { controller } = await site.addCommissionedPair();
        const autoSubscribe = !onlyPeerOf(controller).stateOf(NetworkClient).autoSubscribe;
        const disable = ClientNode.prototype.disable;
        ClientNode.prototype.disable = async function () {
            throw new DestroyedDependencyError(`${this}`, "refuses the disable for test");
        };

        const warnings = new Array<string>();
        Logger.destinations.capture = LogDestination({
            format: LogFormat.formats.plain,
            write(text, message) {
                if (message.level === LogLevel.WARN) {
                    warnings.push(text);
                }
            },
        });
        let disconnected: CommissioningController;
        try {
            disconnected = await site.restartController(controller, { autoConnect: false, autoSubscribe });
        } finally {
            ClientNode.prototype.disable = disable;
            delete Logger.destinations.capture;
        }

        const peer = onlyPeerOf(disconnected);
        expect(peer.isDisabled).false;
        expect(peer.stateOf(NetworkClient).autoSubscribe).equals(autoSubscribe);
        expect(warnings.join("\n")).match(/Error applying the connection options to .*refuses the disable for test/s);
    });
});
