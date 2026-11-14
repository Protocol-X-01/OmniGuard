// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PStaticcall { function run(address target) external view { target.staticcall(""); } }
