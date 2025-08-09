/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CRYPTO_GROUP_SIZE_BYTES, CRYPTO_PUBLIC_KEY_SIZE_BYTES } from "#general";

export const MINIMUM_COMMISSIONING_TIMEOUT_S = 3 * 60; // 3 minutes
export const STANDARD_COMMISSIONING_TIMEOUT_S = 15 * 60; // 15 minutes
export const MAXIMUM_COMMISSIONING_TIMEOUT_S = 48 * 60 * 60; // 48 hours (extended commissioning)

export const PAKE_PASSCODE_VERIFIER_LENGTH = CRYPTO_GROUP_SIZE_BYTES + CRYPTO_PUBLIC_KEY_SIZE_BYTES;
