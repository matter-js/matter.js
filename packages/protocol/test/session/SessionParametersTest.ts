/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MIN_TCP_SPEC_VERSION, SessionParameters } from "#session/SessionParameters.js";

describe("SessionParameters", () => {
    describe("TCP spec-version gate", () => {
        it("keeps TCP support for peers reporting spec version >= 1.5.0", () => {
            const params = SessionParameters({
                specificationVersion: MIN_TCP_SPEC_VERSION,
                supportedTransports: { tcpClient: true, tcpServer: true },
            });
            expect(params.supportedTransports).deep.equal({ tcpClient: true, tcpServer: true });
        });

        it("clears TCP support for peers reporting spec version < 1.5.0", () => {
            const params = SessionParameters({
                specificationVersion: 0x01040000,
                supportedTransports: { tcpClient: true, tcpServer: true },
            });
            expect(params.supportedTransports).deep.equal({ tcpClient: false, tcpServer: false });
        });

        it("clears TCP support when the spec version is unknown", () => {
            const params = SessionParameters({
                supportedTransports: { tcpClient: true, tcpServer: true },
            });
            expect(params.supportedTransports).deep.equal({ tcpClient: false, tcpServer: false });
        });

        it("decodes a numeric supportedTransports bitmap before gating", () => {
            const params = SessionParameters({
                specificationVersion: MIN_TCP_SPEC_VERSION,
                supportedTransports: 0b100, // tcpServer (bit 2)
            });
            expect(params.supportedTransports.tcpServer).true;
        });

        it("omits maxTcpMessageSize once TCP is cleared", () => {
            const params = SessionParameters({
                specificationVersion: 0x01040000,
                supportedTransports: { tcpServer: true },
                maxTcpMessageSize: 32000,
            });
            expect(params.maxTcpMessageSize).undefined;
        });
    });
});
