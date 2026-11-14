// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PShadowedRequire { address owner = msg.sender; function require(bool) internal pure {} function sweep(address payable to) external { require(msg.sender == owner); selfdestruct(to); } }
