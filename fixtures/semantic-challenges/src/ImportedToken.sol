// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {IAsset as Asset} from "./deps/Interfaces.sol";
contract ImportedToken {
    function pay(Asset token, uint256 amount) external { token.transfer(msg.sender, amount); }
}
