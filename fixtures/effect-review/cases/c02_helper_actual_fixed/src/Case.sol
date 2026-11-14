// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function _pay(address to) internal { (bool ok,)=to.call(""); require(ok); } function run(address to) external { credit=0; _pay(to); } }
