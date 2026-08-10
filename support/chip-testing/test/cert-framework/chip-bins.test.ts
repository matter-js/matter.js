/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChipBinsDockerHandle } from "@matter/testing";
import * as mod from "@matter/testing";
import * as fsp from "node:fs/promises";
import * as osMod from "node:os";
import * as pathMod from "node:path";

describe("chip-bins", () => {
    const originalSource = process.env.MATTER_CHIP_BINS_SOURCE;
    const originalTag = process.env.MATTER_CHIP_BINS_TAG;
    const originalDir = process.env.MATTER_CHIP_BINS_DIR;

    afterEach(() => {
        for (const [key, value] of [
            ["MATTER_CHIP_BINS_SOURCE", originalSource],
            ["MATTER_CHIP_BINS_TAG", originalTag],
            ["MATTER_CHIP_BINS_DIR", originalDir],
        ] as const) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        mod.resetChipBinsPrepareCacheForTesting();
    });

    describe("resolveChipBinsSource", () => {
        it("defaults to matterjs when unset", () => {
            delete process.env.MATTER_CHIP_BINS_SOURCE;
            expect(mod.resolveChipBinsSource()).equal("matterjs");
        });

        it("defaults to matterjs when set to an empty string", () => {
            process.env.MATTER_CHIP_BINS_SOURCE = "";
            expect(mod.resolveChipBinsSource()).equal("matterjs");
        });

        it("honors an explicit cert-bins override", () => {
            process.env.MATTER_CHIP_BINS_SOURCE = "cert-bins";
            expect(mod.resolveChipBinsSource()).equal("cert-bins");
        });

        it("throws a clear error for an unknown source", () => {
            process.env.MATTER_CHIP_BINS_SOURCE = "bogus";
            expect(() => mod.resolveChipBinsSource()).throws('Unknown MATTER_CHIP_BINS_SOURCE "bogus"');
        });
    });

    describe("requestedChipBinsTag / chipBinsDir", () => {
        it("defaults the tag to the maintainer-vetted pinned SHA", () => {
            delete process.env.MATTER_CHIP_BINS_TAG;
            expect(mod.requestedChipBinsTag()).equal(mod.DEFAULT_CERT_BINS_TAG);
        });

        it("honors an explicit tag override", () => {
            process.env.MATTER_CHIP_BINS_TAG = "deadbeef";
            expect(mod.requestedChipBinsTag()).equal("deadbeef");
        });

        it("defaults the extraction directory under the OS temp dir, scoped by this host user", () => {
            delete process.env.MATTER_CHIP_BINS_DIR;
            const { uid, username } = osMod.userInfo();
            const userComponent = uid !== -1 ? String(uid) : username;
            expect(mod.chipBinsDir()).equal(pathMod.join(osMod.tmpdir(), `matter-js-chip-cert-bins-${userComponent}`));
        });

        it("includes this process's uid in the default directory name on POSIX", function () {
            if (process.getuid === undefined) {
                this.skip();
            }
            delete process.env.MATTER_CHIP_BINS_DIR;
            expect(mod.chipBinsDir()).contain(String(process.getuid()));
        });

        it("honors an explicit directory override", () => {
            process.env.MATTER_CHIP_BINS_DIR = "/some/dir";
            expect(mod.chipBinsDir()).equal("/some/dir");
        });
    });

    describe("chipBinsExtractionDir", () => {
        it("joins the tag under the given base directory", () => {
            expect(mod.chipBinsExtractionDir("abc123", "/base")).equal(pathMod.join("/base", "abc123"));
        });

        it("defaults the base directory to chipBinsDir()", () => {
            process.env.MATTER_CHIP_BINS_DIR = "/some/dir";
            expect(mod.chipBinsExtractionDir("abc123")).equal(pathMod.join("/some/dir", "abc123"));
        });

        it("accepts a full commit-SHA tag", () => {
            expect(() => mod.chipBinsExtractionDir("df8bd0308caa0680e2a78cda724a959e5b385205", "/base")).not.throws();
        });

        it("rejects a tag containing a path separator", () => {
            expect(() => mod.chipBinsExtractionDir("a/b", "/base")).throws('Invalid chip-cert-bins tag "a/b"');
        });

        it("rejects a tag that starts with a path-traversal segment", () => {
            expect(() => mod.chipBinsExtractionDir("../escape", "/base")).throws("Invalid chip-cert-bins tag");
        });

        it("rejects an empty tag", () => {
            expect(() => mod.chipBinsExtractionDir("", "/base")).throws("Invalid chip-cert-bins tag");
        });

        it("accepts a tag at Docker's 128-character length cap", () => {
            expect(() => mod.chipBinsExtractionDir("a".repeat(128), "/base")).not.throws();
        });

        it("rejects a tag exceeding Docker's 128-character length cap", () => {
            expect(() => mod.chipBinsExtractionDir("a".repeat(129), "/base")).throws("Invalid chip-cert-bins tag");
        });
    });

    describe("parseDockerHubTagsResponse", () => {
        it("returns an empty array when results is absent", () => {
            expect(mod.parseDockerHubTagsResponse({})).deep.equal([]);
        });

        it("parses a well-shaped results array", () => {
            const body = { results: [{ name: "abc", tag_last_pushed: "2026-01-01T00:00:00Z" }] };
            expect(mod.parseDockerHubTagsResponse(body)).deep.equal(body.results);
        });

        it("throws a named error when the top-level shape is not an object", () => {
            expect(() => mod.parseDockerHubTagsResponse(null)).throws("did not match the expected shape");
            expect(() => mod.parseDockerHubTagsResponse("nope")).throws("did not match the expected shape");
        });

        it("throws a named error when results is present but not an array", () => {
            expect(() => mod.parseDockerHubTagsResponse({ results: "nope" })).throws(
                "did not match the expected shape",
            );
        });

        it("throws a named error when a tag entry is missing a required field", () => {
            expect(() => mod.parseDockerHubTagsResponse({ results: [{ name: "abc" }] })).throws(
                "did not match the expected shape",
            );
        });
    });

    describe("chipBinsPlatformSupported", () => {
        it("accepts the platform chip-cert-bins actually publishes", () => {
            expect(mod.chipBinsPlatformSupported(mod.CERT_BINS_PLATFORM)).equal(true);
        });

        it("rejects any other platform", () => {
            expect(mod.chipBinsPlatformSupported("linux/amd64")).equal(false);
        });
    });

    describe("resolveChipBinsTag", () => {
        it("passes a pinned tag through without calling the latest-tag resolver", async () => {
            let calls = 0;
            const resolved = await mod.resolveChipBinsTag("abc123", async () => {
                calls++;
                return "should-not-be-used";
            });
            expect(resolved).equal("abc123");
            expect(calls).equal(0);
        });

        it("resolves the literal 'latest' via the injected resolver", async () => {
            let calls = 0;
            const resolved = await mod.resolveChipBinsTag("latest", async () => {
                calls++;
                return "newest-sha";
            });
            expect(resolved).equal("newest-sha");
            expect(calls).equal(1);
        });

        it("propagates a rejection from the latest-tag resolver", async () => {
            await expect(
                mod.resolveChipBinsTag("latest", async () => {
                    throw new Error("registry unreachable");
                }),
            ).rejectedWith("registry unreachable");
        });
    });

    describe("ensureChipBins", () => {
        let targetDir: string;

        beforeEach(async () => {
            targetDir = await fsp.mkdtemp(pathMod.join(osMod.tmpdir(), "matter-chip-bins-test-"));
        });

        afterEach(async () => {
            await fsp.rm(targetDir, { recursive: true, force: true });
        });

        function fakeDocker() {
            const pulls = new Array<string>();
            const extracts = new Array<string>();
            const handle: ChipBinsDockerHandle = {
                async pull(imageRef) {
                    pulls.push(imageRef);
                },
                async extractApps(imageRef) {
                    extracts.push(imageRef);
                },
            };
            return { handle, pulls, extracts };
        }

        it("pulls and extracts, then writes a stamp file, on an empty target directory", async () => {
            const { handle, pulls, extracts } = fakeDocker();

            const result = await mod.ensureChipBins("sometag", targetDir, handle);

            expect(result).deep.equal({ tag: "sometag", dir: targetDir, extracted: true });
            expect(pulls).deep.equal([`${mod.CERT_BINS_IMAGE}:sometag`]);
            expect(extracts).deep.equal([`${mod.CERT_BINS_IMAGE}:sometag`]);

            const stamp = await fsp.readFile(pathMod.join(targetDir, "CHIP_REF"), "utf-8");
            expect(stamp).equal("sometag");
        });

        it("skips extraction entirely when the stamp already matches the requested tag", async () => {
            const first = fakeDocker();
            await mod.ensureChipBins("sometag", targetDir, first.handle);

            const second = fakeDocker();
            const result = await mod.ensureChipBins("sometag", targetDir, second.handle);

            expect(result).deep.equal({ tag: "sometag", dir: targetDir, extracted: false });
            expect(second.pulls).deep.equal([]);
            expect(second.extracts).deep.equal([]);
        });

        it("re-extracts when the requested tag differs from the cached stamp", async () => {
            const first = fakeDocker();
            await mod.ensureChipBins("old-tag", targetDir, first.handle);

            const second = fakeDocker();
            const result = await mod.ensureChipBins("new-tag", targetDir, second.handle);

            expect(result).deep.equal({ tag: "new-tag", dir: targetDir, extracted: true });
            expect(second.pulls).deep.equal([`${mod.CERT_BINS_IMAGE}:new-tag`]);
            expect(second.extracts).deep.equal([`${mod.CERT_BINS_IMAGE}:new-tag`]);

            const stamp = await fsp.readFile(pathMod.join(targetDir, "CHIP_REF"), "utf-8");
            expect(stamp).equal("new-tag");
        });

        it("does not write the stamp, and retries on the next call, when extraction fails", async () => {
            const failing: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps() {
                    throw new Error("docker run failed");
                },
            };

            await expect(mod.ensureChipBins("sometag", targetDir, failing)).rejectedWith("docker run failed");

            await expect(fsp.readFile(pathMod.join(targetDir, "CHIP_REF"), "utf-8")).rejected;

            const retry = fakeDocker();
            const result = await mod.ensureChipBins("sometag", targetDir, retry.handle);
            expect(result.extracted).equal(true);
            expect(retry.extracts).deep.equal([`${mod.CERT_BINS_IMAGE}:sometag`]);
        });

        it("throws a named ChipBinsPermissionError naming rootless Docker/Podman and MATTER_CHIP_BINS_DIR when the stamp write is denied", async function () {
            if (process.getuid?.() === 0) {
                // Permission bits are unenforceable when running as root (e.g. some CI/container
                // setups); the scenario this test simulates cannot occur for a root invoker.
                this.skip();
            }

            const { handle } = fakeDocker();
            await fsp.chmod(targetDir, 0o500);

            try {
                let caught: unknown;
                try {
                    await mod.ensureChipBins("sometag", targetDir, handle);
                } catch (e) {
                    caught = e;
                }

                expect(caught).instanceOf(mod.ChipBinsPermissionError);
                expect((caught as Error).message).match(/rootless Docker\/Podman/);
                expect((caught as Error).message).match(/MATTER_CHIP_BINS_DIR/);
            } finally {
                await fsp.chmod(targetDir, 0o700);
            }
        });

        it("always requests the arm64 platform regardless of host architecture", async () => {
            const platforms = new Array<string>();
            const handle: ChipBinsDockerHandle = {
                async pull(_imageRef, platform) {
                    platforms.push(platform);
                },
                async extractApps(_imageRef, platform) {
                    platforms.push(platform);
                },
            };

            await mod.ensureChipBins("sometag", targetDir, handle);

            expect(platforms).deep.equal([mod.CERT_BINS_PLATFORM, mod.CERT_BINS_PLATFORM]);
        });
    });

    describe("assertChipBinsDirOwnership", () => {
        let dir: string;

        beforeEach(async () => {
            dir = await fsp.mkdtemp(pathMod.join(osMod.tmpdir(), "matter-chip-bins-ownership-test-"));
        });

        afterEach(async () => {
            await fsp.rm(dir, { recursive: true, force: true });
        });

        it("passes silently when the directory does not exist yet", async () => {
            await fsp.rm(dir, { recursive: true, force: true });
            await expect(mod.assertChipBinsDirOwnership(dir)).fulfilled;
        });

        it("passes silently when the directory is owned by this process", async () => {
            await expect(mod.assertChipBinsDirOwnership(dir)).fulfilled;
        });

        it("rejects with ChipBinsOwnershipError when the directory's owning uid differs from this process's", async function () {
            const originalGetuid = process.getuid;
            if (originalGetuid === undefined) {
                this.skip();
            }

            process.getuid = () => originalGetuid() + 1;
            try {
                let caught: unknown;
                try {
                    await mod.assertChipBinsDirOwnership(dir);
                } catch (e) {
                    caught = e;
                }

                expect(caught).instanceOf(mod.ChipBinsOwnershipError);
                expect((caught as Error).message).contain(dir);
                expect((caught as Error).message).match(/MATTER_CHIP_BINS_DIR/);
            } finally {
                process.getuid = originalGetuid;
            }
        });

        it("skips the check when MATTER_CHIP_BINS_DIR is set explicitly, even for a uid mismatch", async function () {
            const originalGetuid = process.getuid;
            if (originalGetuid === undefined) {
                this.skip();
            }

            process.env.MATTER_CHIP_BINS_DIR = dir;
            process.getuid = () => originalGetuid() + 1;
            try {
                await expect(mod.assertChipBinsDirOwnership(dir)).fulfilled;
            } finally {
                process.getuid = originalGetuid;
            }
        });

        it("skips the check when process.getuid is unavailable, even for a uid mismatch", async function () {
            const originalGetuid = process.getuid;
            if (originalGetuid === undefined) {
                this.skip();
            }

            Reflect.deleteProperty(process, "getuid");
            try {
                await expect(mod.assertChipBinsDirOwnership(dir)).fulfilled;
            } finally {
                process.getuid = originalGetuid;
            }
        });
    });

    describe("ensureChipBins ownership guard", () => {
        let targetDir: string;

        beforeEach(async () => {
            targetDir = await fsp.mkdtemp(pathMod.join(osMod.tmpdir(), "matter-chip-bins-test-"));
        });

        afterEach(async () => {
            await fsp.rm(targetDir, { recursive: true, force: true });
        });

        it("rejects before touching the stamp or docker when the target directory is foreign-owned", async function () {
            const originalGetuid = process.getuid;
            if (originalGetuid === undefined) {
                this.skip();
            }

            process.getuid = () => originalGetuid() + 1;
            const handle: ChipBinsDockerHandle = {
                async pull() {
                    throw new Error("must not be called");
                },
                async extractApps() {
                    throw new Error("must not be called");
                },
            };
            try {
                await expect(mod.ensureChipBins("sometag", targetDir, handle)).rejectedWith(mod.ChipBinsOwnershipError);
            } finally {
                process.getuid = originalGetuid;
            }
        });
    });

    describe("prepareChipBins", () => {
        let targetDir: string;

        beforeEach(async () => {
            targetDir = await fsp.mkdtemp(pathMod.join(osMod.tmpdir(), "matter-chip-bins-test-"));
            process.env.MATTER_CHIP_BINS_DIR = targetDir;
            process.env.MATTER_CHIP_BINS_TAG = "pinned-tag";
        });

        afterEach(async () => {
            await fsp.rm(targetDir, { recursive: true, force: true });
        });

        it("extracts into a tag-scoped subdirectory, so two tags never share a target directory", async () => {
            const firstExtracts = new Array<string>();
            const handleA: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps(_imageRef, _platform, dir) {
                    firstExtracts.push(dir);
                },
            };
            const resultA = await mod.prepareChipBins(handleA);
            expect(resultA.dir).equal(pathMod.join(targetDir, "pinned-tag"));
            expect(firstExtracts).deep.equal([pathMod.join(targetDir, "pinned-tag")]);

            mod.resetChipBinsPrepareCacheForTesting();
            process.env.MATTER_CHIP_BINS_TAG = "other-tag";

            const secondExtracts = new Array<string>();
            const handleB: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps(_imageRef, _platform, dir) {
                    secondExtracts.push(dir);
                },
            };
            const resultB = await mod.prepareChipBins(handleB);
            expect(resultB.dir).equal(pathMod.join(targetDir, "other-tag"));
            expect(secondExtracts).deep.equal([pathMod.join(targetDir, "other-tag")]);

            const stampA = await fsp.readFile(pathMod.join(targetDir, "pinned-tag", "CHIP_REF"), "utf-8");
            const stampB = await fsp.readFile(pathMod.join(targetDir, "other-tag", "CHIP_REF"), "utf-8");
            expect(stampA).equal("pinned-tag");
            expect(stampB).equal("other-tag");
        });

        it("still hits the per-tag stamp cache when re-preparing the same tag after the in-process memo is cleared", async () => {
            const handle1: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps() {},
            };
            const result1 = await mod.prepareChipBins(handle1);
            expect(result1.extracted).equal(true);

            mod.resetChipBinsPrepareCacheForTesting();

            let extractCalls = 0;
            const handle2: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps() {
                    extractCalls++;
                },
            };
            const result2 = await mod.prepareChipBins(handle2);
            expect(result2.extracted).equal(false);
            expect(extractCalls).equal(0);
        });

        it("memoizes concurrent calls to a single extraction", async () => {
            let extractCalls = 0;
            const handle: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps() {
                    extractCalls++;
                },
            };

            const [a, b] = await Promise.all([mod.prepareChipBins(handle), mod.prepareChipBins(handle)]);

            expect(a).deep.equal({
                tag: "pinned-tag",
                dir: pathMod.join(targetDir, "pinned-tag"),
                extracted: true,
            });
            expect(b).deep.equal(a);
            expect(extractCalls).equal(1);
        });

        it("clears the memo on failure so the next call retries instead of replaying the same rejection", async () => {
            const failing: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps() {
                    throw new Error("docker run failed");
                },
            };

            await expect(mod.prepareChipBins(failing)).rejectedWith("docker run failed");

            let extractCalls = 0;
            const succeeding: ChipBinsDockerHandle = {
                async pull() {},
                async extractApps() {
                    extractCalls++;
                },
            };

            const result = await mod.prepareChipBins(succeeding);
            expect(result).deep.equal({
                tag: "pinned-tag",
                dir: pathMod.join(targetDir, "pinned-tag"),
                extracted: true,
            });
            expect(extractCalls).equal(1);
        });
    });
});
