// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {IVoidAsset as Asset} from "./deps/Interfaces.sol";
contract ImportedVoid {
    function pay(Asset token, uint256 amount) external { token.transfer(msg.sender, amount); }
}
