// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PUnused { function run(address target) external { (bool ok,) = target.call(""); } }
