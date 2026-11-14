// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NDeadline { function ready(uint256 deadline) external view returns(bool) { return block.timestamp >= deadline; } }
