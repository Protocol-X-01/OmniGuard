// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PIndexAlias { function pick(address[] calldata entrants) external view returns(address) { uint256 seed = block.timestamp; uint256 index = uint256(keccak256(abi.encode(seed))) % entrants.length; return entrants[index]; } }
