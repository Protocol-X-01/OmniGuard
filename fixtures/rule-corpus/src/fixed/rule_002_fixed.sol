// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R002F { mapping(address => uint256) credits;
function withdraw() external { uint256 amount = credits[msg.sender]; credits[msg.sender] = 0; (bool ok,) = payable(msg.sender).call{value:amount}(""); require(ok); } }
