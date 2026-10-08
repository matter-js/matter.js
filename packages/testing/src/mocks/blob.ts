/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monkey-patch Blob reads so they register with {@link MockTime.requireHostAsync}, as crypto does.
 *
 * Blob contents arrive on host time.  Unregistered, {@link MockTime.resolve} keeps advancing the clock while a read is
 * pending, so a slow host turns a read that takes milliseconds in production into seconds of virtual time and expires
 * protocol timeouts such as an OTA provider's QueryImage response.
 */

import { MockTime } from "./time.js";

if (typeof Blob !== "undefined") {
    const proto = Blob.prototype;

    const stream = proto.stream;
    proto.stream = function (this: Blob) {
        const source = stream.call(this).getReader();
        // A byte stream like the native one, so BYOB readers work as they do in production
        return new ReadableStream({
            type: "bytes",

            async pull(controller) {
                const { done, value } = await MockTime.requireHostAsync(source.read());
                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(value);
                }
            },

            cancel(reason) {
                return source.cancel(reason);
            },
        });
    };

    const arrayBuffer = proto.arrayBuffer;
    proto.arrayBuffer = function (this: Blob) {
        return MockTime.requireHostAsync(arrayBuffer.call(this));
    };

    const text = proto.text;
    proto.text = function (this: Blob) {
        return MockTime.requireHostAsync(text.call(this));
    };
}
