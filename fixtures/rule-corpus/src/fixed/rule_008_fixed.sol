// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract R008F { bytes32 verifiedRandomness; address immutable oracle; constructor(address source) { oracle = source; }
function fulfill(bytes32 word) external { require(msg.sender == oracle); verifiedRandomness = word; }
function pick(address[] calldata entrants) external view returns(address) { return entrants[uint256(verifiedRandomness) % entrants.length]; } }
