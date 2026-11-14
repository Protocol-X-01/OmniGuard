// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PModifierAfter { address owner = msg.sender; modifier delayed() { _; require(msg.sender == owner); } function sweep(address payable to) external delayed { selfdestruct(to); } }
