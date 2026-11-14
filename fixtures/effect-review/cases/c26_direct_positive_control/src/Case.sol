// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function run(address to) external {(bool ok,)=to.call("");require(ok);credit=0;} }
