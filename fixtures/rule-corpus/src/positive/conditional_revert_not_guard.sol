// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PConditional { address owner = msg.sender; error Denied(); function sweep(address payable to, bool enabled) external { if(msg.sender != owner) if(enabled) revert Denied(); selfdestruct(to); } }
