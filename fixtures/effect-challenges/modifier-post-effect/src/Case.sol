// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Base { address internal owner; constructor() { owner = msg.sender; } modifier onlyOwner() { _; require(msg.sender == owner); } }
contract Case is Base { function run(address target, bytes calldata data) external onlyOwner { (bool ok,) = target.delegatecall(data); require(ok); } }
