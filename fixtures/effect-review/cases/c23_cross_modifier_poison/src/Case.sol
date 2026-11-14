// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
contract C {address owner;constructor(){owner=msg.sender;}modifier change(){owner=msg.sender;_;}modifier check(){require(msg.sender==owner);_;}function run(address target,bytes calldata data) external change check {(bool ok,)=target.delegatecall(data);require(ok);}}
