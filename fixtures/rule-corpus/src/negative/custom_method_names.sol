// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NHelper { function call(bytes calldata) external pure {} function send(uint256) external pure {} function transfer(address,uint256) external pure {} }
contract NNames { NHelper helper; function run() external { helper.call(""); helper.send(1); helper.transfer(msg.sender,1); } }
