# Executable local witnesses

These six Foundry tests execute the complete vault pair under `fixtures/executable-vault/` in a local EVM. No chain, RPC, account key or deployment is used. Four unit cases cover transaction-origin authorization and ignored/checked payment failures. Two fuzz properties run 128 cases each with the fixed seed `0x1234`, reproducing an extra withdrawal in the vulnerable implementation and preserving the other depositor's balance in the fixed implementation.

```sh
forge test --root fixtures/security-tests --use 0.8.24
```

The fixture compiler is Solidity 0.8.24, matching the exact source pragma. Foundry may fetch that official compiler version if it is not already installed. Test remappings permit only the neighboring, authored vault fixtures.

The earlier `fixtures/vulnerable` and `fixtures/fixed` pair used for KAN-1 remains a historical static-workflow fixture. It has no deposit path, so its reentrancy result was an order-of-operations indicator, not an executable funded attack. The new complete pair includes deposit/credit initialization and demonstrates the mechanism without manufacturing otherwise unreachable storage state.

`reports/benchmarks/expanded-pack/foundry-witnesses.json` records the actual run. These witnesses establish these specific behaviors; they are not an audit of a production vault.
