// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IToken10V { function transfer(address to, uint256 amount) external returns(bool); }
contract R010V { IToken10V token; constructor(IToken10V configured) { token = configured; } function pay(address to, uint256 amount) external { token.transfer(to, amount); } }
