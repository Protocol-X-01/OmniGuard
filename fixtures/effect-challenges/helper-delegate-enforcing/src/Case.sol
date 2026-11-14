// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Case { address owner; constructor() {owner=msg.sender;} function run(address target,bytes calldata data) external { require(msg.sender==owner); dispatch(target,data); } function dispatch(address callee,bytes memory payload) private { (bool ok,) = callee.delegatecall(payload); require(ok); } }
