// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R003V { function invoke(address target, bytes calldata data) external { target.call(data); } }
