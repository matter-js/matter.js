/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ansi } from "#tools";
import { BackchannelCommand } from "../device/backchannel.js";
import { Subject } from "../device/subject.js";
import { Test } from "../device/test.js";
import { Container } from "../docker/container.js";
import { Docker } from "../docker/docker.js";
import { edit } from "../docker/edit.js";
import { Image } from "../docker/image.js";
import { Volume } from "../docker/volume.js";
import { afterRun, beforeRun } from "../mocha.js";
import { TestRunner } from "../runner.js";
import { RootTestDescriptor, TestDescriptor, TestFileDescriptor } from "../test-descriptor.js";
import { AccessoryServer } from "./accessory-server.js";
import type { chip } from "./chip.js";
import { Constants, ContainerPaths } from "./config.js";
import { ContainerCommandPipe } from "./container-command-pipe.js";
import { PicsFile } from "./pics/file.js";
import { PicsSource } from "./pics/source.js";
import { PythonTest } from "./python-test.js";
import { YamlTest } from "./yaml-test.js";

/**
 * Current process-wide state values.  Internal to this module.
 */
const Values = {
    isInitialized: false,
    subject: undefined as Subject.Factory | undefined,
    test: undefined as Test | undefined,
    mainContainer: undefined as Container | undefined,
    mdnsContainer: undefined as Container | undefined,
    defaultPics: undefined as PicsFile | undefined,
    defaultPicsFilename: undefined as string | undefined,
    tests: undefined as TestDescriptor.Filesystem | undefined,
    initializedSubjects: new WeakSet<Subject>(),
    activeSubject: undefined as Subject | undefined,
    singleUseSubject: false,
    closers: Array<() => Promise<void>>(),
    subjects: new Map<Subject.Factory, Record<string, Subject>>(),
    snapshots: new Map<Subject, {}>(),
    containerLifecycleInstalled: false,
    testMap: new Map<TestDescriptor, Test>(),
    pullBeforeTesting: true,
    commandPipe: undefined as ContainerCommandPipe | undefined,
};

/**
 * Internal state management for CHIP testing.
 */
export const State = {
    get container() {
        const container = Values.mainContainer;

        if (container === undefined) {
            throw new Error("Docker container is not initialized");
        }

        return container;
    },

    set subject(subject: Subject.Factory) {
        Values.subject = subject;
    },

    get subject() {
        const subject = Values.subject;

        if (subject === undefined) {
            throw new Error("no default subject configured");
        }

        return subject;
    },

    get pullBeforeTesting() {
        return Values.pullBeforeTesting;
    },

    set pullBeforeTesting(value: boolean) {
        Values.pullBeforeTesting = value;
    },

    get defaultPics() {
        if (Values.defaultPics === undefined) {
            throw new Error("PICS not initialized");
        }

        return Values.defaultPics;
    },

    get defaultPicsFilename() {
        if (Values.defaultPicsFilename === undefined) {
            throw new Error("PICS not initialized");
        }

        return Values.defaultPicsFilename;
    },

    get tests() {
        if (Values.tests === undefined) {
            throw new Error("CHIP test descriptor not loaded");
        }
        return Values.tests;
    },

    get test() {
        if (Values.test === undefined) {
            throw new Error("No active test");
        }

        return Values.test;
    },

    get isInitialized() {
        return Values.isInitialized;
    },

    /**
     * Setup.
     */
    async initialize() {
        if (Values.isInitialized) {
            return;
        }

        const { progress } = TestRunner.current;

        progress.update("Initializing containers");
        try {
            await initialize();

            const image = await State.container.image;
            const info = await image.inspect();
            const chipCommit = formatSha(info.Config.Labels["org.opencontainers.image.revision"] ?? "(unknown)");
            const imageVersion = info.Config.Labels["org.opencontainers.image.version"] ?? "(unknown)";
            const arch = info.Architecture;

            progress.success(
                `Initialized CHIP ${ansi.bold(chipCommit)} image ${ansi.bold(imageVersion)} for ${ansi.bold(arch)}`,
            );
        } catch (e) {
            progress.failure("Initializing containers");
            throw e;
        }
    },

    /**
     * Teardown.
     */
    async close() {
        // Subjects deactivate automatically but may be dangling if there was an error
        await State.deactivateSubject();

        let closer;
        while ((closer = Values.closers.pop())) {
            try {
                await closer();
            } catch (e) {
                console.error("Teardown error:", e);
            }
        }
    },

    /**
     * Add cleanup logic.
     */
    onClose(fn: () => Promise<void>) {
        Values.closers.push(fn);
    },

    /**
     * Hook mocha to initialize CHIP testing.
     */
    install() {
        if (Values.containerLifecycleInstalled) {
            return;
        }

        Values.containerLifecycleInstalled = true;
        beforeRun(State.initialize);
        afterRun(State.close);
    },

    /**
     * Run a CHIP test.
     */
    async run(test: Test, args: string[], beforeTest: (subject: Subject, test: Test) => void | Promise<void>) {
        const { reporter } = TestRunner.current;

        const subject = Values.activeSubject!;

        try {
            Values.test = test;
            await beforeTest(subject, test);
            await test.invoke(subject, reporter.beginStep.bind(reporter), args);
        } finally {
            Values.test = undefined;
        }
    },

    /**
     * Pass a backchannel command to the active subject.
     */
    backchannel(command: BackchannelCommand) {
        if (Values.activeSubject === undefined) {
            throw new Error(`Backchannel ${command.name} without active test subject`);
        }

        return Values.activeSubject.backchannel(command);
    },

    /**
     * Open a back-channel command pipe.
     */
    async openPipe(name: string) {
        if (Values.commandPipe === undefined) {
            Values.commandPipe = new ContainerCommandPipe(State.container, this);
            await Values.commandPipe.initialize();
            State.onClose(async () => {
                await Values.commandPipe?.close();
                Values.commandPipe = undefined;
            });
        }

        await Values.commandPipe.installForApp(name);
    },

    /**
     * Obtain a {@link Test}.
     */
    testFor(identifier: string | TestDescriptor): Test {
        if (typeof identifier === "string") {
            const maybeDescriptor = this.tests.stat(identifier)?.descriptor;
            if (maybeDescriptor === undefined) {
                throw new Error(`No such test ${identifier}`);
            }
            identifier = maybeDescriptor;
        }

        let test = Values.testMap.get(identifier);
        if (!test) {
            test = createTest(identifier);
            Values.testMap.set(identifier, test);
        }

        return test;
    },

    /**
     * Prepare the test environment for a subject.
     *
     * On first activation, commissions the subject.  Thereafter the subject is either already active or reactivated
     * here.
     */
    async activateSubject(
        factory: Subject.Factory,
        startCommissioned: boolean,
        test: Test,
        beforeStart?: chip.BeforeHook,
    ) {
        let subject;
        if (startCommissioned) {
            // We cache commissioned subjects
            subject = loadSubject(factory, test.descriptor.kind);
        } else {
            // No need to cache uncommissioned subjects
            subject = factory(test.descriptor.kind ?? "unknown");
        }

        if (Values.activeSubject === subject) {
            return;
        }

        const { progress } = TestRunner.current;

        await progress.subtask("activating subject", async () => {
            // Avahi restarts too slowly currently to do this for every test
            //await this.clearMdns();

            await State.container.exec(["bash", "-c", 'export GLOBIGNORE="/tmp/*_fifo_*"; rm -rf /tmp/*']);

            if (!startCommissioned) {
                // Initialize single-use subject
                await subject.initialize();
                State.onClose(subject.close.bind(subject));

                await beforeStart?.(subject, test);
                await subject.start();
            } else if (!Values.initializedSubjects.has(subject)) {
                // Initialize shared subject for first use
                await subject.initialize();
                State.onClose(subject.close.bind(subject));

                await beforeStart?.(subject, test);
                await subject.start();

                await test.initializeSubject(subject);

                const dir = storageDirFor(subject);

                // Capture state snapshot
                Values.snapshots.set(subject, await subject.snapshot());
                await State.container.exec(["bash", "-c", `mkdir -p ${dir} && cp -a /tmp/* ${dir}`]);

                Values.initializedSubjects.add(subject);
            } else {
                // Initialize shared subject for which we've cached post-initialization state
                const snapshot = Values.snapshots.get(subject);
                if (snapshot === undefined) {
                    // Internal error
                    throw new Error(`No snapshot captured for ${subject.id}`);
                }

                // Restore state snapshot
                await subject.restore(snapshot);
                await State.container.exec(["bash", "-c", `cp -a ${storageDirFor(subject)}/* /tmp`]);

                await beforeStart?.(subject, test);
                await subject.start();
            }
        });

        Values.activeSubject = subject;
        Values.singleUseSubject = !startCommissioned;
    },

    /**
     * Stop the current test subject, if any.
     *
     * This stops the subject but leaves it initialized (commissioned).  This allows us to quickly swap subjects depending
     * on the current test.
     *
     * Final teardown of subjects occurs once all tests complete.
     */
    async deactivateSubject() {
        if (Values.activeSubject === undefined) {
            return;
        }

        try {
            if (Values.singleUseSubject) {
                await Values.activeSubject.close();
            } else {
                await Values.activeSubject.stop();
            }
        } catch (e) {
            console.warn("Error deactivating test subject", e);
        } finally {
            Values.activeSubject = undefined;
        }
    },

    /**
     * Clear the MDNS cache.
     */
    async clearMdns() {
        if (!Values.mdnsContainer) {
            throw new Error("Cannot reset MDNS because MDNS container is not initialized");
        }

        // Active subjects will not be discoverable after we clear DNS
        await this.deactivateSubject();

        // Clear DNS
        await Values.mdnsContainer.exec("/bin/mdns-clear");
    },
};

/**
 * Perform one-time initialization required for CHIP testing.
 */
async function initialize() {
    await configureContainer();
    await configureScripts();
    await configurePics();
    await configureTests();
    await configureNetwork();

    Values.isInitialized = true;
}

/**
 * Start a container based on the matter.js's Docker image.
 */
async function configureContainer() {
    const docker = new Docker();

    let platform = Constants.platform;

    if (Values.pullBeforeTesting) {
        await docker.pull(Constants.imageName, platform);
    } else if (Constants.selectedPlatform === undefined) {
        // Without pull, use whatever platform is available unless explicitly configured
        const arch = (await Image(docker, Constants.imageName).inspect()).Architecture;
        platform = `linux/${arch}`;
    }

    const mdnsVolume = Volume(docker, Constants.mdnsVolumeName);
    await mdnsVolume.open();

    const composition = docker.compose("matter.js", {
        image: Constants.imageName,
        platform,
        binds: { [mdnsVolume.name]: "/run/dbus" },
        autoRemove: true,

        // Meh.  Don't have non-host network working yet
        network: "host", //Network(docker, Constants.networkName),
    });

    await composition.add({
        name: "dbus",
        command: ["/usr/bin/dbus-daemon", "--nopidfile", "--system", "--nofork"],
    });

    Values.mdnsContainer = await composition.add({
        name: "mdns",
        command: ["/bin/mdns-run"],
    });

    Values.mainContainer = await composition.add({
        name: "chip",
        recreate: true,
    });

    State.onClose(async () => {
        try {
            await composition.close();
        } catch (e) {
            console.error("Error terminating containers:", e);
        }

        Values.mainContainer = undefined;
    });
}

/**
 * Monkey patch test scripts to work around bugs.
 */
async function configureScripts() {
    // There is no ack on the command pipe.  Writing to it is copied in a multitude of places (pending PR fixes some of
    // this).  Most places have a delay to try to compensate for lack of ack but in the "centralized" command writer the
    // delay is only 1 ms. which is sometimes too short for us.  Change to 20ms
    await State.container.edit(
        edit.sed("s/sleep(0.001)/sleep(.02)/"),

        // This is the one we actually use
        "/usr/local/lib/python3.12/dist-packages/matter/testing/matter_testing.py",

        // Patching here too just for completeness
        "/src/python_testing/matter_testing_infrastructure/matter/testing/matter_testing.py",
    );
}

/**
 * Create a PICS file in the container appropriate for matter.js.
 */
async function configurePics() {
    Values.defaultPics = await PicsSource.load(Constants.defaultPics);
    Values.defaultPicsFilename = await PicsSource.install(Values.defaultPics);
}

/**
 * Load tests defined in the container.
 */
async function configureTests() {
    const { container } = State;

    // Load test descriptors
    const descriptor = JSON.parse(await container.read(ContainerPaths.descriptorFile)) as RootTestDescriptor;

    // Ensure this is a supported container version
    if (descriptor.format !== TestDescriptor.CURRENT_FORMAT) {
        throw new Error(`Invalid descriptor format "${descriptor.format}" (expected ${TestDescriptor.CURRENT_FORMAT})`);
    }

    // Ensure test descriptor isn't empty
    if (!Array.isArray(descriptor.members)) {
        throw new Error(`CHIP test descriptor has no members`);
    }

    Values.tests = TestDescriptor.Filesystem(descriptor);
}

/**
 * Network "configuration" consists of activating the {@link AccessoryServer} used to field backchannel commands from
 * YAML tests and rewriting hard-coded addresses in files for python tests.
 */
async function configureNetwork() {
    const accessoryServer = await AccessoryServer.create(State);

    State.onClose(async () => {
        try {
            await accessoryServer.close();
        } catch (e) {
            console.error("Error closing accessory server:", e);
        }
    });

    // CHIP has 10.10.10.5 hard-coded as IP on linux.  With host networking we would have to add that to the host.  That
    // is undesirable as its platform- and network-specific.
    //
    // We could instead NAT with the bridge network but that will require working through IPv6 networking.  That's a
    // larger task.
    //
    // Instead we just rewrite the address back to the default 127.0.0.1 used by every other platform.
    //
    // While we're at it we rewrite the port so we can rely on dynamic allocation.  This ensures multiple suites may run
    // in parallel and something unexpectedly running on 9000 doesn't interfere with us.
    await State.container.edit(
        edit.sed("s/10.10.10.5/127.0.0.1/g", `s/_PORT = 9000/_PORT = ${accessoryServer.port}/g`),
        ContainerPaths.accessoryClient,
    );
}

/**
 * Obtain a subject.  Subjects are qualified by factory and test domain.
 */
function loadSubject(factory: Subject.Factory, kind: TestDescriptor["kind"]) {
    let forFactory = Values.subjects.get(factory);
    if (forFactory === undefined) {
        Values.subjects.set(factory, (forFactory = {}));
    }

    let subject = forFactory[kind];
    if (subject === undefined) {
        subject = forFactory[kind] = factory(kind);
    }

    return subject;
}

/**
 * If you look in /connectedhomeip/src/platform/linux/CHIPLinuxStorage.h you will see default paths hard-coded to /tmp
 * (irregardless of TMPDIR).  AFAICT these "defaults" are not configurable.  This is not helpful when running multiple
 * DUTs commissioned simultaneously under different profiles.
 *
 * Further, there are various configuration options required to specify different storage pools across two different
 * CHIP certification test frameworks.
 *
 * So we don't bother even trying to specify a storage directory explicitly.  We instead make sure that /tmp is always
 * correctly configured for the active test subject.
 *
 * This works out fine because we also reset state to "first commissioned" whenever starting a new test.  Within the
 * container this means copying the files into /tmp.
 */
function storageDirFor(subject: Subject) {
    return `"/storage/${subject.id}"`;
}

/**
 * Instantiate a test.
 */
function createTest(descriptor: TestDescriptor) {
    // Instantiate tests
    if (descriptor.name === undefined) {
        throw new Error(`A CHIP test has no name`);
    }

    if (descriptor.path === undefined) {
        throw new Error(`CHIP test ${descriptor.name} has no path`);
    }

    switch (descriptor.kind) {
        case "yaml":
            return new YamlTest(descriptor as TestFileDescriptor, State.container);

        case "py":
            return new PythonTest(descriptor as TestFileDescriptor, State.container);

        default:
            throw new Error(`Cannot implement CHIP test ${descriptor.name} of kind ${descriptor.kind}`);
    }
}

function formatSha(sha: string) {
    if (sha.startsWith("sha256:")) {
        sha = sha.substring(7);
    }
    return ansi.bold(sha.substring(0, 12));
}
