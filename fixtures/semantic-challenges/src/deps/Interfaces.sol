// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
interface IAsset { function transfer(address to, uint256 amount) external returns (bool); }
interface IVoidAsset { function transfer(address to, uint256 amount) external; }
struct HashParts { string first; bytes second; }
