// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PNested { address owner = msg.sender; function sweep(address payable to, bool enabled) external { if(enabled) { require(msg.sender == owner); } selfdestruct(to); } }
