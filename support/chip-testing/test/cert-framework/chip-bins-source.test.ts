/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { appVariantFor, chipBinsSourceFor } from "@matter/testing";
import { expect } from "chai";
import { env } from "node:process";

describe("chipBinsSourceFor", () => {
    let priorSource: string | undefined;

    beforeEach(() => {
        priorSource = env.MATTER_CHIP_BINS_SOURCE;
    });

    afterEach(() => {
        if (priorSource === undefined) {
            delete env.MATTER_CHIP_BINS_SOURCE;
        } else {
            env.MATTER_CHIP_BINS_SOURCE = priorSource;
        }
    });

    it("reads the environment for chip-local", () => {
        env.MATTER_CHIP_BINS_SOURCE = "cert-bins";
        expect(chipBinsSourceFor("chip-local")).equals("cert-bins");

        delete env.MATTER_CHIP_BINS_SOURCE;
        expect(chipBinsSourceFor("chip-local")).equals("matterjs");
    });

    // The docker images are built from CHIP's development branch, so a test declaring released binaries must not
    // run against them however the variable is set
    it("ignores the environment for chip-docker", () => {
        env.MATTER_CHIP_BINS_SOURCE = "cert-bins";
        expect(chipBinsSourceFor("chip-docker")).equals("matterjs");
    });

    it("names no source for matterjs, which runs no chip binary", () => {
        env.MATTER_CHIP_BINS_SOURCE = "cert-bins";
        expect(chipBinsSourceFor("matterjs")).equals(undefined);
    });
});

describe("appVariantFor", () => {
    let priorSource: string | undefined;

    beforeEach(() => {
        priorSource = env.MATTER_CHIP_BINS_SOURCE;
    });

    afterEach(() => {
        if (priorSource === undefined) {
            delete env.MATTER_CHIP_BINS_SOURCE;
        } else {
            env.MATTER_CHIP_BINS_SOURCE = priorSource;
        }
    });

    it("applies a plain name to every source", () => {
        env.MATTER_CHIP_BINS_SOURCE = "cert-bins";
        expect(appVariantFor("chip-local", "nlfaultinject")).equals("nlfaultinject");

        delete env.MATTER_CHIP_BINS_SOURCE;
        expect(appVariantFor("chip-local", "nlfaultinject")).equals("nlfaultinject");
    });

    // The released binaries never carried a variant this project invented, so asking for one there would send the
    // case looking for a binary that was never shipped
    it("applies a named source only where that source runs", () => {
        delete env.MATTER_CHIP_BINS_SOURCE;
        expect(appVariantFor("chip-local", { matterjs: "nogroupcast" })).equals("nogroupcast");

        env.MATTER_CHIP_BINS_SOURCE = "cert-bins";
        expect(appVariantFor("chip-local", { matterjs: "nogroupcast" })).equals(undefined);
    });

    it("names no variant for a flavor that runs no chip binary", () => {
        expect(appVariantFor("matterjs", { matterjs: "nogroupcast" })).equals(undefined);
    });
});
