/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterModel } from "@matter/model";
import type { CertStepContext, TimedInteractionOptions } from "@matter/testing";
import { type CommandArgs, commandPayload } from "./tc-command-payload.js";
import type { CommissionedRefs } from "./tc-support.js";
import { sendCommand } from "./tc-support.js";

/**
 * The endpoint of the `tv` TH that acts as the video player. chip's tv-app hosts KeypadInput, TargetNavigator,
 * Channel, ContentLauncher, MediaInput, MediaPlayback, AudioOutput and ApplicationLauncher there (`tv-app.matter`);
 * matter.js's `TvTestInstance` hosts the clusters the cases send to on the same endpoint.
 */
export const TV_VIDEO_PLAYER_ENDPOINT = 1;

/**
 * The endpoint of the `tv` TH that acts as a content app. chip's tv-app hosts AccountLogin there (`tv-app.matter`);
 * matter.js's `TvTestInstance` hosts it on the same endpoint.
 */
export const TV_CONTENT_APP_ENDPOINT = 3;

/**
 * An application both `tv` THs launch, stop and hide with success. chip never checks CatalogList: for any catalog but
 * its own platform catalog 0xFFF1, which it matches without mapping, it maps `exampleid` to the content app it installs
 * and loads at startup for vendor 1. matter.js's `TestApplicationLauncherServer` knows the same ID and needs the
 * catalog in its CatalogList, which lists 123.
 */
export const TV_KNOWN_APPLICATION = { catalogVendorId: 123, applicationId: "exampleid" };

/** Where {@link sendsTvCommand} sends a command, and whether as a timed invoke. */
export interface TvCommandTarget {
    /** Default {@link TV_VIDEO_PLAYER_ENDPOINT}. */
    endpoint?: number;

    /** Set for a command with the timed quality; the TH refuses it untimed. */
    options?: TimedInteractionOptions;
}

/**
 * A step in which the DUT sends `command` with `args` to the TH, the TH answers with success and the TH's log shows
 * exactly that payload; see {@link sendCommand}.
 */
export function sendsTvCommand(
    commissioned: CommissionedRefs,
    cluster: ClusterModel,
    command: string,
    args: CommandArgs,
    { endpoint = TV_VIDEO_PLAYER_ENDPOINT, options }: TvCommandTarget = {},
): (cx: CertStepContext) => Promise<void> {
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(cx, ref, { cluster, endpoint, command, args, options }, commandPayload(cluster, command, args)),
    );
}
