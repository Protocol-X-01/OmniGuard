// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R005V { function run(address target, bytes calldata data) external { (bool ok,) = target.delegatecall(data); require(ok); } }
