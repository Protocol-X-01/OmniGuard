// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NBranches { mapping(address=>uint256) credits; function run(address target, bool choose) external {
if (choose) { (bool ok,) = target.call(""); require(ok); } else { credits[msg.sender] = 1; } } }
