// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NOwner { address owner = msg.sender; modifier restricted() { require(msg.sender == owner); _; }
function run(address target, bytes calldata data) external restricted { (bool ok,) = target.delegatecall(data); require(ok); } }
