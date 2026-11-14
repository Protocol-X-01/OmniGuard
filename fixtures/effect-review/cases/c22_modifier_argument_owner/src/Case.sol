// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C {address immutable owner;constructor(){owner=msg.sender;}modifier checked(address expected){require(msg.sender==expected);_;}function run(address target,bytes calldata data) external checked(owner) {(bool ok,)=target.delegatecall(data);require(ok);}}
