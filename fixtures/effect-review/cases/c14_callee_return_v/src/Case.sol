// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function _send(address to) private {(bool ok,)=to.call("");require(ok);return;} function run(address to) external {_send(to);credit=0;} }
