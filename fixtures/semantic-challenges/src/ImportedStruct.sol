// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {HashParts} from "./deps/Interfaces.sol";
contract ImportedStruct {
    function hash(HashParts calldata parts) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(parts.first, parts.second));
    }
}
