// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NMessage { function check(bool ok) external view { require(ok, string(abi.encodePacked(tx.origin))); } }
