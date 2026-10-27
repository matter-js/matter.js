/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import type { CertControllerGroup, GroupKeySetSpec } from "@matter/testing";

/**
 * The certification-only file matterjs-server reads from the root of its `--storage-path` at start, and only with
 * `--disable-auto-subscription`. It pre-provisions group key sets and the group key map into the server's own fabric,
 * which a groupcast needs before the WebSocket API is up, since that API has no command to install a key.
 */
export const CERT_CONTEXT_FILE = "cert-context.json";

const ADDRESS_POLICIES = {
    ianaAddr: "IanaAddr",
    perGroupId: "PerGroupId",
} as const;

export interface CertContextKeySet {
    groupKeySetId: number;

    /** 32 hex digits. */
    epochKey0: string;

    /** Unix-epoch microseconds. */
    epochStartTime0: number;

    groupKeySecurityPolicy: "TrustFirst" | "CacheAndSync";
}

export interface CertContextBinding {
    groupId: number;
    groupKeySetId: number;

    /** Absent, the server sends to the per-group address. */
    addressPolicy?: "IanaAddr" | "PerGroupId";
}

/** The content of {@link CERT_CONTEXT_FILE}, in the schema of matterjs-server's `certContext.ts`. */
export interface CertContextFile {
    keySets: CertContextKeySet[];
    groupKeyMap: CertContextBinding[];
}

/**
 * The file content that provisions `groups` on the server. Groups sharing a key set list it once. `groups` has passed
 * `validateControllerGroups`.
 */
export function certContextFor(groups: readonly CertControllerGroup[]): CertContextFile {
    const keySets = new Map<number, CertContextKeySet>();
    const groupKeyMap = new Array<CertContextBinding>();

    for (const { groupId, keySet, addressPolicy } of groups) {
        keySets.set(keySet.groupKeySetId, keySetEntryOf(keySet));
        groupKeyMap.push({
            groupId,
            groupKeySetId: keySet.groupKeySetId,
            ...(addressPolicy === undefined ? {} : { addressPolicy: ADDRESS_POLICIES[addressPolicy] }),
        });
    }

    return { keySets: [...keySets.values()], groupKeyMap };
}

function keySetEntryOf({ groupKeySetId, groupKeySecurityPolicy, epochKey0, epochStartTime0 }: GroupKeySetSpec) {
    return {
        groupKeySetId,
        epochKey0: Bytes.toHex(epochKey0),
        epochStartTime0: Number(epochStartTime0),
        groupKeySecurityPolicy: groupKeySecurityPolicy === 0 ? "TrustFirst" : "CacheAndSync",
    } satisfies CertContextKeySet;
}

/**
 * The NOTICE the server logs once it loaded the file (logger `GroupKeyConfig`). Its wording is a contract of the
 * server's `loadCertContext`.
 */
const LOADED_LINE = /Loaded group key configuration from (.+): (\d+) key sets, (\d+) groups/;

/** How the server's refusal of the file starts; the server then aborts its start. */
const REFUSED_LINE = /(?:Invalid|Cannot read|Cannot install) group key configuration.*/;

export interface CertContextLoaded {
    path: string;
    keySets: number;
    groups: number;
}

/** What a server line says it loaded, or `undefined` for any other line. */
export function certContextLoadedOf(line: string): CertContextLoaded | undefined {
    const match = LOADED_LINE.exec(line);
    if (match === null) {
        return undefined;
    }
    const [, path, keySets, groups] = match;
    return { path, keySets: Number(keySets), groups: Number(groups) };
}

/** The server's reason for refusing the file, from the line that states it, or `undefined` for any other line. */
export function certContextRefusalOf(line: string): string | undefined {
    return REFUSED_LINE.exec(line)?.[0];
}
