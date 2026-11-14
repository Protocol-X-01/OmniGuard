// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {BaseState} from "./deps/BaseState.sol";
contract InheritedState is BaseState {
    function deposit() external payable { credits[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amount = credits[msg.sender];
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
        credits[msg.sender] = 0;
    }
}
