// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract B { uint internal credit=1; function _pay(address to) internal { (bool ok,)=to.call(""); require(ok); } }
