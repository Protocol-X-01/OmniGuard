// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R012F { mapping(address => uint256) pending; function withdraw() external {
uint256 amount = pending[msg.sender]; pending[msg.sender] = 0; payable(msg.sender).transfer(amount); } }
