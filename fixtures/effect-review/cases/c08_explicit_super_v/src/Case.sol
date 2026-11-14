// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract B { uint internal credit=1; function _act(address to) internal virtual {(bool ok,)=to.call("");require(ok);} } contract D is B {function _act(address) internal override {} function run(address to) external {super._act(to);credit=0;}}
