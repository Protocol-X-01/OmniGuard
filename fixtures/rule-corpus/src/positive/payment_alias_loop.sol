// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PPaymentAlias { mapping(address=>uint256) credits; function deposit(address[] calldata recipients) external payable { uint256 payment = msg.value; for(uint256 i; i<recipients.length; i++) { credits[recipients[i]] += payment; } } }
