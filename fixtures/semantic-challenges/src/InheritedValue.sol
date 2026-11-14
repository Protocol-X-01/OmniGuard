// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {BaseState} from "./deps/BaseState.sol";
contract InheritedValue is BaseState {
    function deposit(address[] calldata recipients) external payable {
        for (uint256 i; i < recipients.length; i++) { credits[recipients[i]] += msg.value; }
    }
}
