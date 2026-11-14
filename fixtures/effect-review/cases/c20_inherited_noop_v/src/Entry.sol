// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
import "./Guard.sol"; contract C is G {function run(address target,bytes calldata data) external trustedName {(bool ok,)=target.delegatecall(data);require(ok);}}
