# Which tests are patched in matter.js wand why?

## Tests

| Test                                   | Reason                                                                                        |
|----------------------------------------|-----------------------------------------------------------------------------------------------|
| TestAccessControlCluster.yaml          | see https://github.com/project-chip/connectedhomeip/issues/33578                              |

# CI-PICS

| PICS                      | Reason                                                                                                                 |
|---------------------------|------------------------------------------------------------------------------------------------------------------------|
| PICS_EVENT_LIST_ENABLED=1 | We support the eventlist global attribute and so also events, so state that here.                                      |
| WNCV.S.F03=1              | We support "Absolute position feature" and want to run tests for that too                                              |
| WNCV.S.M.Calibration=0    | We need to turn off calibration because the test expect a different behavior then we do in default implementation      |
| CC.S.F00=1                | We support "Hue/Saturation" feature and want to run tests for that too                                                 |
| PS.S.E01=0                | We do not support the optional Battery Fault Change event, so disable tests for that                                   |
| CNET.S.A0002..3=0         | We use an Ethernet Network commissioning cluster and so we do not have these two attributes, so disable tests for that |
| DESC.S.F00=0              | We do not provide a Taglist on Descriptor cluster, so disable tests for that                                           |
| PCC.S.A0005..c=0          | We provide a Constant pressure pump, so these attributes must not exist, so disable tests for that                     |

# Excluded tests
| Testname             | Reason                                                                    |
|----------------------|---------------------------------------------------------------------------|
| Test_TC_LVL_9_1.yaml | Test expects a group cluster with multiple groups support                 |
| Test_TC_OO_2_7.yaml  | Test expects a group cluster with multiple groups support                 |
