/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, InternalError } from "@matter/main";
import type { ClusterModel } from "@matter/model";
import type { CertStepContext } from "@matter/testing";
import type { CommandPayload, CommissionedRefs } from "./tc-support.js";
import {
    chipCommandField,
    describeValue,
    MATTERJS_NO_PAYLOAD,
    requireId,
    sendCommand,
    SIGNED_TYPES,
} from "./tc-support.js";

/**
 * The endpoint of the `tv` TH that acts as the video player. chip's tv-app hosts KeypadInput, TargetNavigator,
 * Channel, ContentLauncher, MediaInput, MediaPlayback, AudioOutput and ApplicationLauncher there (`tv-app.matter`);
 * matter.js's `TvTestInstance` hosts the clusters the cases send to on the same endpoint.
 */
export const TV_VIDEO_PLAYER_ENDPOINT = 1;

/** A command argument by field name. A field left out is not sent. */
export type TvCommandArgs = Record<string, number | string>;

/**
 * The TH-log payload of `command` sent with `args`, built from the command's model so both renderings name the sent
 * fields in model order: chip's decoded lines (a signed integer as `(signed)`, a string with its byte count) and
 * matter.js's `name: value` text.
 *
 * Takes integer, enum and string fields. Throws {@link InternalError} for an argument the command has no field for,
 * for a field of any other type, and for a string matter.js cannot print as a matchable value (empty, or carrying a
 * line break); a case that needs one of these extends this function.
 */
export function tvCommandPayload(cluster: ClusterModel, command: string, args: TvCommandArgs): CommandPayload {
    const model = cluster.commands.require(command);
    const what = `${cluster.name}.${model.name}`;
    const fields = model.children.map(field => ({ field, name: camelize(field.name) }));

    const unknown = Object.keys(args).filter(name => !fields.some(field => field.name === name));
    if (unknown.length) {
        throw new InternalError(`${what} has no field ${unknown.join(", ")}`);
    }

    const chip = new Array<RegExp>();
    const matterjs = new Array<string>();
    for (const { field, name } of fields) {
        const value = args[name];
        if (value === undefined) {
            continue;
        }
        const id = requireId(field.id, `${what}.${field.name}`);
        const metatype = field.effectiveMetatype;
        if (metatype === "integer" || metatype === "enum") {
            if (typeof value !== "number") {
                throw new InternalError(`${what} needs a number for ${name}`);
            }
            chip.push(chipCommandField({ id, value, signed: SIGNED_TYPES.has(field.primitiveBase?.name ?? "") }));
        } else if (metatype === "string") {
            if (typeof value !== "string") {
                throw new InternalError(`${what} needs a string for ${name}`);
            }
            if (value === "" || /[\n\r]/.test(value)) {
                throw new InternalError(`matter.js does not print ${what}.${name} "${value}" as a matchable value`);
            }
            chip.push(chipCommandField({ id, value }));
        } else {
            throw new InternalError(`${what}.${name} is a ${metatype} field, which tvCommandPayload does not render`);
        }
        matterjs.push(`${name}: ${value}`);
    }

    return {
        label: `${model.name} carries exactly ${describeValue(args)}`,
        chip,
        matterjs: matterjs.length ? matterjs.join(" ") : MATTERJS_NO_PAYLOAD,
    };
}

/**
 * A step in which the DUT sends `command` with `args` to the TH's video player endpoint, the TH answers with success
 * and the TH's log shows exactly that payload; see {@link sendCommand}.
 */
export function sendsTvCommand(
    commissioned: CommissionedRefs,
    cluster: ClusterModel,
    command: string,
    args: TvCommandArgs,
): (cx: CertStepContext) => Promise<void> {
    return commissioned.withRef("dut", (cx, ref) =>
        sendCommand(
            cx,
            ref,
            { cluster, endpoint: TV_VIDEO_PLAYER_ENDPOINT, command, args },
            tvCommandPayload(cluster, command, args),
        ),
    );
}
