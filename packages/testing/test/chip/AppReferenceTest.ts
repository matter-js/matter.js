/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    chipAppName,
    expandAppPlaceholders,
    normalizeAppReferences,
    UnresolvedAppPlaceholderError,
} from "../../src/chip/app-reference.js";
import type { TestDescriptor } from "../../src/test-descriptor.js";

function executables(...paths: string[]) {
    const present = new Set(paths);
    const asked = new Array<string>();
    return {
        asked,
        isExecutable: async (path: string) => {
            asked.push(path);
            return present.has(path);
        },
    };
}

describe("app-reference", () => {
    describe("chipAppName", () => {
        it("reduces CHIP app references to harness names", () => {
            expect(chipAppName("${ALL_CLUSTERS_APP}")).equals("all-clusters");
            expect(chipAppName("${ALL_CLUSTERS_NO_GROUPCAST_APP}")).equals("all-clusters-no-groupcast");
            expect(chipAppName("${CHIP_LOCK_APP}")).equals("lock");
            expect(chipAppName("${TV_APP}")).equals("tv");
            expect(chipAppName("${LIGHTING_APP_NO_UNIQUE_ID}")).equals("lighting-app-no-unique-id");
        });

        it("leaves harness names unchanged", () => {
            for (const name of ["all-clusters", "all-clusters-no-groupcast", "all-devices", "lit-icd", "rvc", "tv"]) {
                expect(chipAppName(name)).equals(name);
            }
        });
    });

    describe("normalizeAppReferences", () => {
        it("normalizes app, preferredApp and config app throughout the tree", () => {
            const tree: TestDescriptor = {
                name: "chip",
                kind: "suite",
                members: [
                    { name: "single", kind: "yaml", preferredApp: "${CHIP_LOCK_APP}" },
                    {
                        name: "multi",
                        kind: "suite",
                        members: [
                            {
                                name: "run1",
                                kind: "py",
                                app: "${ALL_DEVICES_APP}",
                                config: { app: "${ALL_DEVICES_APP}", quiet: true },
                            },
                        ],
                    },
                ],
            };

            normalizeAppReferences(tree);

            const [single, multi] = tree.members ?? [];
            expect(single.preferredApp).equals("lock");
            const run1 = multi.members?.[0];
            expect(run1?.app).equals("all-devices");
            expect(run1?.config).deep.equals({ app: "all-devices", quiet: true });
        });
    });

    describe("expandAppPlaceholders", () => {
        it("replaces a placeholder with the app's binary", async () => {
            const { isExecutable } = executables("/bin/chip-tv-app");

            const args = await expandAppPlaceholders(
                ["--string-arg", "th_server_app_path:${TV_APP}", "--endpoint", "1"],
                isExecutable,
            );

            expect(args).deep.equals(["--string-arg", "th_server_app_path:/bin/chip-tv-app", "--endpoint", "1"]);
        });

        it("replaces every placeholder in one argument", async () => {
            const { isExecutable } = executables("/bin/chip-tv-app", "/bin/chip-lock-app");

            const args = await expandAppPlaceholders(["a:${TV_APP},b:${CHIP_LOCK_APP}"], isExecutable);

            expect(args).deep.equals(["a:/bin/chip-tv-app,b:/bin/chip-lock-app"]);
        });

        it("checks nothing when there is no placeholder", async () => {
            const { asked, isExecutable } = executables();

            const args = await expandAppPlaceholders(["--endpoint", "1"], isExecutable);

            expect(args).deep.equals(["--endpoint", "1"]);
            expect(asked).deep.equals([]);
        });

        it("fails on a placeholder that names no executable", async () => {
            const { isExecutable } = executables("/bin/chip-tv-app");

            await expect(
                expandAppPlaceholders(["--string-arg", "th_server_app_path:${PUSH_AV_SERVER}"], isExecutable),
            ).rejectedWith(UnresolvedAppPlaceholderError, /\$\{PUSH_AV_SERVER\}.*\/bin\/chip-push-av-server-app/);
        });
    });
});
