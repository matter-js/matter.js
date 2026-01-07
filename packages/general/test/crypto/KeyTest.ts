/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CurveType, Key, KeyType } from "#crypto/Key.js";
import { Bytes } from "#util/Bytes.js";

describe("Key", () => {
    describe("sec1", () => {
        it("decodes", () => {
            const key = Key({
                sec1: Fixture.sec1,
            });
            expect(key).deep.equal({
                kty: KeyType.EC,
                crv: CurveType.p256,
                d: "rvNIQRbpSB7Fe-BHLfQb9JkGTlAkrYaeyl6ImALUgHU",
                x: "PDmJIkUrVcrzicJb0bykZWlSzLkOiGkkmthHRlMBTL8",
                y: "ldaHll4Da1IcUQN-a4zt78oetEBGaU-giILu1lGd7Lo",
            });
        });
    });

    describe("pkcs8", () => {
        it("decodes", () => {
            const key = Key({
                pkcs8: Fixture.pkcs8,
            });
            expect(key).deep.equal({
                kty: KeyType.EC,
                crv: CurveType.p256,
                d: "cn8QBcukfteCKp2TCUNiFhfP07edmvUouAHs-fGZIgQ",
                x: "YuK24br_jXSm_YIWxMtnozY6MeaRSSeS5hruYQJhSBM",
                y: "lnJe-V4UJoa6mPM5sP9lvDOL7Huei-C987J3SYJHYiA",
            });
        });
    });

    describe("spki", () => {
        it("decodes", () => {
            const key = Key({
                spki: Fixture.spki,
            });
            expect(key).deep.equal({
                kty: KeyType.EC,
                crv: CurveType.p256,
                x: "YuK24br_jXSm_YIWxMtnozY6MeaRSSeS5hruYQJhSBM",
                y: "lnJe-V4UJoa6mPM5sP9lvDOL7Huei-C987J3SYJHYiA",
            });
        });
    });

    describe("publicKey", () => {
        it("decodes", () => {
            const key = Key({
                publicKey: Fixture.publicKey,
            });
            expect(key).deep.equal({
                kty: KeyType.EC,
                crv: CurveType.p256,
                x: "EO8CqBqHtoEh-6jTGXj4B6MX5QqoqChEaCiRS5M96O0",
                y: "1KXDnJ_3GkzjZH_X9iZTt9JJX8ukwPR_h2iAA54HIEo",
            });
        });
    });
});

namespace Fixture {
    const b = (s: string) => Bytes.of(Bytes.fromHex(s));

    export const sec1 = b(
        "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba",
    );
    export const pkcs8 = b(
        "308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420727F1005CBA47ED7822A9D930943621617CFD3B79D9AF528B801ECF9F1992204",
    );
    export const spki = b(
        "3059301306072a8648ce3d020106082a8648ce3d0301070342000462e2b6e1baff8d74a6fd8216c4cb67a3363a31e691492792e61aee610261481396725ef95e142686ba98f339b0ff65bc338bec7b9e8be0bdf3b2774982476220",
    );
    export const publicKey = b(
        "0410ef02a81a87b68121fba8d31978f807a317e50aa8a828446828914b933de8edd4a5c39c9ff71a4ce3647fd7f62653b7d2495fcba4c0f47f876880039e07204a",
    );
}
