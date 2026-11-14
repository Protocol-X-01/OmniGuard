// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
contract Case { struct Credit { uint256 amount; } mapping(address => Credit) credits; function deposit() external payable { credits[msg.sender].amount += msg.value; } function run(address payable to, bool left) external { Credit storage slot = credits[msg.sender]; uint256 n = slot.amount; if (left) { pay(to,n); return; } slot.amount=0; } function pay(address payable recipient, uint256 amount) private { (bool ok,) = recipient.call{value:amount}(""); require(ok); } }
