// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R004F { function pay(address payable recipient) external { bool ok = recipient.send(1); require(ok); } }
