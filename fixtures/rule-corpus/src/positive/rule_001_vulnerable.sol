// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R001V { address owner = msg.sender; function enter() external view { require(tx.origin == owner); } }
