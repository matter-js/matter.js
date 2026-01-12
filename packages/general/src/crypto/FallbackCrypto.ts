/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  EcdsaSignature,
  PrivateKey,
  PublicKey,
  Bytes,
  HashAlgorithm,
  MaybePromise
} from "@matter/general";
import { Crypto } from "@matter/general";

// TODO - Logging `primaryCrypto` error if present? (could be error spam like `Unsupported: aes-128-ccm` )
/**
 * A {@link Crypto} implementation that provides automatic fallback support.
 * 
 * This class wraps two Crypto implementations: a primary and a fallback.
 * 
 * When any cryptographic operation fails on the primary implementation,
 * it automatically retries the operation using the fallback implementation.
 */
export class FallbackCrypto extends Crypto {
  implementationName = "FallbackCrypto";
  #primaryCrypto: Crypto;
  #fallbackCrypto: Crypto;

  constructor(primaryCrypto: Crypto, fallbackCrypto: Crypto) {
    super();

    this.#primaryCrypto = primaryCrypto;
    this.#fallbackCrypto = fallbackCrypto;
  }

  encrypt(key: Bytes, data: Bytes, nonce: Bytes, aad?: Bytes): Bytes {
    try {
      return this.#primaryCrypto.encrypt(key, data, nonce, aad);
    } catch (err) {
      return this.#fallbackCrypto.encrypt(key, data, nonce, aad);
    }
  }

  decrypt(key: Bytes, encrypted: Bytes, nonce: Bytes, aad?: Bytes): Bytes {
    try {
      return this.#primaryCrypto.decrypt(key, encrypted, nonce, aad);
    } catch (err) {
      return this.#fallbackCrypto.decrypt(key, encrypted, nonce, aad);
    }
  }

  randomBytes(length: number): Bytes {
    try {
      return this.#primaryCrypto.randomBytes(length);
    } catch (err) {
      return this.#fallbackCrypto.randomBytes(length);
    }
  }

  computeHash(
    data: Bytes | Bytes[] | ReadableStreamDefaultReader<Bytes> | AsyncIterator<Bytes>,
    algorithm?: HashAlgorithm,
  ): MaybePromise<Bytes> {
    try {
      return this.#primaryCrypto.computeHash(data, algorithm);
    } catch (err) {
      return this.#fallbackCrypto.computeHash(data, algorithm);
    }
  }

  createPbkdf2Key(secret: Bytes, salt: Bytes, iteration: number, keyLength: number): MaybePromise<Bytes> {
    try {
      return this.#primaryCrypto.createPbkdf2Key(secret, salt, iteration, keyLength);
    } catch (err) {
      return this.#fallbackCrypto.createPbkdf2Key(secret, salt, iteration, keyLength);
    }
  }

  createHkdfKey(secret: Bytes, salt: Bytes, info: Bytes, length?: number): MaybePromise<Bytes> {
    try {
      return this.#primaryCrypto.createHkdfKey(secret, salt, info, length);
    } catch (err) {
      return this.#fallbackCrypto.createHkdfKey(secret, salt, info, length);
    }
  }

  signHmac(key: Bytes, data: Bytes): MaybePromise<Bytes> {
    try {
      return this.#primaryCrypto.signHmac(key, data);
    } catch (err) {
      return this.#fallbackCrypto.signHmac(key, data);
    }
  }

  signEcdsa(privateKey: JsonWebKey, data: Bytes | Bytes[]): MaybePromise<EcdsaSignature> {
    try {
      return this.#primaryCrypto.signEcdsa(privateKey, data);
    } catch (err) {
      return this.#fallbackCrypto.signEcdsa(privateKey, data);
    }
  }

  verifyEcdsa(publicKey: JsonWebKey, data: Bytes, signature: EcdsaSignature): MaybePromise<void> {
    try {
      return this.#primaryCrypto.verifyEcdsa(publicKey, data, signature);
    } catch (err) {
      return this.#fallbackCrypto.verifyEcdsa(publicKey, data, signature);
    }
  }

  createKeyPair(): MaybePromise<PrivateKey> {
    try {
      return this.#primaryCrypto.createKeyPair();
    } catch (err) {
      return this.#fallbackCrypto.createKeyPair();
    }
  }

  generateDhSecret(key: PrivateKey, peerKey: PublicKey): MaybePromise<Bytes> {
    try {
      return this.#primaryCrypto.generateDhSecret(key, peerKey);
    } catch (err) {
      return this.#fallbackCrypto.generateDhSecret(key, peerKey);
    }
  }
}
