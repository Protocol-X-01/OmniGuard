// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PAlias { function run(address target, bytes calldata data) external { address aliasTarget = target; (bool ok,) = aliasTarget.delegatecall(data); require(ok); } }
