/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#MatterError.js";

/**
 * Errors thrown by crypto implementations.
 */
export class CryptoError extends MatterError {}

/**
 * Thrown when a crypto algorithm encounters invalid input.
 */
export class CryptoInputError extends MatterError {}

/**
 * Thrown when verification fails.
 */
export class CryptoVerifyError extends CryptoError {}

/**
 * Thrown when decryption fails.
 */
export class CryptoDecryptError extends CryptoError {}

/**
 * Thrown when cryptographic key parameters are invalid.
 */
export class KeyInputError extends CryptoInputError {}

/**
 * Thrown when verification fails because of an invalid signature format.
 */
export class SignatureEncodingError extends CryptoVerifyError {}
