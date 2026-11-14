// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R002V { mapping(address => uint256) credits;
function withdraw() external { uint256 amount = credits[msg.sender]; (bool ok,) = payable(msg.sender).call{value:amount}(""); require(ok); credits[msg.sender] = 0; } }
