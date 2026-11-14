// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R012V { function batch(address payable[] calldata recipients) external payable {
for (uint256 i; i < recipients.length; i++) { recipients[i].transfer(1); } } }
