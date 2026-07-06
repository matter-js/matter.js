/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppAddress, InvalidAppAddress } from "#net/AppAddress.js";

describe("AppAddress", () => {
    describe("construction from an object", () => {
        it("builds an IP URL", () => {
            const address = new AppAddress({
                appProtocol: "http",
                transport: { kind: "ip", host: "1.2.3.4", port: 8080 },
            });

            expect(address.toString()).equal("http://1.2.3.4:8080/");
            expect(address.appProtocol).equal("http");
            expect(address.portNum).equal(8080);
            expect(address.transport).deep.equal({ kind: "ip", host: "1.2.3.4", port: 8080 });
        });

        it("appends a path", () => {
            const address = new AppAddress({
                appProtocol: "http",
                transport: { kind: "ip", host: "host", port: 80 },
                path: "/api",
            });

            expect(address.pathname).equal("/api");
        });

        it("adds the TLS suffix", () => {
            const address = new AppAddress({
                appProtocol: "http",
                tls: true,
                transport: { kind: "ip", host: "host", port: 443 },
            });

            expect(address.appProtocol).equal("https");
            expect(address.isTls).equal(true);
        });

        it("encodes a unix socket transport", () => {
            const address = new AppAddress({
                appProtocol: "http",
                transport: { kind: "unix", path: "/tmp/s.sock" },
            });

            expect(address.protocolModifiers).deep.equal(["unix"]);
            expect(address.transport).deep.equal({ kind: "unix", path: "/tmp/s.sock" });
        });
    });

    describe("construction from a string", () => {
        it("parses a TLS scheme", () => {
            const address = new AppAddress("mqtts://broker:8883");

            expect(address.appProtocol).equal("mqtts");
            expect(address.isTls).equal(true);
            expect(address.portNum).equal(8883);
        });

        it("throws for an unparseable address", () => {
            expect(() => new AppAddress("not a url")).throws(InvalidAppAddress, "Invalid app address");
        });
    });

    describe("wildcards", () => {
        it("detects wildcard host and port", () => {
            const address = new AppAddress("http://0.0.0.0:0");

            expect(address.isWildcardHost).equal(true);
            expect(address.isWildcardPort).equal(true);
        });

        it("detects an IPv6 wildcard host behind a port", () => {
            const address = new AppAddress("http://[::]:5540");

            expect(address.isWildcardHost).equal(true);
        });

        it("reports a non-wildcard address", () => {
            const address = new AppAddress("http://1.2.3.4:80");

            expect(address.isWildcardHost).equal(false);
            expect(address.isWildcardPort).equal(false);
        });
    });

    describe("for", () => {
        it("returns an existing AppAddress unchanged", () => {
            const address = new AppAddress("http://host");

            expect(AppAddress.for(address)).equal(address);
        });

        it("constructs from a string", () => {
            expect(AppAddress.for("http://host")).instanceOf(AppAddress);
        });
    });
});
