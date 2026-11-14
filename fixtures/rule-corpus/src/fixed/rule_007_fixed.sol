// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R007F { mapping(address => uint256) credits; function deposit(address[] calldata recipients) external payable {
uint256 perItem = msg.value / recipients.length; for (uint256 i; i < recipients.length; i++) { credits[recipients[i]] += perItem; } } }
