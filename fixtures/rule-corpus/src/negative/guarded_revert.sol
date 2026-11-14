// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NGuardRevert { address owner = msg.sender; error Denied(); function sweep(address payable to) external { if (msg.sender != owner) revert Denied(); selfdestruct(to); } }
