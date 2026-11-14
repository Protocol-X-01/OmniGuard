// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NShadowedHash { function keccak256(bytes memory) internal pure returns(bytes32) { return bytes32(0); } function hash(string calldata a, bytes calldata b) external pure returns(bytes32) { return keccak256(abi.encodePacked(a,b)); } }
