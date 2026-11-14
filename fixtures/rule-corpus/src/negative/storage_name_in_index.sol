// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NIndex { uint256 index; function run(address target) external { uint256[] memory values = new uint256[](2); (bool ok,) = target.call(""); require(ok); values[index] = 1; } }
