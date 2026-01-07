/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CRYPTO_GROUP_SIZE_BYTES, CRYPTO_PUBLIC_KEY_SIZE_BYTES, Days, Minutes } from "#general";

export const MINIMUM_COMMISSIONING_TIMEOUT = Minutes(3);
export const STANDARD_COMMISSIONING_TIMEOUT = Minutes(15);
export const MAXIMUM_COMMISSIONING_TIMEOUT = Days(2); // extended commissioning

export const PAKE_PASSCODE_VERIFIER_LENGTH = CRYPTO_GROUP_SIZE_BYTES + CRYPTO_PUBLIC_KEY_SIZE_BYTES;
