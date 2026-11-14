// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NEvent { event Seen(address who); function log() external { emit Seen(tx.origin); } }
