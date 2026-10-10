/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertConfigError, resolveControllerImplementation, resolveDeviceFlavor } from "@matter/testing";
import { env } from "node:process";

describe("resolveDeviceFlavor", () => {
    const original = env.MATTER_CERT_DEVICE;

    afterEach(() => {
        if (original === undefined) {
            delete env.MATTER_CERT_DEVICE;
        } else {
            env.MATTER_CERT_DEVICE = original;
        }
    });

    it("defaults to matterjs when unset", () => {
        delete env.MATTER_CERT_DEVICE;
        expect(resolveDeviceFlavor()).equal("matterjs");
    });

    it("defaults to matterjs when set to an empty string", () => {
        env.MATTER_CERT_DEVICE = "";
        expect(resolveDeviceFlavor()).equal("matterjs");
    });

    for (const flavor of ["chip-docker", "chip-local", "matterjs"] as const) {
        it(`honors an explicit "${flavor}" override`, () => {
            env.MATTER_CERT_DEVICE = flavor;
            expect(resolveDeviceFlavor()).equal(flavor);
        });
    }

    // Only an evidence record ever names this flavor: the harness neither builds nor starts a device
    // a wrapped python script spawns for itself
    it("rejects python-wrapped, which no run can select", () => {
        env.MATTER_CERT_DEVICE = "python-wrapped";
        expect(() => resolveDeviceFlavor()).throws(CertConfigError, 'Unknown MATTER_CERT_DEVICE "python-wrapped"');
    });

    it("throws a clear error for an unknown flavor", () => {
        env.MATTER_CERT_DEVICE = "bogus";
        expect(() => resolveDeviceFlavor()).throws(CertConfigError, 'Unknown MATTER_CERT_DEVICE "bogus"');
    });
});

describe("resolveControllerImplementation", () => {
    const original = env.MATTER_CERT_CONTROLLER;

    afterEach(() => {
        if (original === undefined) {
            delete env.MATTER_CERT_CONTROLLER;
        } else {
            env.MATTER_CERT_CONTROLLER = original;
        }
    });

    it("defaults to matterjs when unset", () => {
        delete env.MATTER_CERT_CONTROLLER;
        expect(resolveControllerImplementation()).equal("matterjs");
    });

    it("defaults to matterjs when set to an empty string", () => {
        env.MATTER_CERT_CONTROLLER = "";
        expect(resolveControllerImplementation()).equal("matterjs");
    });

    it("accepts matterjs-server", () => {
        env.MATTER_CERT_CONTROLLER = "matterjs-server";
        expect(resolveControllerImplementation()).equal("matterjs-server");
    });

    for (const implementation of ["chip-tool", "matterjs"] as const) {
        it(`honors an explicit "${implementation}" override`, () => {
            env.MATTER_CERT_CONTROLLER = implementation;
            expect(resolveControllerImplementation()).equal(implementation);
        });
    }

    it("throws a clear error naming the accepted values for an unknown implementation", () => {
        env.MATTER_CERT_CONTROLLER = "bogus";
        expect(() => resolveControllerImplementation()).throws(
            CertConfigError,
            'Unknown MATTER_CERT_CONTROLLER "bogus"',
        );
        for (const accepted of ["chip-tool", "matterjs", "matterjs-server"]) {
            expect(() => resolveControllerImplementation()).throws(CertConfigError, `"${accepted}"`);
        }
    });
});
