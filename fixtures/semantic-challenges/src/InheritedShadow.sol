// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {BaseState} from "./deps/BaseState.sol";
contract InheritedShadow is BaseState {
    function run(address target) external returns (uint256) {
        uint256 credits = 7;
        (bool ok,) = target.call("");
        require(ok);
        credits = 9;
        return credits;
    }
}
