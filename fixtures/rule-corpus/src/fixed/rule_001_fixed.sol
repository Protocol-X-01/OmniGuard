// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R001F { address owner = msg.sender; function enter() external view { require(msg.sender == owner); } }
