// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
interface I {function authorize(address who) external;}contract C {I checker;constructor(I c){checker=c;}modifier checked(){checker.authorize(msg.sender);_;}function run(address target,bytes calldata data) external checked {(bool ok,)=target.delegatecall(data);require(ok);}}
