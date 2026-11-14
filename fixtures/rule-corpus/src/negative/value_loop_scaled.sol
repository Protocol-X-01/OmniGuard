// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NScaled { mapping(address=>uint256) credits; function deposit(address[] calldata recipients) external payable { for (uint256 i; i<recipients.length; i++) { credits[recipients[i]] += msg.value / recipients.length; } } }
