// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R011V { function exact(uint256 expected) external view { require(address(this).balance == expected); } }
