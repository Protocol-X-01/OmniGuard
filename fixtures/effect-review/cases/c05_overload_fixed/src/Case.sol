// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function _touch(address to) private {(bool ok,)=to.call("");require(ok);} function _touch(uint n) private {credit=n;} function run() external {_touch(uint(1));credit=0;} }
