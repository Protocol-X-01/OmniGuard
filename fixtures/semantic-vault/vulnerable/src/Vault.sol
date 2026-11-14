// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {CreditState} from "./Base.sol";
import {IAsset as Asset} from "./Asset.sol";
contract SemanticVault is CreditState {
    function deposit() external payable { credits[msg.sender] += msg.value; }
    function originGuard() external view { require(tx.origin == owner); }
    function withdraw() external {
        uint256 amount = credits[msg.sender];
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
        credits[msg.sender] = 0;
    }
    function payAsset(Asset token, address to, uint256 amount) external {
        require(msg.sender == owner);
        token.transfer(to, amount);
    }
}
