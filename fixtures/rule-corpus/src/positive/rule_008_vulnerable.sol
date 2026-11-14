// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R008V { function pick(address[] calldata entrants) external view returns(address) {
return entrants[uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao))) % entrants.length]; } }
