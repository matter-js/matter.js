/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { Docker } from "../docker/docker.js";

/**
 * Which build of CHIP example-app/chip-tool binaries a test run uses.
 *
 * `"matterjs"` is matter.js's own image/build (`ghcr.io/matter-js/chip*`, or a directory the user
 * built themselves). `"cert-bins"` selects project-chip's official `connectedhomeip/chip-cert-bins`
 * image — the same binaries the official Matter Test Harness certifies against.
 */
export type ChipBinsSource = "matterjs" | "cert-bins";

/** Docker Hub repository publishing the official CHIP certification binaries. */
export const CERT_BINS_IMAGE = "connectedhomeip/chip-cert-bins";

/**
 * Maintainer-vetted default tag: the connectedhomeip commit SHA `chip-cert-bins` publishes for
 * Matter 1.6.1, verified pullable and `linux/arm64`-inventoried at the time this integration was
 * built. Override with `MATTER_CHIP_BINS_TAG`.
 */
export const DEFAULT_CERT_BINS_TAG = "df8bd0308caa0680e2a78cda724a959e5b385205";

/**
 * `chip-cert-bins` publishes `linux/arm64` only, at every tag on Docker Hub (no `amd64` manifest
 * has ever existed) — the official Test Harness targets Raspberry Pi hardware. Extraction always
 * requests this platform regardless of host architecture; on non-arm64 hosts Docker runs it under
 * emulation (QEMU), which is fine here since extraction only ever runs `cp`, never the app binaries
 * themselves.
 */
export const CERT_BINS_PLATFORM = "linux/arm64";

/**
 * Whether a container platform string (as used for `Container.Configuration.platform`, e.g.
 * `"linux/amd64"`) can run `chip-cert-bins` binaries bind-mounted into it. Verified directly: a
 * platform mismatch doesn't fail at pull/extract time, only later at `exec` — `chip/state.ts`'s
 * `configureContainer()` calls this up front so a mismatch fails fast with a clear error instead.
 */
export function chipBinsPlatformSupported(platform: string): boolean {
    return platform === CERT_BINS_PLATFORM;
}

/**
 * File written into an extraction target directory recording the tag last extracted there. Doubles
 * as the marker `cert-dsl.ts`'s `chipLocalMarkerRevision()` already reads for `RunRecord.chipRef` —
 * a cert-bins extraction populates that evidence field for free, with no separate wiring.
 */
const STAMP_FILE = "CHIP_REF";

function isChipBinsSource(value: string): value is ChipBinsSource {
    return value === "matterjs" || value === "cert-bins";
}

/**
 * Resolve which binary source a test run uses, from `MATTER_CHIP_BINS_SOURCE`. Unset (or empty)
 * means unchanged default behavior: matter.js's own build.
 */
export function resolveChipBinsSource(): ChipBinsSource {
    const value = env.MATTER_CHIP_BINS_SOURCE;

    if (value === undefined || value === "") {
        return "matterjs";
    }

    if (isChipBinsSource(value)) {
        return value;
    }

    throw new Error(`Unknown MATTER_CHIP_BINS_SOURCE "${value}" (expected "matterjs" or "cert-bins")`);
}

/** The tag requested via `MATTER_CHIP_BINS_TAG`, before resolving a possible `"latest"`. */
export function requestedChipBinsTag(): string {
    return env.MATTER_CHIP_BINS_TAG || DEFAULT_CERT_BINS_TAG;
}

/** Base host directory under which `chip-cert-bins` binaries are extracted, one subdirectory per tag. */
export function chipBinsDir(): string {
    return env.MATTER_CHIP_BINS_DIR || join(tmpdir(), "matter-js-chip-cert-bins");
}

/** Everything Docker itself allows in an image tag — also all that's safe to use verbatim as a directory name. */
const VALID_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function assertValidTag(tag: string): void {
    if (!VALID_TAG.test(tag)) {
        throw new Error(`Invalid chip-cert-bins tag "${tag}" (expected Docker's tag grammar, e.g. a commit SHA)`);
    }
}

/**
 * Directory a given tag's binaries extract into and are cached under, one level below
 * {@link chipBinsDir}. Scoping by tag means two runs against different tags can never clobber each
 * other's `rm -rf`/`cp -a`/stamp-write, even sharing one `MATTER_CHIP_BINS_DIR` — each tag gets its own
 * subtree, created fresh on first use.
 *
 * This does not make same-tag concurrency safe: two runs racing to extract the *same* tag into the
 * same base directory at once can still interleave their `rm -rf`/`cp -a`/stamp-write (no cross-process
 * lock exists). Point concurrent runs at different `MATTER_CHIP_BINS_DIR` values if they might extract
 * the same tag at the same time — see the README's "Choosing a CHIP binary source" section.
 */
export function chipBinsExtractionDir(tag: string, baseDir: string = chipBinsDir()): string {
    assertValidTag(tag);
    return join(baseDir, tag);
}

/** Injectable so `"latest"` resolution is unit-testable without a network call. */
export type LatestTagResolver = () => Promise<string>;

interface DockerHubTag {
    name: string;
    tag_last_pushed: string;
}

const COMMIT_SHA_TAG = /^[0-9a-f]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDockerHubTag(value: unknown): value is DockerHubTag {
    return isRecord(value) && typeof value.name === "string" && typeof value.tag_last_pushed === "string";
}

/**
 * Narrows Docker Hub's tags-list response to the shape this integration depends on
 * (`{ results?: [{ name, tag_last_pushed }, ...] }`), so a shape drift on their end throws a clear,
 * named error here instead of a `TypeError` from deep inside the later `.sort()`/`.name` access.
 */
export function parseDockerHubTagsResponse(body: unknown): DockerHubTag[] {
    if (!isRecord(body) || (body.results !== undefined && !Array.isArray(body.results))) {
        throw new Error(
            `Docker Hub tags response for ${CERT_BINS_IMAGE} did not match the expected shape ` +
                `(expected { results?: Array<{ name: string, tag_last_pushed: string }> })`,
        );
    }

    const { results } = body;
    if (results === undefined) {
        return [];
    }

    if (!results.every(isDockerHubTag)) {
        throw new Error(
            `Docker Hub tags response for ${CERT_BINS_IMAGE} contained a tag entry that did not match the ` +
                `expected shape ({ name: string, tag_last_pushed: string })`,
        );
    }

    return results;
}

/**
 * There is no `latest` tag on the registry — every `chip-cert-bins` tag is a connectedhomeip commit
 * SHA. Resolving "latest" means finding the most-recently-pushed SHA tag via the Docker Hub API.
 */
async function fetchLatestChipBinsTag(): Promise<string> {
    const response = await fetch(`https://hub.docker.com/v2/repositories/${CERT_BINS_IMAGE}/tags?page_size=100`);
    if (!response.ok) {
        throw new Error(`Docker Hub tag lookup for ${CERT_BINS_IMAGE} failed: HTTP ${response.status}`);
    }

    const shaTags = parseDockerHubTagsResponse(await response.json()).filter(tag => COMMIT_SHA_TAG.test(tag.name));
    if (!shaTags.length) {
        throw new Error(`Docker Hub returned no commit-SHA tags for ${CERT_BINS_IMAGE}`);
    }

    shaTags.sort((a, b) => b.tag_last_pushed.localeCompare(a.tag_last_pushed));
    return shaTags[0].name;
}

/**
 * Resolve a requested tag to a concrete one. Anything other than the literal string `"latest"`
 * passes through unchanged (a pinned SHA, or a maintainer-curated default) — reproducible, no
 * network access. `"latest"` is a live lookup, gated behind this explicit opt-in rather than made
 * the default so ordinary runs stay reproducible without depending on network access.
 */
export async function resolveChipBinsTag(
    requested: string,
    fetchLatest: LatestTagResolver = fetchLatestChipBinsTag,
): Promise<string> {
    if (requested !== "latest") {
        return requested;
    }
    return fetchLatest();
}

/** The subset of {@link Docker} extraction needs, narrowed so tests can substitute a fake. */
export interface ChipBinsDockerHandle {
    pull(imageRef: string, platform: string): Promise<void>;
    extractApps(imageRef: string, platform: string, targetDir: string): Promise<void>;
}

function realChipBinsDockerHandle(): ChipBinsDockerHandle {
    const docker = new Docker();
    return {
        pull(imageRef, platform) {
            return docker.pull(imageRef, platform);
        },
        async extractApps(imageRef, platform, targetDir) {
            // Mirrors the official Test Harness's own update-sample-apps.sh: `rm` the target before
            // `cp -a`, not just `cp -a` alone — a tag switch can drop an app the previous tag had,
            // and `cp -a` never removes a destination file absent from the source, so skipping the
            // `rm` would leave a stale binary from the old tag sitting under the new tag's stamp.
            // Uses docker run -v ... rather than `docker cp`, so extraction needs no tar-stream
            // dependency of its own.
            //
            // `cp -a src/.` also replicates /root/apps' root ownership onto the bind-mounted target,
            // so on hosts where container root is real root (native Linux docker) a non-root invoker
            // could no longer write the stamp file — restore ownership to the invoking user.
            const uid = process.getuid?.();
            const gid = process.getgid?.();
            const restoreOwnership = uid !== undefined && gid !== undefined ? ` && chown -R ${uid}:${gid} /out` : "";
            const container = await docker.start({
                image: imageRef,
                platform,
                command: ["bash", "-c", `rm -rf /out/* && cp -a /root/apps/. /out/${restoreOwnership}`],
                binds: { [targetDir]: "/out" },
                autoRemove: true,
            });
            await container.wait();
        },
    };
}

export interface EnsureChipBinsResult {
    tag: string;
    dir: string;
    /** False when the target directory already held this exact tag's binaries; extraction was skipped. */
    extracted: boolean;
}

async function readStamp(stampPath: string): Promise<string | undefined> {
    try {
        return (await readFile(stampPath, "utf-8")).trim();
    } catch {
        return undefined;
    }
}

/**
 * Ensure `targetDir` holds `chip-<app>-app`/`chip-tool` binaries extracted from
 * `connectedhomeip/chip-cert-bins:<tag>`. Lazy and cached: if `targetDir`'s stamp file already
 * records `tag`, this is a no-op. A stamp mismatch (different tag, or no stamp at all — including a
 * prior extraction that crashed before writing one) triggers a fresh pull + extract, so a partial
 * failure self-heals on the next call rather than wedging the cache.
 */
export async function ensureChipBins(
    tag: string,
    targetDir: string,
    docker: ChipBinsDockerHandle = realChipBinsDockerHandle(),
): Promise<EnsureChipBinsResult> {
    const stampPath = join(targetDir, STAMP_FILE);

    const cachedTag = await readStamp(stampPath);
    if (cachedTag === tag) {
        return { tag, dir: targetDir, extracted: false };
    }

    await mkdir(targetDir, { recursive: true });

    const imageRef = `${CERT_BINS_IMAGE}:${tag}`;
    await docker.pull(imageRef, CERT_BINS_PLATFORM);
    await docker.extractApps(imageRef, CERT_BINS_PLATFORM, targetDir);

    await writeFile(stampPath, tag);

    return { tag, dir: targetDir, extracted: true };
}

let preparePromise: Promise<EnsureChipBinsResult> | undefined;

/**
 * Resolve the configured tag and ensure it's extracted, memoized process-wide so the classic
 * yaml/python harness (`chip/state.ts`) and cert-test `chip-local` subjects
 * (`chip/cert/chip-app-subject.ts`) — both of which may call this once per process — share a single
 * pull/extract rather than racing each other. `docker` is injectable for tests only; production
 * callers always take the default.
 *
 * A failed attempt clears the memo so the next call retries instead of being stuck replaying the
 * same rejection for the rest of the process — matching `ensureChipBins()`'s own self-healing
 * behavior on a failed extraction.
 */
export function prepareChipBins(
    docker: ChipBinsDockerHandle = realChipBinsDockerHandle(),
): Promise<EnsureChipBinsResult> {
    if (preparePromise === undefined) {
        const promise = (async () => {
            const tag = await resolveChipBinsTag(requestedChipBinsTag());
            return ensureChipBins(tag, chipBinsExtractionDir(tag), docker);
        })();
        preparePromise = promise;
        promise.catch(() => {
            if (preparePromise === promise) {
                preparePromise = undefined;
            }
        });
    }
    return preparePromise;
}

/** Test-only: clears the process-wide memoization so each test starts from a clean slate. */
export function resetChipBinsPrepareCacheForTesting(): void {
    preparePromise = undefined;
}
