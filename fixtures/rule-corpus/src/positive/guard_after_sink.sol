// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PAfter { address owner = msg.sender; function sweep(address payable to) external { selfdestruct(to); require(msg.sender == owner); } }
