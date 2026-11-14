// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NOverwrite { address immutable trusted; constructor(address implementation) { trusted = implementation; } function run(address target, bytes calldata data) external { target = trusted; (bool ok,) = target.delegatecall(data); require(ok); } }
