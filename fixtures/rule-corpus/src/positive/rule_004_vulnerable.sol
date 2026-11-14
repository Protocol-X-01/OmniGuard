// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R004V { function pay(address payable recipient) external { recipient.send(1); } }
