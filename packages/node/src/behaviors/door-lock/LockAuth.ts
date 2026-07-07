/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, type Cipher } from "@matter/general";
import { fabricIdx, field, listOf, nullable, octstr, string, uint16, uint32, uint8 } from "@matter/model";
import { FabricIndex } from "@matter/types";
import { DoorLock } from "@matter/types/clusters/door-lock";

import CredentialType = DoorLock.CredentialType;
import LockDataType = DoorLock.LockDataType;

/**
 * Auth-related data types and pure helper functions for the DoorLock server implementation.
 */
export namespace LockAuth {
    /**
     * Reference to a credential by type and index.
     */
    export class CredentialRef {
        @field(uint8)
        credentialType!: CredentialType;

        @field(uint16)
        credentialIndex!: number;
    }

    /**
     * Stored user record with credential associations and fabric tracking.
     */
    export class User {
        @field(uint16)
        userIndex!: number;

        @field(string)
        userName = "";

        @nullable
        @field(uint32)
        userUniqueId: number | null = null;

        @field(uint8)
        userStatus: DoorLock.UserStatus = DoorLock.UserStatus.Available;

        @field(uint8)
        userType: DoorLock.UserType = DoorLock.UserType.UnrestrictedUser;

        @field(uint8)
        credentialRule: DoorLock.CredentialRule = DoorLock.CredentialRule.Single;

        @field(listOf(CredentialRef))
        credentials: DoorLock.Credential[] = [];

        @field(fabricIdx)
        creatorFabricIndex!: FabricIndex;

        @field(fabricIdx)
        lastModifiedFabricIndex!: FabricIndex;
    }

    /**
     * Stored credential record with encrypted data and fabric tracking.
     */
    export class Credential {
        @field(uint8)
        credentialType!: CredentialType;

        @field(uint16)
        credentialIndex!: number;

        @field(octstr)
        credentialData!: Bytes;

        @field(fabricIdx)
        creatorFabricIndex!: FabricIndex;

        @field(fabricIdx)
        lastModifiedFabricIndex!: FabricIndex;
    }

    export function credentialTypeToLockDataType(type: CredentialType): LockDataType {
        switch (type) {
            case CredentialType.ProgrammingPin:
                return LockDataType.ProgrammingCode;
            case CredentialType.Pin:
                return LockDataType.Pin;
            case CredentialType.Rfid:
                return LockDataType.Rfid;
            case CredentialType.Fingerprint:
                return LockDataType.Fingerprint;
            case CredentialType.FingerVein:
                return LockDataType.FingerVein;
            case CredentialType.Face:
                return LockDataType.Face;
            default:
                return LockDataType.Unspecified;
        }
    }

    /**
     * Encapsulates user/credential persistence with integrated encryption.
     *
     * All credential data mutations encrypt automatically; all queries decrypt automatically. Override
     * {@link DoorLockBaseServer.cipher} or {@link DoorLockBaseServer.auth} to customize.
     */
    export class Store {
        #state: { users: User[]; credentials: Credential[] };
        #cipher: Cipher;

        constructor(state: { users: User[]; credentials: Credential[] }, cipher: Cipher) {
            this.#state = state;
            this.#cipher = cipher;
        }

        // ── User queries ──

        findUser(userIndex: number): User | undefined {
            return this.#state.users.find(u => u.userIndex === userIndex);
        }

        findNextOccupiedUserIndex(afterIndex: number): number | null {
            let next: number | null = null;
            for (const u of this.#state.users) {
                if (u.userIndex > afterIndex && (next === null || u.userIndex < next)) {
                    next = u.userIndex;
                }
            }
            return next;
        }

        findAvailableUserIndex(maxUsers: number): number | null {
            const occupied = new Set(this.#state.users.map(u => u.userIndex));
            for (let i = 1; i <= maxUsers; i++) {
                if (!occupied.has(i)) return i;
            }
            return null;
        }

        findUserIndexForCredential(type: CredentialType, index: number): number | null {
            for (const user of this.#state.users) {
                if (user.credentials.some(c => c.credentialType === type && c.credentialIndex === index)) {
                    return user.userIndex;
                }
            }
            return null;
        }

        // ── User mutations ──

        addUser(user: User) {
            this.#state.users = [...this.#state.users, user];
        }

        replaceUser(userIndex: number, user: User) {
            this.#state.users = this.#state.users.map(u => (u.userIndex === userIndex ? user : u));
        }

        removeUser(userIndex: number) {
            this.#state.users = this.#state.users.filter(u => u.userIndex !== userIndex);
        }

        clearUsers() {
            this.#state.users = [];
        }

        // ── Credential queries ──

        findCredential(type: CredentialType, index: number): Credential | undefined {
            return this.#state.credentials.find(c => c.credentialType === type && c.credentialIndex === index);
        }

        findNextAvailableCredentialIndex(type: CredentialType, afterIndex: number, max: number): number | null {
            const occupied = new Set(
                this.#state.credentials.filter(c => c.credentialType === type).map(c => c.credentialIndex),
            );
            for (let i = afterIndex + 1; i <= max; i++) {
                if (!occupied.has(i)) return i;
            }
            return null;
        }

        findNextOccupiedCredentialIndex(type: CredentialType, afterIndex: number): number | null {
            let next: number | null = null;
            for (const c of this.#state.credentials) {
                if (c.credentialType === type && c.credentialIndex > afterIndex) {
                    if (next === null || c.credentialIndex < next) {
                        next = c.credentialIndex;
                    }
                }
            }
            return next;
        }

        isDuplicateCredential(type: CredentialType, data: Bytes, excludeIndex?: number): boolean {
            for (const cred of this.#state.credentials) {
                if (cred.credentialType !== type) continue;
                if (excludeIndex !== undefined && cred.credentialIndex === excludeIndex) continue;
                const decrypted = this.#cipher.decrypt(cred.credentialData);
                if (Bytes.areEqual(decrypted, data)) return true;
            }
            return false;
        }

        // ── Credential mutations (encrypt/decrypt handled internally) ──

        addCredential(type: CredentialType, index: number, data: Bytes, fabricIndex: FabricIndex) {
            const credRecord: Credential = {
                credentialType: type,
                credentialIndex: index,
                credentialData: this.#cipher.encrypt(data),
                creatorFabricIndex: fabricIndex,
                lastModifiedFabricIndex: fabricIndex,
            };
            this.#state.credentials = [...this.#state.credentials, credRecord];
        }

        updateCredentialData(type: CredentialType, index: number, data: Bytes, fabricIndex: FabricIndex) {
            const encrypted = this.#cipher.encrypt(data);
            this.#state.credentials = this.#state.credentials.map(c =>
                c.credentialType === type && c.credentialIndex === index
                    ? { ...c, credentialData: encrypted, lastModifiedFabricIndex: fabricIndex }
                    : c,
            );
        }

        removeCredential(type: CredentialType, index: number) {
            this.#state.credentials = this.#state.credentials.filter(
                c => !(c.credentialType === type && c.credentialIndex === index),
            );
        }

        removeAllCredentialsOfType(type: CredentialType) {
            this.#state.credentials = this.#state.credentials.filter(c => c.credentialType !== type);
        }

        // ── Direct crypto (for PIN validation, getNonUserCode responses) ──

        encrypt(data: Bytes): Bytes {
            return this.#cipher.encrypt(data);
        }

        decrypt(data: Bytes): Bytes {
            return this.#cipher.decrypt(data);
        }

        // ── State access (for iteration in PIN validation, etc.) ──

        get users(): readonly User[] {
            return this.#state.users;
        }

        get credentials(): readonly Credential[] {
            return this.#state.credentials;
        }
    }
}
