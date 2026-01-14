/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { env } from "node:process";
import { FIFO_PATH } from "./container-command-pipe.js";
import { PicsSource } from "./pics/source.js";

/**
 * Significant locations within the test container.
 *
 * The container generally adheres to file layout within connectedhomeip.  This avoids various obscure path
 * configuration options for build tooling and test frameworks, plus at least one place where the path is hard-coded.
 */
export namespace ContainerPaths {
    export const yamlRunner = `/scripts/tests/chipyaml/chiptool.py`;
    export const descriptorFile = `/lib/test-descriptor.json`;
    export const pythonCommissioner = `/src/python_testing/hello_test.py`;
    export const chipPics = "/src/app/tests/suites/certification/ci-pics-values";
    export const accessoryClient =
        "/usr/local/lib/python3.12/dist-packages/matter/yamltests/pseudo_clusters/clusters/accessory_server_bridge.py";
}

export type ContainerPathsType = typeof ContainerPaths;
export interface ContainerPaths extends ContainerPathsType {}

/**
 * Specify the base filename to use for a test.  This specifies a "winner" in the case of conflicts.
 */
export interface TestConflictResolutions {
    [name: string]: string;
}

/**
 * Other misc configuration.
 */
export namespace Constants {
    export const selectedPlatform = env.MATTER_CHIP_PLATFORM;

    /**
     * We only publish for x86.  This is appropriate for GH CI and runs fine under emulation on MacOS
     *
     * TODO - if/when we do publish arm64 images, make the native architecture the default
     */
    export const platform = selectedPlatform || "linux/amd64";

    export const networkName = "matter.js-chip";

    /**
     * We only have one container.  We use it both for MDNS (dbus + avahi) and CHIP
     */
    export const imageName = env.MATTER_CHIP_IMAGE || "ghcr.io/matter-js/chip:latest";
    export const mdnsVolumeName = env.MATTER_MDNS_VOLUME || "matter.js-mdns";

    export const initTimeout = 60_000;
    export const defaultTimeoutMs = 60_000;

    /**
     * We set the commissioning timeout value very low because this timeout is tested and waiting the default 180s.
     * sucks.  The timeout must be high enough for actual commissioning to succeed.
     */
    const subjectCommissioningTimeoutS = 3;

    /**
     * The test harness sits around a bit after opening commissioning window.  Doesn't mention why, but I reeeally hate
     * sitting around.  So aggressively tune from default 5s. to 500ms.
     */
    const delayAfterOpeningCommissioningWindowMs = 500;

    /**
     * The server will not find chip-tool unless we provide an explicit path.  The failure mode is a little
     * non-obvious as it doesn't try to start the server but attempts to establish a websocket connection regardless.
     */
    const chipToolPath = "/bin/chip-tool";

    /**
     * Default arguments provided to the YAML runner.
     */
    export const YamlRunnerArgs = [
        // This makes CHIP logs unconditional which would be nice if it intermingled with our logs but currently they
        // only appear once test is run; haven't tracked down how to stream them yet
        // "--show_adapter_logs",
        // "true",

        "--PIXIT.CADMIN.CwDuration",
        `${subjectCommissioningTimeoutS}`,

        "--waitAfterCommissioning",
        `${delayAfterOpeningCommissioningWindowMs}`,

        "--server_path",
        chipToolPath,
    ];

    /**
     * Default arguments provided to the Python runner.
     */
    export const PythonRunnerArgs = ["--app-pipe", FIFO_PATH];

    export const defaultPics: PicsSource = {
        kind: "composite",
        sources: [
            { kind: "chip", name: ContainerPaths.chipPics },
            { kind: "file", name: "src/chip/matter-js-pics.properties" },
        ],
    };
}
