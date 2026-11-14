// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NConstantSelection { function constantWord(uint256) internal pure returns(uint256) { return 1; } function pick(address[] calldata entrants) external view returns(address) { return entrants[constantWord(block.timestamp) % entrants.length]; } }
