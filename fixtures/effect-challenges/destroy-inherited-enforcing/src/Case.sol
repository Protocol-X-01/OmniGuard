// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Base { address internal owner; constructor() { owner = msg.sender; } modifier onlyOwner() { require(msg.sender == owner); _; } }
contract Case is Base { function close(address payable recipient) external onlyOwner { selfdestruct(recipient); } }
