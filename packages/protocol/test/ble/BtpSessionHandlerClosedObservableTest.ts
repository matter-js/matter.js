/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BtpSessionHandler } from "#ble/BtpSessionHandler.js";
import { Bytes } from "@matter/general";

describe("BtpSessionHandler closed observable", () => {
    before(MockTime.enable);

    it("emits `closed` exactly once when the session transitions to closed", async () => {
        const handshakeRequest = Bytes.fromHex("656c04000000b90006");

        const btpSession = await BtpSessionHandler.createFromHandshakeRequest(
            100,
            handshakeRequest,
            async () => {
                // handshake response write — no-op for this test
            },
            async () => {
                // disconnect callback — no-op, close() should still emit
            },
            async () => {
                throw new Error("Should not be called");
            },
        );

        let closedCount = 0;
        btpSession.closed.on(() => {
            closedCount++;
        });

        await btpSession.close();
        expect(closedCount).equal(1);

        // Subsequent close() calls must be idempotent
        await btpSession.close();
        expect(closedCount).equal(1);
    });
});
