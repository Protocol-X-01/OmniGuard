// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C {modifier checked(address expected){require(msg.sender==expected);_;} function run(address expected,address target,bytes calldata data) external checked(expected) {(bool ok,)=target.delegatecall(data);require(ok);}}
