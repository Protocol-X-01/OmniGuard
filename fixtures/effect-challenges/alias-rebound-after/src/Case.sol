// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Case { struct Credit { uint256 amount; } mapping(address => Credit) credits; mapping(address => Credit) alternate; function deposit() external payable { credits[msg.sender].amount += msg.value; } function run(address payable to) external { Credit storage slot = credits[msg.sender]; uint256 n = slot.amount; slot = alternate[msg.sender]; (bool ok,) = to.call{value:n}(""); require(ok); slot.amount = 0; } }
