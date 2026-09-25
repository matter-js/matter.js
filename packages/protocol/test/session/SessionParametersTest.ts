/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MIN_TCP_SPEC_VERSION, SessionParameters } from "#session/SessionParameters.js";
import { Hours } from "@matter/general";

describe("SessionParameters", () => {
    it("accepts idle/active intervals above one hour", () => {
        const params = SessionParameters({ idleInterval: Hours(2), activeInterval: Hours(2) });
        expect(params.idleInterval).equal(Hours(2));
        expect(params.activeInterval).equal(Hours(2));
    });

    describe("maxPathsPerInvoke", () => {
        it("honors a peer-reported limit above one", () => {
            expect(SessionParameters({ maxPathsPerInvoke: 9 }).maxPathsPerInvoke).equal(9);
        });

        it("assumes one when the peer reports zero", () => {
            expect(SessionParameters({ maxPathsPerInvoke: 0 }).maxPathsPerInvoke).equal(1);
        });

        it("assumes one when the peer reports no limit", () => {
            expect(SessionParameters({ maxPathsPerInvoke: undefined }).maxPathsPerInvoke).equal(1);
        });

        it("honors the highest limit the wire can carry", () => {
            expect(SessionParameters({ maxPathsPerInvoke: 0xffff }).maxPathsPerInvoke).equal(0xffff);
        });

        it("assumes one for a persisted limit the wire could not have carried", () => {
            for (const maxPathsPerInvoke of [Number.NaN, Infinity, -1, 2.5, 0x10000, "10", null]) {
                expect(SessionParameters({ maxPathsPerInvoke } as SessionParameters.Config).maxPathsPerInvoke).equal(
                    1,
                    `for ${String(maxPathsPerInvoke)}`,
                );
            }
        });
    });

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
