/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveDeviceFlavor } from "@matter/testing";
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

    it("throws a clear error for an unknown flavor", () => {
        env.MATTER_CERT_DEVICE = "bogus";
        expect(() => resolveDeviceFlavor()).throws('Unknown MATTER_CERT_DEVICE "bogus"');
    });
});
