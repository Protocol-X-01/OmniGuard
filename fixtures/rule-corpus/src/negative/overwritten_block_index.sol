// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NIndexOverwrite { function pick(address[] calldata entrants) external view returns(address) { uint256 index = block.timestamp % entrants.length; index = 0; return entrants[index]; } }
