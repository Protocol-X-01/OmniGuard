// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
interface OverloadedAsset {
    function transfer(address to, uint256 amount) external returns (bool);
    function transfer(bytes32 tag, uint256 amount) external;
}
contract OverloadedToken {
    function pay(OverloadedAsset token, uint256 amount) external { token.transfer(msg.sender, amount); }
    function tag(OverloadedAsset token, uint256 amount) external { token.transfer(bytes32(0), amount); }
}
