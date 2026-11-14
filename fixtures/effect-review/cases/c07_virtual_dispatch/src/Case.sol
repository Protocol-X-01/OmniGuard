// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
abstract contract B { uint internal credit=1; function _act(address to) internal virtual; function run(address to) external {_act(to);credit=0;} } contract D is B {function _act(address to) internal override {(bool ok,)=to.call("");require(ok);}}
