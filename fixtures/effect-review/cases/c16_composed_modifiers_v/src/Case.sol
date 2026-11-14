// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C { uint internal credit=1; function _pay(address to) internal { (bool ok,)=to.call(""); require(ok); } modifier pay(address to) {_pay(to);_;} modifier clear() {credit=0;_;} function run(address to) external pay(to) clear {} }
