// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NShadow { uint256 total; function run(address target) external returns(uint256) { uint256 total = 1; (bool ok,) = target.call(""); require(ok); total = 2; return total; } }
