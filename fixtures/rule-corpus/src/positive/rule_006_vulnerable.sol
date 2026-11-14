// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R006V { function sweep(address payable recipient) external { selfdestruct(recipient); } }
