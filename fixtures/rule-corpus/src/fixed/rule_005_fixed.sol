// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R005F { address owner = msg.sender; function run(address target, bytes calldata data) external { require(msg.sender == owner); (bool ok,) = target.delegatecall(data); require(ok); } }
