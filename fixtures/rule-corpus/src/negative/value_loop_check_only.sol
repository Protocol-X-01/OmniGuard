// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NValueCheck { function check(uint256 count) external payable { for (uint256 i; i<count; i++) { require(msg.value > 0); } } }
