/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, MatterError } from "#general";
import { MAX_COUNTER_VALUE_32BIT } from "./MessageCounter.js";

/** 2^31 used for Duplicate detection in some cases. */
const MAX_COUNTER_INCREASE_2POW31 = Math.pow(2, 31);

/** Maximum number of previously processed message counters to accept from a given Node and key. */
const MSG_COUNTER_WINDOW_SIZE = 32;

export class DuplicateMessageError extends MatterError {}

export abstract class MessageReceptionState {
    abstract updateMessageCounter(messageCounter: number): void;
}

/**
 * Implements a message reception state for encrypted messages without rollover.
 * A counter in the range [(max_message_counter + 1) to (2^31 - 1)] SHALL be considered new, and cause the
 * max_message_counter value to be updated.
 * Message counters within the range of the bitmap SHALL be considered duplicate if the corresponding bit
 * offset is set to true. All other message counters SHALL be considered duplicate.
 */
export class MessageReceptionStateEncryptedWithoutRollover extends MessageReceptionState {
    protected maximumMessageCounter: number | undefined;
    private messageCounterBitmap = 0xffffffff; // All bits set to 1

    constructor(messageCounter?: number) {
        super();
        if (messageCounter !== undefined) {
            this.initialize(messageCounter);
        }
    }

    /** Initialize the message counter state. */
    private initialize(messageCounter: number) {
        this.maximumMessageCounter = messageCounter;
        this.messageCounterBitmap = 0xffffffff; // All bits set to 1
    }

    /**
     * Calculate plain diff without rollover.
     * This method is mainly overridden for other counter types and follow the following semantic
     * Return number is:
     * * negative if the new message counter is smaller than the current maximum. Smaller values within the Window size
     *   are check separately within the window. Other smaller values are considered DUPLICATE
     * * positive if the new message counter is larger than the current maximum and are always NEW
     */
    protected calculateDiff(messageCounter: number) {
        if (this.maximumMessageCounter === undefined) {
            return 0;
        }
        return messageCounter - this.maximumMessageCounter;
    }

    /** Update or move the message counter window. */
    private calculateMessageCounterBitmap(messageCounterBitmap: number, diff: number) {
        if (diff < 0) {
            // negative value means the new message counter is smaller than the current maximum
            if (diff < -MSG_COUNTER_WINDOW_SIZE) {
                throw new InternalError(`Message counter difference too large: ${diff}`);
            }
            // set the corresponding bit
            const bit = 1 << (-diff - 1);
            messageCounterBitmap |= bit;
        } else if (diff > 0) {
            // positive value means new message counter is larger than the current maximum
            if (diff <= MSG_COUNTER_WINDOW_SIZE) {
                // shift the bitmap and set the bit for the previous maximum
                const bit = 1 << (diff - 1);
                messageCounterBitmap = ((messageCounterBitmap << diff) >>> 0) | bit;
            } else {
                // diff is larger than the window size, so no previous message counter is known
                messageCounterBitmap = 0;
            }
        }
        return messageCounterBitmap >>> 0; // Stay 32 bit unsigned integer
    }

    /** Update the message counter and window. */
    private updateMessageCounterAndBitmap(messageCounter: number, diff: number) {
        if (this.maximumMessageCounter === undefined) {
            this.initialize(messageCounter);
            return;
        }

        this.messageCounterBitmap = this.calculateMessageCounterBitmap(this.messageCounterBitmap, diff);

        if (diff > 0 || diff < -MSG_COUNTER_WINDOW_SIZE) {
            this.maximumMessageCounter = messageCounter;
        }
    }

    /** Check if the message counter is known in the bitmap. */
    private isCounterKnownInBitmap(diff: number) {
        if (diff < -MSG_COUNTER_WINDOW_SIZE || diff >= 0) {
            throw new InternalError(`Invalid Message counter difference for check: ${diff}`);
        }
        const bit = 1 << (-diff - 1);
        return (this.messageCounterBitmap & bit) !== 0;
    }

    /**
     * Returns true if the message counter is a duplicate.
     */
    updateMessageCounter(messageCounter: number) {
        if (messageCounter < 0 || messageCounter > MAX_COUNTER_VALUE_32BIT) {
            throw new InternalError(`Invalid message counter value: ${messageCounter}`);
        }
        if (this.maximumMessageCounter === undefined) {
            this.updateMessageCounterAndBitmap(messageCounter, 0);
            return;
        }
        if (messageCounter === this.maximumMessageCounter) {
            throw new DuplicateMessageError("Message counter equals the maximum message counter.");
        }

        const diff = this.calculateDiff(messageCounter);
        // A counter in the range [(max_message_counter + 1) to (2^31 - 1)] SHALL be considered new, and cause the
        // max_message_counter value to be updated.
        // Message counters within the range of the bitmap SHALL be considered duplicate if the corresponding bit
        // offset is set to true. All other message counters SHALL be considered duplicate.
        if (diff < 0) {
            if (diff < -MSG_COUNTER_WINDOW_SIZE) {
                throw new DuplicateMessageError("Message counter is considered duplicate.");
            }
            if (this.isCounterKnownInBitmap(diff)) {
                throw new DuplicateMessageError("Message counter is within the message counter window and duplicate.");
            }
        }
        this.updateMessageCounterAndBitmap(messageCounter, diff);
    }
}

/**
 * Implements a message reception state for encrypted messages with rollover.
 * A message counter with rollover is a free running message counter that monotonically increases, but rolls
 * over to zero when it exceeds the maximum value of the counter (32-bits). If the difference is below 2^31 then it is
 * considered a rollover and not a smaller value
 */
export class MessageReceptionStateEncryptedWithRollover extends MessageReceptionStateEncryptedWithoutRollover {
    protected override calculateDiff(messageCounter: number) {
        if (this.maximumMessageCounter === undefined) {
            return 0;
        }
        // A message counter with rollover is a free running message counter that monotonically increases, but rolls
        // over to zero when it exceeds the maximum value of the counter (32-bits). if the difference is below 2^31 then it is considered a rollover and not a smaller value
        const diff = messageCounter - this.maximumMessageCounter;

        if (diff > 0) {
            // positive value means new message counter is larger than the current maximum
            if (diff < MAX_COUNTER_INCREASE_2POW31) {
                return diff;
            }
            return diff - MAX_COUNTER_VALUE_32BIT - 1;
        } else if (diff < 0) {
            // negative value means the new message counter is smaller than the current maximum
            if (diff >= -MAX_COUNTER_INCREASE_2POW31) {
                return diff;
            }
            return diff + MAX_COUNTER_VALUE_32BIT + 1;
        }
        return 0;
    }
}

/**
 * Implements a message reception state for unencrypted messages without rollover.
 * Any message counter equal to max_message_counter or within the message counter window, where the corresponding bit
 * is set to true SHALL be considered duplicate. All other message counters, whether behind the window or ahead of
 * max_message_counter, are considered new and SHALL update max_message_counter and shift the window accordingly.
 * Messages with a counter behind the window are likely caused by a node rebooting and are thus processed as rolling
 * back the window to the current location.
 */
export class MessageReceptionStateUnencryptedWithRollover extends MessageReceptionStateEncryptedWithoutRollover {
    protected override calculateDiff(messageCounter: number) {
        if (this.maximumMessageCounter === undefined) {
            return 0;
        }
        // A message counter with rollover is a free running message counter that monotonically increases, but rolls
        // over to zero when it exceeds the maximum value of the counter (32-bits).
        // Any message counter equal to max_message_counter or within the message counter window, where the corresponding
        // bit is set to true SHALL be considered duplicate. All other message counters, whether behind the window or
        // ahead of max_message_counter, are considered new and SHALL update max_message_counter
        const diff = messageCounter - this.maximumMessageCounter;

        if (diff > 0) {
            // positive value means new message counter is larger than the current maximum
            if (-diff + MAX_COUNTER_VALUE_32BIT < MSG_COUNTER_WINDOW_SIZE) {
                return diff - MAX_COUNTER_VALUE_32BIT - 1;
            }
            return diff;
        } else if (diff < 0) {
            // negative value means the new message counter is smaller than the current maximum
            if (diff < -MSG_COUNTER_WINDOW_SIZE) {
                return MAX_COUNTER_VALUE_32BIT + diff;
            }
            return diff;
        }
        return 0;
    }
}
