// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R003F { function invoke(address target, bytes calldata data) external { (bool ok,) = target.call(data); require(ok); } }
