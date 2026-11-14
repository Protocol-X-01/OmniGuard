// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IToken10F { function transfer(address to, uint256 amount) external returns(bool); }
contract R010F { IToken10F token; constructor(IToken10F configured) { token = configured; } function pay(address to, uint256 amount) external { require(token.transfer(to, amount)); } }
