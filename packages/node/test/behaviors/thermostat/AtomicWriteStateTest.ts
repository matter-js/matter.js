/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThermostatServer } from "#behaviors/thermostat";
import { ThermostatDevice } from "#devices/thermostat";
import { Endpoint } from "#endpoint/index.js";
import { PeerAddress } from "@matter/protocol";
import { AttributeId, FabricIndex, NodeId } from "@matter/types";
import { Thermostat } from "@matter/types/clusters/thermostat";
import { AtomicWriteState } from "../../../src/behaviors/thermostat/AtomicWriteState.js";

function createState() {
    const endpoint = new Endpoint(ThermostatDevice, { id: "thermostat" });
    return new AtomicWriteState(
        PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) }),
        endpoint,
        ThermostatServer.cluster.id,
        [AttributeId(Thermostat.attributes.presets.id)],
        1000,
        new Map(),
        {},
    );
}

describe("AtomicWriteState", () => {
    it("emits closed once when closed repeatedly", () => {
        const state = createState();
        let closedCount = 0;
        state.closed.on(() => {
            closedCount++;
        });

        state.close();
        state.close();

        expect(closedCount).to.equal(1);
    });
});
