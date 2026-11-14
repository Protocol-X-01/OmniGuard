// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NOneDynamic { function hash(bytes calldata a, uint256 b) external pure returns(bytes32) { return keccak256(abi.encodePacked(a,b)); } }
