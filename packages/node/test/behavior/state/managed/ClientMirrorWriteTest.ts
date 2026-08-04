/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { MockCrypto, Transaction } from "@matter/general";
import { DataModelPath } from "@matter/model";
import { Val } from "@matter/protocol";
import { EndpointNumber, TlvOfModel } from "@matter/types";
import { CameraAvStreamManagement } from "@matter/types/clusters/camera-av-stream-management";

const schema = CameraAvStreamManagement.schema.clone();
schema.supportedFeatures = ["VDO"];

// Viewport is writable, non-volatile and all of its members are mandatory, so a member the encoder cannot find fails
// the encode outright rather than dropping from the write as an absent optional would
const viewport = schema.attributes.require("Viewport");

const VIEWPORT = { x1: 0, y1: 0, x2: 640, y2: 480 };

class CameraState {}

/**
 * Capture the values a datasource hands to persistence.  For a client mirror these are the same objects the remote
 * writer encodes for the peer.
 */
class CapturingStore implements Datasource.Store {
    initialValues: Val.Struct;
    written?: Val.Struct;

    constructor(initialValues: Val.Struct) {
        this.initialValues = initialValues;
    }

    async set(_transaction: Transaction, values: Val.Struct) {
        this.written = { ...this.written, ...values };
    }
}

describe("Client Mirror Writes", () => {
    it("hands the peer an encodable value after a nested write", async () => {
        const store = new CapturingStore({ [viewport.id!]: { ...VIEWPORT } });

        const datasource = Datasource({
            entropy: MockCrypto(),
            type: CameraState,
            supervisor: RootSupervisor.for(schema),
            location: { endpoint: EndpointNumber(1), path: new DataModelPath("CameraState") },
            primaryKey: "id",
            store,
        });

        await LocalActorContext.act("test", async cx => {
            const state = datasource.reference(cx) as Val.Struct;
            (state.viewport as Val.Struct).x2 = 320;
            await cx.transaction.commit();
        });

        const written = store.written?.[viewport.id!];
        expect(written).not.undefined;

        // The write path encodes with this schema
        const tlv = TlvOfModel(viewport);
        expect(tlv.decode(tlv.encode(written))).deep.equals({ ...VIEWPORT, x2: 320 });
    });
});
