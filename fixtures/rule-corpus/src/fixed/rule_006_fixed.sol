// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R006F { address owner = msg.sender; function sweep(address payable recipient) external { require(msg.sender == owner); selfdestruct(recipient); } }
