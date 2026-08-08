/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as DeviceConfigModule from "../../src/chip/cert/device-config.js";
import { importModule } from "./dynamic-import.js";

// device-config.ts reads node:process at module scope, which isn't browser-bundleable; load it only
// via dynamic import inside this guard so the web run's static import graph never reaches it.
if (typeof window === "undefined") {
    describe("resolveDeviceFlavor", () => {
        let resolveDeviceFlavor: typeof DeviceConfigModule.resolveDeviceFlavor;
        const original = process.env.MATTER_CERT_DEVICE;

        before(async () => {
            ({ resolveDeviceFlavor } = await importModule<typeof DeviceConfigModule>(
                "../../src/chip/cert/device-config.js",
            ));
        });

        afterEach(() => {
            if (original === undefined) {
                delete process.env.MATTER_CERT_DEVICE;
            } else {
                process.env.MATTER_CERT_DEVICE = original;
            }
        });

        it("defaults to chip-docker when unset", () => {
            delete process.env.MATTER_CERT_DEVICE;
            expect(resolveDeviceFlavor()).equal("chip-docker");
        });

        it("defaults to chip-docker when set to an empty string", () => {
            process.env.MATTER_CERT_DEVICE = "";
            expect(resolveDeviceFlavor()).equal("chip-docker");
        });

        for (const flavor of ["chip-docker", "chip-local", "matterjs"] as const) {
            it(`honors an explicit "${flavor}" override`, () => {
                process.env.MATTER_CERT_DEVICE = flavor;
                expect(resolveDeviceFlavor()).equal(flavor);
            });
        }

        it("throws a clear error for an unknown flavor", () => {
            process.env.MATTER_CERT_DEVICE = "bogus";
            expect(() => resolveDeviceFlavor()).throws('Unknown MATTER_CERT_DEVICE "bogus"');
        });
    });
}
