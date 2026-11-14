// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TypedImplementation {} contract PTypedTarget { function run(TypedImplementation target, bytes calldata data) external { (bool ok,) = address(target).delegatecall(data); require(ok); } }
