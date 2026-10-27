/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AttributePathSpec } from "@matter/testing";
import { expect } from "chai";
import {
    GROUP,
    GROUP_KEY_SET_ID,
    GROUPCAST_ID,
    GroupcastBranch,
    GROUPS_ENDPOINT,
    listsJoinedGroup,
    readRootGroupcast,
} from "../cert/tc-group-support.js";
import { CertCheckFailedError } from "../cert/tc-support.js";
import { fakeCertNode } from "./fake-cert-node.js";

const DESCRIPTOR_ID = 0x1d;

/** A node whose root answers `serverList` and, for the Groupcast cluster, `featureMap`. */
function rootNode(serverList: unknown, featureMap?: unknown) {
    const reads = new Array<AttributePathSpec>();
    const node = fakeCertNode({
        readAttribute: async path => {
            reads.push(path);
            return path.cluster === DESCRIPTOR_ID ? serverList : featureMap;
        },
    });
    return { node, reads };
}

describe("tc-group-support", () => {
    describe("readRootGroupcast", () => {
        it("reports no Groupcast, and reads no FeatureMap, for a root without the cluster", async () => {
            const { node, reads } = rootNode([DESCRIPTOR_ID, 0x1f]);
            expect(await readRootGroupcast(node)).deep.equals({ groupcast: false, listener: false });
            expect(reads).length(1);
        });

        it("reads Listener from a FeatureMap decoded into named bits", async () => {
            const { node, reads } = rootNode([GROUPCAST_ID], { listener: true });
            expect(await readRootGroupcast(node)).deep.equals({ groupcast: true, listener: true });
            expect(reads[1]).deep.equals({ endpoint: 0, cluster: GROUPCAST_ID, attribute: 0xfffc });
            expect(await readRootGroupcast(rootNode([GROUPCAST_ID], { listener: false }).node)).deep.equals({
                groupcast: true,
                listener: false,
            });
        });

        it("reads Listener from a raw FeatureMap number", async () => {
            expect(await readRootGroupcast(rootNode([BigInt(GROUPCAST_ID)], 0b011).node)).deep.equals({
                groupcast: true,
                listener: true,
            });
            expect(await readRootGroupcast(rootNode([GROUPCAST_ID], 0b010).node)).deep.equals({
                groupcast: true,
                listener: false,
            });
        });

        it("refuses a ServerList that is not a list", async () => {
            await expect(readRootGroupcast(rootNode(undefined).node)).rejectedWith(CertCheckFailedError, /ServerList/);
        });

        it("refuses a FeatureMap that names no features", async () => {
            await expect(readRootGroupcast(rootNode([GROUPCAST_ID], "x").node)).rejectedWith(
                CertCheckFailedError,
                /FeatureMap/,
            );
        });
    });

    describe("GroupcastBranch", () => {
        it("refuses to decide before step 1a learned the root", async () => {
            const branch = new GroupcastBranch();
            await expect(branch.legacyStepsApply()).rejectedWith(CertCheckFailedError, /step 1a/);
            await expect(branch.groupcastStepsApply()).rejectedWith(CertCheckFailedError, /step 1a/);
        });

        it("runs the legacy steps and skips the Groupcast ones for a TH without Groupcast", async () => {
            const branch = new GroupcastBranch();
            const check = await branch.learn(rootNode([DESCRIPTOR_ID]).node);
            expect(check.verdict).equals("pass");
            expect(check.detail).match(/does not name Groupcast/);
            expect(await branch.legacyStepsApply()).undefined;
            expect(await branch.groupcastStepsApply()).match(/does not name the Groupcast cluster/);
        });

        it("runs the Groupcast steps and skips the legacy ones for a listening TH", async () => {
            const branch = new GroupcastBranch();
            const check = await branch.learn(rootNode([GROUPCAST_ID], { listener: true }).node);
            expect(check.detail).match(/names Groupcast, and its FeatureMap names Listener/);
            expect(await branch.legacyStepsApply()).match(/names the Groupcast cluster, so the plan skips to step 6/);
            expect(await branch.groupcastStepsApply()).undefined;
        });

        it("skips both branches' Groupcast steps for a TH whose Groupcast cannot listen", async () => {
            const branch = new GroupcastBranch();
            await branch.learn(rootNode([GROUPCAST_ID], { listener: false }).node);
            expect(await branch.legacyStepsApply()).match(/skips to step 6/);
            expect(await branch.groupcastStepsApply()).match(/lacks the Listener feature/);
        });

        it("fails the check where the TH disagrees with the expected branch", async () => {
            const branch = new GroupcastBranch();
            expect((await branch.learn(rootNode([GROUPCAST_ID], { listener: true }).node, true)).verdict).equals(
                "pass",
            );
            const check = await branch.learn(rootNode([DESCRIPTOR_ID]).node, true);
            expect(check.verdict).equals("fail");
            expect(check.detail).match(/provisioned for a TH with it/);
        });

        it("checks a TH without Groupcast against a prediction without it", async () => {
            const branch = new GroupcastBranch();
            expect((await branch.learn(rootNode([DESCRIPTOR_ID]).node, false)).verdict).equals("pass");
            const check = await branch.learn(rootNode([GROUPCAST_ID], { listener: true }).node, false);
            expect(check.verdict).equals("fail");
            expect(check.detail).match(/provisioned for a TH without it/);
        });

        it("decides through a detached reference, as notApplicableAtRun calls it", async () => {
            const branch = new GroupcastBranch();
            await branch.learn(rootNode([GROUPCAST_ID], { listener: true }).node);
            const { legacyStepsApply, groupcastStepsApply } = branch;
            expect(await legacyStepsApply()).match(/skips to step 6/);
            expect(await groupcastStepsApply()).undefined;
        });

        it("forgets the root on reset", async () => {
            const branch = new GroupcastBranch();
            await branch.learn(rootNode([DESCRIPTOR_ID]).node);
            branch.reset();
            await expect(branch.legacyStepsApply()).rejectedWith(CertCheckFailedError, /step 1a/);
        });
    });

    describe("listsJoinedGroup", () => {
        const joined = { groupId: GROUP.id, endpoints: [GROUPS_ENDPOINT], keySetId: GROUP_KEY_SET_ID };

        it("accepts the entry the JoinGroup step creates", () => {
            expect(listsJoinedGroup([{ groupId: 7, endpoints: [2], keySetId: 3 }, joined])).true;
        });

        it("refuses another group, key set or endpoint", () => {
            expect(listsJoinedGroup([{ ...joined, groupId: GROUP.id + 1 }])).false;
            expect(listsJoinedGroup([{ ...joined, keySetId: GROUP_KEY_SET_ID + 1 }])).false;
            expect(listsJoinedGroup([{ ...joined, endpoints: [GROUPS_ENDPOINT + 1] }])).false;
            expect(listsJoinedGroup([{ ...joined, endpoints: undefined }])).false;
        });

        it("refuses what is not a membership list", () => {
            expect(listsJoinedGroup(undefined)).false;
            expect(listsJoinedGroup([])).false;
            expect(listsJoinedGroup([null, 1])).false;
        });
    });
});
