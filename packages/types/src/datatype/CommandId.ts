/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { ValidationOutOfBoundsError, validatorOf } from "../common/ValidationError.js";
import { TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";
import { Mei } from "./ManufacturerExtensibleIdentifier.js";

/**
 * A Command ID is a 32 bit number and indicates a command defined in a cluster specification.
 *
 * @see {@link MatterSpecification.v10.Core} § 7.18.2.18
 */
export type CommandId = Branded<number, "CommandId">;

export function CommandId(commandId: number, validate = true): CommandId {
    if (!validate) {
        return commandId as CommandId;
    }
    const { typeSuffix } = Mei.fromMei(commandId);
    if (typeSuffix >= 0x00 && typeSuffix <= 0xff) {
        return commandId as CommandId;
    }
    throw new ValidationOutOfBoundsError(`Invalid command ID: ${commandId}`);
}

export namespace CommandId {
    export const isValid = validatorOf(CommandId);

    export const isGlobalCommand = (commandId: CommandId): boolean => {
        return commandId >= 0xe0 && commandId <= 0xff;
    };
}

/** Tlv schema for an Command Id. */
export const TlvCommandId = new TlvWrapper<CommandId, number>(
    TlvUInt32,
    commandId => commandId,
    value => CommandId(value, false), // No automatic validation on decode
);
