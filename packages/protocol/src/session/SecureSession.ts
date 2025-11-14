/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subject } from "#action/server/Subject.js";
import type { Message } from "#codec/MessageCodec.js";
import type { Fabric } from "#fabric/Fabric.js";
import { MatterFlowError } from "#general";
import type { PeerAddress } from "#peer/PeerAddress.js";
import { Session } from "./Session.js";

export abstract class SecureSession extends Session {
    readonly isSecure = true;
    abstract fabric: Fabric | undefined;
    abstract peerAddress: PeerAddress;
    abstract subjectFor(message?: Message): Subject;
}

export namespace SecureSession {
    export function assert(session?: Session, errorText?: string): asserts session is SecureSession {
        if (!session?.isSecure) {
            throw new MatterFlowError(errorText ?? "Insecure session in secure context");
        }
    }
}
