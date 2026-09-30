/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncObservable,
    BasicObservable,
    Observable,
    ObservableProxy,
    ObservableValue,
    Observer,
    ObserverGroup,
    observant,
    QuietObservable,
} from "#util/Observable.js";

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

describe("Observable.observed", () => {
    function track(observable: Observable) {
        const flips = new Array<boolean>();
        observable.observed.on(value => void flips.push(value));
        return flips;
    }

    it("emits only when the observed state flips", () => {
        const observable = Observable();
        const flips = track(observable);
        const first = () => {};
        const second = () => {};

        observable.on(first);
        observable.on(second);
        observable.off(first);
        observable.off(second);

        expect(flips).deep.equals([true, false]);
        expect(observable.isObserved).false;
    });

    it("starts from the observed state at first access", () => {
        const observable = Observable();
        observable.on(() => {});

        expect(observable.observed.value).true;
    });

    it("turns false when emission consumes the last once observer", () => {
        const observable = Observable();
        const flips = track(observable);

        observable.once(() => {});
        observable.emit();

        expect(flips).deep.equals([true, false]);
        expect(observable.isObserved).false;
    });

    it("ignores an observer that is not observant", () => {
        const observable = Observable();
        const flips = track(observable);
        const quiet: Observer = () => {};
        quiet[observant] = false;

        observable.on(quiet);

        expect(flips).deep.equals([]);
        expect(observable.isObserved).false;
    });

    it("turns false on dispose and on detach", () => {
        const disposed = Observable();
        const disposedFlips = track(disposed);
        disposed.on(() => {});
        disposed[Symbol.dispose]();

        const detached = new BasicObservable();
        const detachedFlips = track(detached);
        detached.on(() => {});
        detached.detachObservers();

        expect(disposedFlips).deep.equals([true, false]);
        expect(detachedFlips).deep.equals([true, false]);
    });

    it("keeps a once observer once when an observer of observed emits synchronously", () => {
        const observable = Observable();
        let calls = 0;
        observable.observed.on(isObserved => {
            if (isObserved) {
                observable.emit();
            }
        });

        observable.once(() => void calls++);
        observable.emit();

        expect(calls).equals(1);
    });

    it("resolves when awaited once an observer attaches", async () => {
        const observable = Observable();
        const attached = observable.observed.then(() => "attached");

        observable.on(() => {});

        expect(await attached).equals("attached");
    });

    describe("ObservableProxy", () => {
        it("does not count as observed without own observers", () => {
            const target = Observable();
            using proxy = new ObservableProxy(target);

            expect(target.isObserved).false;
            expect(proxy.isObserved).false;
        });

        it("flips the target when an observer attaches to the proxy", () => {
            const target = Observable();
            const flips = track(target);
            using proxy = new ObservableProxy(target);
            const observer = () => {};

            proxy.on(observer);
            expect(target.isObserved).true;
            proxy.off(observer);

            expect(flips).deep.equals([true, false]);
        });

        it("shares the observed state of the target", () => {
            const target = Observable();
            using proxy = new ObservableProxy(target);

            expect(proxy.observed).equals(target.observed);
        });

        it("turns the target false when a once observer of the proxy is consumed", () => {
            const target = Observable();
            const flips = track(target);
            using proxy = new ObservableProxy(target);

            proxy.once(() => {});
            target.emit();

            expect(flips).deep.equals([true, false]);
        });

        it("stops counting for an observable its emitter was moved to once the proxy has no observers", () => {
            const original = new BasicObservable();
            using proxy = new ObservableProxy(original);
            const observer = () => {};
            proxy.on(observer);
            const moved = new BasicObservable();
            moved.attachObservers(original.detachObservers()!);

            proxy.off(observer);

            expect(moved.isObserved).false;
        });

        it("stops counting for the target when only an observer that is not observant remains", () => {
            const target = Observable();
            const flips = track(target);
            using proxy = new ObservableProxy(target);
            let quietCalls = 0;
            const quiet: Observer = () => void quietCalls++;
            quiet[observant] = false;
            const loud = () => {};

            proxy.on(quiet);
            proxy.on(loud);
            proxy.off(loud);
            target.emit();

            expect(flips).deep.equals([true, false]);
            expect(quietCalls).equals(1);
        });

        it("keeps its emitter registered when a listener of the target's observed re-adds an observer", () => {
            const target = Observable();
            using proxy = new ObservableProxy(target);
            const first = () => {};
            let secondCalls = 0;
            const second = () => void secondCalls++;
            target.observed.on(isObserved => {
                if (!isObserved) {
                    proxy.on(second);
                }
            });

            proxy.on(first);
            proxy.off(first);
            target.emit();

            expect(target.isObserved).true;
            expect(secondCalls).equals(1);
        });

        it("tells the target about its observers only through on and off", () => {
            const calls = new Array<string>();
            class Target extends BasicObservable {
                override on(observer: Observer) {
                    calls.push("on");
                    super.on(observer);
                }
                override off(observer: Observer) {
                    calls.push("off");
                    super.off(observer);
                }
            }
            const target = new Target();
            using proxy = new ObservableProxy(target);
            const first = () => {};
            const second = () => {};

            proxy.on(first);
            proxy.on(second);
            proxy.off(first);
            proxy.off(second);

            expect(calls).deep.equals(["on", "off"]);
        });

        it("counts for the target once a proxy observer that is not observant is joined by one that is", () => {
            const target = Observable();
            const flips = track(target);
            using proxy = new ObservableProxy(target);
            const received = new Array<string>();
            const quiet: Observer = () => void received.push("quiet");
            quiet[observant] = false;

            proxy.on(quiet);
            expect(target.isObserved).false;
            proxy.on(() => void received.push("observant"));
            target.emit();

            expect(flips).deep.equals([true]);
            expect(received).deep.equals(["quiet", "observant"]);
        });

        it("turns the target false when the proxy is disposed", () => {
            const target = Observable();
            const flips = track(target);
            const proxy = new ObservableProxy(target);

            proxy.on(() => {});
            proxy[Symbol.dispose]();

            expect(flips).deep.equals([true, false]);
        });
    });

    describe("QuietObservable", () => {
        it("follows the observers of its sink", () => {
            const sink = Observable();
            using quiet = new QuietObservable({ sink });
            const flips = track(quiet);
            const observer = () => {};

            sink.on(observer);
            sink.off(observer);

            expect(flips).deep.equals([true, false]);
        });

        it("follows a sink set after first access", () => {
            const sink = Observable();
            sink.on(() => {});
            using quiet = new QuietObservable();
            const flips = track(quiet);

            quiet.sink = sink;
            quiet.sink = undefined;
            const replacement = Observable();
            quiet.sink = replacement;
            replacement.on(() => {});

            expect(flips).deep.equals([true, false, true]);
        });

        it("stops following a replaced sink", () => {
            const replaced = Observable();
            using quiet = new QuietObservable({ sink: replaced });
            expect(quiet.observed.value).false;
            expect(replaced.observed.isObserved).true;

            quiet.sink = Observable();

            expect(replaced.observed.isObserved).false;
        });

        it("reports an observer registered on itself", () => {
            using quiet = new QuietObservable();
            const observer = () => {};

            quiet.on(observer);

            expect(quiet.isObservedBy(observer)).true;
            expect(quiet.isObservedBy(() => {})).false;
        });
    });
});
