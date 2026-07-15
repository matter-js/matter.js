/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, BasicObservable, Observable, ObservableValue, ObserverGroup } from "#util/Observable.js";

// Observable deserves proper unit tests but is tested heavily via other modules.  Currently this file just tests a
// few spot cases

describe("ObservableGroup", () => {
    // Test for TS bug workaround
    it("supports variable argument lengths", () => {
        const observable = Observable<[foo: string, bar: boolean]>();
        const observers = new ObserverGroup();
        observers.on(observable, foo => {
            if (foo === "four") return;
        });
        observers.on(observable, (foo, bar) => {
            if (foo === "four") return;
            if (bar === true) return;
        });
    });

    it("installs observers", () => {
        const observable = Observable<[foo: string]>();
        const observers = new ObserverGroup();

        let observedValue: string | undefined;
        observers.on(observable, foo => {
            observedValue = foo;
        });

        expect(observable.isObserved).true;

        observable.emit("bar");

        expect(observedValue).equals("bar");
    });

    it("removes observers on close", () => {
        const observable = Observable<[foo: string]>();
        const observers = new ObserverGroup();

        observers.on(observable, () => {});

        expect(observable.isObserved);

        observers.close();

        expect(observable.isObserved).false;
    });
});

describe("Observable", () => {
    it("preserves once semantics across detach/attach", () => {
        const source = new BasicObservable<[value: number]>();
        const target = new BasicObservable<[value: number]>();

        const onceValues = new Array<number>();
        const persistentValues = new Array<number>();
        source.once(value => {
            onceValues.push(value);
        });
        source.on(value => {
            persistentValues.push(value);
        });

        const detached = source.detachObservers();
        expect(detached).not.undefined;
        target.attachObservers(detached!);

        target.emit(1);
        target.emit(2);

        expect(onceValues).deep.equals([1]);
        expect(persistentValues).deep.equals([1, 2]);
    });

    it("ends active iteration on dispose", async () => {
        const source = new BasicObservable<[value: number]>();

        const iterator = source[Symbol.asyncIterator]();
        const first = iterator.next();
        await Promise.resolve();

        source[Symbol.dispose]();

        expect((await first).done).true;
    });

    it("disarms source when last iterator exits", async () => {
        const source = new BasicObservable<[value: number]>();

        const iterator = source[Symbol.asyncIterator]();
        const first = iterator.next();
        await Promise.resolve();

        expect(source.isObserved).true;
        source.emit(1);
        expect((await first).value).equals(1);

        await iterator.return?.(undefined);

        expect(source.isObserved).false;
    });

    it("supports new iteration after previous iteration stopped", async () => {
        const source = new BasicObservable<[value: number]>();

        const iterator1 = source[Symbol.asyncIterator]();
        const first = iterator1.next();
        await Promise.resolve();
        source[Symbol.dispose]();
        await first;

        const iterator2 = source[Symbol.asyncIterator]();
        const second = iterator2.next();
        await Promise.resolve();
        source.emit(3);

        expect((await second).value).equals(3);
    });

    it("ends active iteration on detach and transfers only explicit observers", async () => {
        const source = new BasicObservable<[value: number]>();

        const values = new Array<number>();
        source.on(value => {
            values.push(value);
        });

        const iterator = source[Symbol.asyncIterator]();
        const first = iterator.next();
        await Promise.resolve();

        const detached = source.detachObservers();
        expect(detached).not.undefined;
        expect((await first).done).true;
        expect(detached!.observers?.size).equals(1);

        const target = new BasicObservable<[value: number]>();
        target.attachObservers(detached!);
        target.emit(2);
        expect(values).deep.equals([2]);
    });

    it("disarms the source on detach", () => {
        const source = new BasicObservable<[value: number]>();

        const values = new Array<number>();
        source.on(value => {
            values.push(value);
        });

        source.detachObservers();

        expect(source.isObserved).false;
        source.emit(1);
        expect(values).deep.equals([]);
    });
});

describe("AsyncObservable", () => {
    it("emits", async () => {
        const observable = AsyncObservable<[foo: string]>();

        let observedFoo;

        observable.on(async foo => {
            observedFoo = foo;
        });

        await observable.emit("what I expect");

        expect(observedFoo).equals("what I expect");
    });

    it("emits with mix of observers", async () => {
        const observable = AsyncObservable<[foo: string]>();

        const observedFoos = Array<string>();

        for (let i = 0; i < 3; i++) {
            observable.on(async foo => {
                observedFoos.push(foo);
            });

            observable.on(foo => {
                observedFoos.push(foo);
            });
        }

        await observable.emit("asdf");

        expect(observedFoos).deep.equals(["asdf", "asdf", "asdf", "asdf", "asdf", "asdf"]);
    });
});

describe("ObservableValue", () => {
    it("does not resolve for falsy value assignment and resolves for the next truthy value", async () => {
        const observable = ObservableValue<[value: string]>();

        const observedValues = Array<string>();
        observable.on(value => {
            observedValues.push(value);
        });

        let resolved = false;
        let resolvedValue: string | undefined;
        const done = observable.then(value => {
            resolved = true;
            resolvedValue = value;
        });

        observable.value = "";

        await MockTime.yield();
        expect(resolved).false;
        expect(observedValues).deep.equals([]);

        observable.value = "next";

        await done;
        expect(resolved).true;
        expect(resolvedValue).equals("next");
        expect(observedValues).deep.equals([]);
    });

    it("emits falsy values but resolves only when a truthy value is emitted", async () => {
        const observable = ObservableValue<[value: string]>();

        const observedValues = Array<string>();
        observable.on(value => {
            observedValues.push(value);
        });

        let resolved = false;
        let resolvedValue: string | undefined;
        const done = observable.then(value => {
            resolved = true;
            resolvedValue = value;
        });

        observable.emit("");

        await Promise.resolve();
        expect(observable.value).equals("");
        expect(resolved).false;
        expect(observedValues).deep.equals([""]);

        observable.emit("next");

        await done;
        expect(observable.value).equals("next");
        expect(resolved).true;
        expect(resolvedValue).equals("next");
        expect(observedValues).deep.equals(["", "next"]);
    });
});
