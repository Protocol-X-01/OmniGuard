// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
abstract contract CreditState { address internal owner = msg.sender; mapping(address => uint256) internal credits; }
