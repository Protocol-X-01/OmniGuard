// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NShadowedDestruct { function selfdestruct(uint256 value) internal pure returns(uint256) { return value; } function run() external pure returns(uint256) { return selfdestruct(1); } }
