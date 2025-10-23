/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validations such as "does this enum have children" are important for ensuring correctness but are formally to
 * restrictive base on the specification.  To keep these active without carrying spurious warnings we capture exceptions
 * to validation rules here.
 */
export namespace ValidationExceptions {
    export const AllowedEmptyEnums = new Set<string>([
        // Global types defined as enum but without specific fields
        "tag",

        // Extensions of ModeBase may define mode tags but the base cluster does not
        "ModeBase.ModeTagStruct.value",

        // This is the tag ID and is namespaced so we can't represent with a single enum
        "ModeSelect.SemanticTagStruct.value",

        // This is one of multiple *EffectVariant fields (depending on the EffectIdentifier field).  We could override
        // with a union type but then validation wouldn't be entirely accurate anyway, so we just leave as a bare uint16
        "OnOff.offWithEffect.effectVariant",

        // These are defined as broad ranges without specific values
        "OperationalState.OperationalStateEnum",

        // This is also defined in ranges
        "OperationalState.events.operationCompletion.completionErrorCode",

        // These have some values defined but we place in a separate enum so TS allows other values as well
        "OperationalState.ErrorStateEnum",
    ]);
}
