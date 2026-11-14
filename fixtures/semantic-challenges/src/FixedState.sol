// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {BaseState} from "./deps/BaseState.sol";
contract FixedState is BaseState {
    function deposit() external payable { credits[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amount = credits[msg.sender];
        credits[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
