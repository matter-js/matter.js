/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChipDataModel } from "#chipdm/chip-data-model.js";
import { DataModelSourceError } from "#chipdm/errors.js";

const CLUSTER = `<cluster revision="1"><clusterIds><clusterId id="0x0101" name="Test"/></clusterIds></cluster>`;
const DEVICE_TYPE = `<deviceType id="0x0100" revision="1" name="Test"/>`;
const NAMESPACE = `<namespace id="0x01" name="Test"/>`;

// The loader reads the filesystem, so the modules it needs are unavailable in the web test bundle
if (typeof window === "undefined") {
    describe("loading of the CHIP data model", () => {
        let loadDataModel: typeof import("#chipdm/load-data-model.js").loadDataModel;
        let fs: typeof import("node:fs/promises");
        let path: typeof import("node:path");
        let temp: string;
        let root: string;
        let count: number;

        before(async () => {
            ({ loadDataModel } = await import("#chipdm/load-data-model.js"));
            fs = await import("node:fs/promises");
            path = await import("node:path");
            temp = (await import("node:os")).tmpdir();
        });

        beforeEach(async () => {
            root = await fs.mkdtemp(path.resolve(temp, "chipdm-"));
            count = 0;
        });

        afterEach(async () => {
            await fs.rm(root, { force: true, recursive: true });
        });

        async function populate(version: string, ...omit: string[]) {
            const dir = path.resolve(root, `dm-${count++}`);
            await fs.mkdir(dir);

            const files: Record<string, [string, string]> = {
                clusters: ["Test.xml", CLUSTER],
                device_types: ["Test.xml", DEVICE_TYPE],
                namespaces: ["Test.xml", NAMESPACE],
                globals: ["global-structs.xml", "<globals/>"],
            };

            for (const [directory, [filename, xml]] of Object.entries(files)) {
                if (omit.includes(directory)) {
                    continue;
                }
                await fs.mkdir(path.resolve(dir, directory));
                await fs.writeFile(path.resolve(dir, directory, filename), xml);
            }

            const source: ChipDataModel = {
                description: "test",
                versions: async () => [version],
                directory: async () => dir,
                [Symbol.asyncDispose]: async () => {},
            };

            return await loadDataModel(source, version);
        }

        it("loads every directory", async () => {
            const dm = await populate("1.6");
            expect(dm.clusters.map(cluster => cluster.name)).deep.equal(["Test"]);
            expect(dm.deviceTypes.map(deviceType => deviceType.name)).deep.equal(["Test"]);
            expect(dm.namespaces.map(namespace => namespace.name)).deep.equal(["Test"]);
        });

        // An absent globals directory compares as agreement, because nothing reports the globals we then never compare
        it("rejects an absent directory for a version it compares in earnest", async () => {
            for (const directory of ["clusters", "device_types", "namespaces", "globals"]) {
                await expect(populate("1.6", directory)).rejectedWith(
                    DataModelSourceError,
                    `has no ${directory} directory`,
                );
            }
        });

        it("accepts an absent directory for a version predating the comparison", async () => {
            const withoutGlobals = await populate("1.4", "globals");
            expect(withoutGlobals.globals).deep.equal([]);
            expect(withoutGlobals.globalCommands).deep.equal([]);

            const withoutNamespaces = await populate("1.1", "namespaces");
            expect(withoutNamespaces.namespaces).deep.equal([]);
        });
    });
}
