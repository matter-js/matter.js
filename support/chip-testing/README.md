# Chip Tool Testing

This package allows to run Chip tool certification tests and Python REPL tests against matter.js to validate the interoperability of
the implementation. This is done by providing comparable "Apps" - currently a limited "All-Clusters-App" and a "Bridge-App" like the examples used in the Matter-SDK.

The Available Tests in Chip tool are listed in the [Chip tool test catalog](https://github.com/project-chip/connectedhomeip/tree/master/src/app/tests/suites/certification).

## Prerequisites

In order to execute the tests you need to have used the connectedhomeip repository and have build a "chip-tool" binary. This binary and a lot more from the matter SDK is needed to execute the tests. This is because we use the same Python based test runner and framework.

Currently the tests are designed to work with a chip-tool and test framework compiled from the "master" of the connectedhomeip repository. This is needed because only this version includes all needed features and fixes. But this also means that the YAML files and PICS file used in master branch is not compliant with matter.js for now (unless we update to Matter 1.2+).

Please follow these steps to setup all this locally:

-   [Checkout Matter-SDK](https://github.com/project-chip/connectedhomeip/blob/master/docs/guides/BUILDING.md#checking-out-the-matter-code)
-   [Prepare for building](https://github.com/project-chip/connectedhomeip/blob/master/docs/guides/BUILDING.md#prepare-for-building)
-   Build chip-tool in an activated environment `./scripts/build/build_examples.py --target=linux-x64-chip-tool build` (replace linux by darwin if you run on macOs.)
-   Build Python Environment in an activated environment `./scripts/build_python.sh --install_virtual_env out/venv`
-   Copy the patched yaml files from support/chip-testing/patched-test-files to src/app/tests/suites/ (in connectedhomeip directory)
-   build matter.js so that the test binaries are also built

## Execution

### Executing YAML based tests locally

You can execute tests starting from the connectedhomeip directory (without activating the sdk environment) by using:

`scripts/run_in_build_env.sh 'scripts/tests/run_test_suite.py --runner chip_tool_python --log-level info --target-glob "{...tests...}" run --app-path all-clusters: <path-to-matter.js>/support/chip-testing/dist/esm/AllClustersTestApp.js --app-path bridge: <path-to-matter.js>/support/chip-testing/dist/esm/BridgeTestApp.js'`

Replace the "<path-to-matter.js>" placeholder with the local path to your matter.js repository.

Running all tests available right now (End january 2024) the normal "...tests..." would be
`--target-glob {Test_AddNewFabricFromExistingFabric,Test_TC_BINFO*,Test_TC_BRBINFO*,Test_TC_CADMIN*,Test_TC_CGEN*,Test_TC_CNET*,Test_TC_DESC*,Test_TC_?LABEL*,Test_TC_OO*,Test_TC_OPCREDS*,TestArmFailSafe,TestBasicInformation,TestCASERecovery,TestCommandsById,TestCommissioningWindow,TestFabricRemovalWhileSubscribed,TestGeneralCommissioning,TestMultiAdmin,TestOperationalCredentialsCluster,TestSelfFabricRemoval,TestSubscribe_*,TestUserLabelCluster*,TestDiscovery}`

Additionally, some manual (long running) tests can be executed by using these parameters

`--target-glob "{Test_TC_CADMIN_1_3,Test_TC_CADMIN_1_4,Test_TC_CADMIN_1_5,Test_TC_CADMIN_1_6,Test_TC_CADMIN_1_9,Test_TC_CADMIN_1_10,Test_TC_CADMIN_1_16,Test_TC_CADMIN_1_23,Test_TC_CADMIN_1_24}" --include-tags MANUAL`

The tests Test_TC_CADMIN_1_21 and Test_TC_CADMIN_1_22 cannot be executed because of an issue of the yaml test runner.

### Executing python REPL tests locally

The python tests are located inside the connectedhomeip repository as single python scripts. there is no runner or such. They are executed as needed by e.g. (for test CGEN_2_4)

`scripts/run_in_python_env.sh out/venv './scripts/tests/run_python_test.py --app <path-to-matter.js>/support/chip-testing/dist/esm/TestDeviceNode.js --factoryreset --app-args "--discriminator 1234 --KVS /tmp/kvs" --script "src/python_testing/TC_CGEN_2_4.py" --script-args "--storage-path admin_storage.json --manual-code 10054912339 --PICS src/app/tests/suites/certification/ci-pics-values --commissioning-method on-network"'`

The list of available test and their relevant parameters can be seen in the project-chip repository github test, e.g. https://github.com/project-chip/connectedhomeip/blob/160ed14cae009de51e5117dbf4abc2c6af6a6f53/.github/workflows/tests.yaml#L452 (this is a static link, make sure to check the latest master version!)

## Executing via CI

These tests are executed against the main branch of matter.js at the following conditions:

-   every night by schedule
-   can also be triggered on the main branch by using the "Chip Tool tests" workflow on GitHub.
-   When files are changed in some relevant folders (clusters, tlv) or in the chip-testing directory itself

Additionally, the tests can be triggered when the commit contains special keywords in the commit message. The following keywords are supported:

-   `[execute-chiptests]` to execute the tests on the current branch
-   `[execute-chiptests-long]` to execute the tests on the current branch including the long running tests
-   `[rebuild-chip]` to rebuild the chip-tool executable from the connectedhomeip repository used by the CI (Attention: this needs morre time!) The chip binaries are cached and only built once a day.
