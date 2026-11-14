// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract NSingleTransfer { function pay(address payable to) external { to.transfer(1); } }
